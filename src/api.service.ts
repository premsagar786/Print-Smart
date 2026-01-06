
import { Injectable, signal, computed, effect } from '@angular/core';

// --- Interfaces for our data models ---
export interface PrintJob {
  id: number;
  fileName: string;
  pages: number;
  status: JobStatus;
  isUserJob: boolean;
  token: string;
  cost: number;
  isFastOrder: boolean;
  paymentStatus: PaymentStatus;
  customerName?: string;
  upiId?: string;
  file?: File;
}

export interface PrintRates {
  bw: number;
  color: number;
  discount: number; // Stored as multiplier, e.g. 0.9
  surcharge: number; // Stored as multiplier, e.g. 1.25
}

export interface NotificationSettings {
  newJob: boolean;
  jobReady: boolean;
}

export type JobStatus = 'Queued' | 'Printing' | 'Ready' | 'Collected';
export type PaymentStatus = 'Paid' | 'Unpaid';

// --- Local Storage Keys ---
const QUEUE_STORAGE_KEY = 'printSmartQueue';
const RATES_STORAGE_KEY = 'printSmartRates';
const NOTIFICATION_SETTINGS_KEY = 'printSmartNotificationSettings';


@Injectable({
  providedIn: 'root',
})
export class ApiService {
  // --- STATE SIGNALS (The "Database") ---
  printQueue = signal<PrintJob[]>([]);
  rates = signal<PrintRates>({
    bw: 0.5,
    color: 2.0,
    discount: 0.9,
    surcharge: 1.25,
  });
  notificationSettings = signal<NotificationSettings>({
    newJob: true,
    jobReady: false,
  });
  isLoggedIn = signal<boolean>(false);

  private queueInterval: any;
  private previousQueueState: PrintJob[] = [];

  constructor() {
    this.loadStateFromStorage();
    this.previousQueueState = JSON.parse(JSON.stringify(this.printQueue())); // Initialize after loading

    // --- Core Effects for State Management & Simulation ---
    effect(() => {
      // Auto-save the queue to local storage whenever it changes.
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.printQueue()));
    });
    
    effect(() => {
        // Manage queue simulation based on login state
        if (this.isLoggedIn()) {
            this.stopQueueSimulation();
        } else {
            this.startQueueSimulation();
        }
    });

    effect(() => {
      // Watch for queue changes to trigger notifications
      const currentQueue = this.printQueue();
      if (this.notificationSettings().jobReady) {
        currentQueue.forEach(job => {
          const oldJob = this.previousQueueState.find(old => old.id === job.id);
          // Trigger if a job's status changes specifically to 'Ready'
          if (oldJob && oldJob.status !== 'Ready' && job.status === 'Ready') {
            this.showNotification('Job Ready!', {
              body: `Job ${job.token} (${job.fileName}) is ready for collection.`,
              icon: 'favicon.ico'
            });
          }
        });
      }
      this.previousQueueState = JSON.parse(JSON.stringify(currentQueue));
    });
  }

  // --- AUTHENTICATION ---
  login(): void {
    // Simplified login - no password required. This acts as a toggle into admin mode.
    this.isLoggedIn.set(true);
  }

  logout(): void {
    this.isLoggedIn.set(false);
  }
  
  // --- JOB MANAGEMENT ---
  addJob(job: Omit<PrintJob, 'id' | 'token' | 'isUserJob' >): PrintJob {
    const token = `PS-${Math.floor(Math.random() * 900) + 100}`;
    const newJob: PrintJob = {
      ...job,
      id: Date.now(),
      token: token,
      isUserJob: true, // All jobs added via this method are user jobs
    };
    
    this.printQueue.update(queue => 
      [newJob, ...queue].sort((a,b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages)
    );
    
    if(this.notificationSettings().newJob) {
        this.showNotification('New Online Order!', { body: `Job ${newJob.token} for "${newJob.fileName}" added to the queue.`, icon: 'favicon.ico' });
    }
    
    return newJob;
  }
  
  addWalkinJob(job: Omit<PrintJob, 'id' | 'token' | 'isUserJob' | 'file'>): void {
      const token = `FO-${Math.floor(Math.random() * 900) + 100}`;
      const newJob: PrintJob = {
          ...job,
          id: Date.now(),
          token: token,
          isUserJob: false,
      };
      this.printQueue.update(queue => [newJob, ...queue].sort((a, b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages));
      if(this.notificationSettings().newJob) {
        this.showNotification('New Walk-in Order!', { body: `Job ${newJob.token} added to the queue.`, icon: 'favicon.ico' });
    }
  }

  updateJobStatus(jobId: number, status: JobStatus): void {
      this.printQueue.update(queue => 
        queue.map(job => 
            job.id === jobId ? { ...job, status } : job
        )
      );
  }

  markAsPaid(jobId: number): void {
    this.printQueue.update(queue => 
      queue.map(job => 
          job.id === jobId ? { ...job, paymentStatus: 'Paid' } : job
      )
    );
  }

  // --- RATES & SETTINGS MANAGEMENT ---
  updateRates(newRates: PrintRates): void {
    this.rates.set(newRates);
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(newRates));
  }
  
  updateNotificationSettings(settings: NotificationSettings): void {
    this.notificationSettings.set(settings);
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  }

  // --- DATA PERSISTENCE & MOCK DATA ---
  private loadStateFromStorage(): void {
    // Load Rates
    try {
      const savedRates = localStorage.getItem(RATES_STORAGE_KEY);
      if (savedRates) {
        this.rates.set(JSON.parse(savedRates));
      } else {
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(this.rates()));
      }
    } catch (e) {
      console.error('Failed to parse rates from localStorage, resetting to default.', e);
      localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(this.rates()));
    }

    // Load Notification Settings
    try {
      const savedSettings = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (savedSettings) {
        this.notificationSettings.set(JSON.parse(savedSettings));
      } else {
        localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.notificationSettings()));
      }
    } catch (e) {
      console.error('Failed to parse notification settings from localStorage, resetting to default.', e);
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.notificationSettings()));
    }

    // Load Queue
    try {
      const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (savedQueue && JSON.parse(savedQueue).length > 0) {
        this.printQueue.set(JSON.parse(savedQueue));
      } else {
        this.initializeMockQueue();
      }
    } catch (e) {
      console.error('Failed to parse queue from localStorage', e);
      this.initializeMockQueue();
    }
  }

  private initializeMockQueue(): void {
    this.printQueue.set([
      { id: 1, fileName: 'thermo_notes.pdf', pages: 45, status: 'Printing', isUserJob: false, token: 'PS-123', cost: 22.5, isFastOrder: false, paymentStatus: 'Paid', customerName: 'Riya Sharma', upiId: 'riya.s@okicici' },
      { id: 2, fileName: 'urgent_assignment.pdf', pages: 10, status: 'Queued', isUserJob: false, token: 'PS-126', cost: 12.5, isFastOrder: true, paymentStatus: 'Paid', customerName: 'Arjun Verma', upiId: 'arjun.verma@ybl' },
      { id: 3, fileName: 'lab_report_final.docx', pages: 12, status: 'Queued', isUserJob: false, token: 'PS-124', cost: 6.0, isFastOrder: false, paymentStatus: 'Unpaid', customerName: 'Priya Patel' },
      { id: 4, fileName: 'presentation.ppt', pages: 30, status: 'Queued', isUserJob: false, token: 'PS-125', cost: 60.0, isFastOrder: false, paymentStatus: 'Paid', customerName: 'Sameer Khan', upiId: 'sameer.khan@okhdfc' },
      { id: 5, fileName: 'essay_draft.docx', pages: 5, status: 'Collected', isUserJob: false, token: 'PS-121', cost: 2.5, isFastOrder: false, paymentStatus: 'Paid', customerName: 'Anjali Singh', upiId: 'anjali.s@paytm' },
    ]);
  }
  
  // --- NOTIFICATION UTILITY ---
  private showNotification(title: string, options: NotificationOptions): void {
    if (!('Notification' in window)) {
      console.log('This browser does not support desktop notification');
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification(title, options);
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, options);
        }
      });
    }
  }

  // --- MOCK QUEUE SIMULATION ---
  private stopQueueSimulation(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
  }

  private startQueueSimulation(): void {
    this.stopQueueSimulation(); // Ensure no multiple intervals running
    this.queueInterval = setInterval(() => this.updateQueue(), 7000);
  }
  
  private updateQueue(): void {
    this.printQueue.update(currentQueue => {
        const printingJobId = currentQueue.find(j => j.status === 'Printing')?.id;
        const nextJobToPrintId = currentQueue
            .filter(j => j.status === 'Queued')
            .sort((a, b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages)[0]?.id;

        const readyJobs = currentQueue.filter(j => j.status === 'Ready' && !j.isUserJob);
        let jobToCollectId: number | undefined;
        if (readyJobs.length > 2 && Math.random() > 0.5) {
            jobToCollectId = readyJobs[0].id;
        }

        if (!printingJobId && !nextJobToPrintId && !jobToCollectId) {
            return currentQueue;
        }

        return currentQueue.map(job => {
            if (job.id === printingJobId) return { ...job, status: 'Ready' as JobStatus };
            if (job.id === nextJobToPrintId) return { ...job, status: 'Printing' as JobStatus };
            if (job.id === jobToCollectId) return { ...job, status: 'Collected' as JobStatus };
            return job;
        });
    });
  }
}
