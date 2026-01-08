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
  priority: number; // 1: High, 2: Normal, 3: Low
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

export interface AdminUser {
  username: string;
  password: string;
}

export type JobStatus = 'Queued' | 'Printing' | 'Ready' | 'Collected';
export type PaymentStatus = 'Paid' | 'Unpaid';

// --- Local Storage Keys ---
const QUEUE_STORAGE_KEY = 'printSmartQueue';
const RATES_STORAGE_KEY = 'printSmartRates';
const NOTIFICATION_SETTINGS_KEY = 'printSmartNotificationSettings';
const ADMIN_USERS_STORAGE_KEY = 'printSmartAdminUsers';


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
  isLoggedIn = signal<boolean>(true);
  adminUsers = signal<AdminUser[]>([]);
  currentUser = signal<AdminUser | null>(null);

  private queueInterval: any;
  private previousQueueState: PrintJob[] = [];

  constructor() {
    this.loadStateFromStorage();
    this.currentUser.set({ username: 'admin', password: '' });
    this.previousQueueState = JSON.parse(JSON.stringify(this.printQueue())); // Initialize after loading

    // --- Core Effects for State Management & Simulation ---
    effect(() => {
      // Auto-save the queue to local storage whenever it changes.
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.printQueue()));
    });
    
    // The customer-facing queue simulation is no longer needed
    this.stopQueueSimulation();

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
  addUser(user: AdminUser): { success: boolean, message?: string } {
    const existingUser = this.adminUsers().find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (existingUser) {
      return { success: false, message: 'Username already exists.' };
    }
    this.adminUsers.update(users => [...users, user]);
    localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify(this.adminUsers()));
    return { success: true };
  }
  
  deleteUser(username: string): { success: boolean; message?: string } {
    if (username.toLowerCase() === 'admin') {
      return { success: false, message: "The default 'admin' user cannot be deleted." };
    }
    if (username.toLowerCase() === this.currentUser()?.username.toLowerCase()) {
      return { success: false, message: 'You cannot delete your own account.' };
    }
    this.adminUsers.update(users => users.filter(u => u.username !== username));
    localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify(this.adminUsers()));
    return { success: true };
  }

  updateUserPassword(username: string, newPassword: string): { success: boolean; message?: string } {
    if (username.toLowerCase() === this.currentUser()?.username.toLowerCase()) {
      return { success: false, message: 'You cannot change your own password from this panel.' };
    }

    const users = this.adminUsers();
    const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

    if (userIndex === -1) {
      return { success: false, message: 'User not found.' };
    }

    const updatedUsers = [...users];
    updatedUsers[userIndex] = { ...updatedUsers[userIndex], password: newPassword };

    this.adminUsers.set(updatedUsers);
    localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify(this.adminUsers()));
    
    return { success: true };
  }

  getUsers(): AdminUser[] {
    // Return users without passwords for security, though in this prototype it's all local.
    return this.adminUsers().map(u => ({ username: u.username, password: '' }));
  }
  
  // --- JOB MANAGEMENT ---
  addJob(job: Omit<PrintJob, 'id' | 'token' | 'isUserJob' | 'priority'>): PrintJob {
    const token = `PS-${Math.floor(Math.random() * 900) + 100}`;
    const newJob: PrintJob = {
      ...job,
      id: Date.now(),
      token: token,
      isUserJob: true, // All jobs added via this method are user jobs
      priority: 2, // Default to Normal priority
    };
    
    this.printQueue.update(queue => this._sortQueue([newJob, ...queue]));
    
    if(this.notificationSettings().newJob) {
        this.showNotification('New Online Order!', { body: `Job ${newJob.token} for "${newJob.fileName}" added to the queue.`, icon: 'favicon.ico' });
    }
    
    return newJob;
  }
  
  addWalkinJob(job: Omit<PrintJob, 'id' | 'token' | 'isUserJob' | 'file' | 'priority'>): void {
      const token = `FO-${Math.floor(Math.random() * 900) + 100}`;
      const newJob: PrintJob = {
          ...job,
          id: Date.now(),
          token: token,
          isUserJob: false,
          priority: 2, // Default to Normal priority
      };
      this.printQueue.update(queue => this._sortQueue([newJob, ...queue]));
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

  updateJobPriority(jobId: number, priority: number): void {
    this.printQueue.update(queue => {
      const job = queue.find(j => j.id === jobId);
      if (job) {
        job.priority = priority;
      }
      return this._sortQueue([...queue]); // Re-sort the whole queue
    });
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
    // Load Admin Users
    try {
      const savedUsers = localStorage.getItem(ADMIN_USERS_STORAGE_KEY);
      if (savedUsers && JSON.parse(savedUsers).length > 0) {
        this.adminUsers.set(JSON.parse(savedUsers));
      } else {
        const defaultUser = { username: 'admin', password: 'password123' };
        this.adminUsers.set([defaultUser]);
        localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify([defaultUser]));
      }
    } catch (e) {
      console.error('Failed to parse admin users from localStorage, resetting to default.', e);
      const defaultUser = { username: 'admin', password: 'password123' };
      this.adminUsers.set([defaultUser]);
      localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify([defaultUser]));
    }
    
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
        this.printQueue.set(this._sortQueue(JSON.parse(savedQueue)));
      } else {
        this.initializeMockQueue();
      }
    } catch (e) {
      console.error('Failed to parse queue from localStorage', e);
      this.initializeMockQueue();
    }
  }

  private initializeMockQueue(): void {
    this.printQueue.set(this._sortQueue([
      { id: 1, fileName: 'thermo_notes.pdf', pages: 45, status: 'Printing', isUserJob: false, token: 'PS-123', cost: 22.5, isFastOrder: false, paymentStatus: 'Paid', priority: 2, customerName: 'Riya Sharma', upiId: 'riya.s@okicici' },
      { id: 2, fileName: 'urgent_assignment.pdf', pages: 10, status: 'Queued', isUserJob: false, token: 'PS-126', cost: 12.5, isFastOrder: true, paymentStatus: 'Paid', priority: 1, customerName: 'Arjun Verma', upiId: 'arjun.verma@ybl' },
      { id: 3, fileName: 'lab_report_final.docx', pages: 12, status: 'Queued', isUserJob: false, token: 'PS-124', cost: 6.0, isFastOrder: false, paymentStatus: 'Unpaid', priority: 2, customerName: 'Priya Patel' },
      { id: 4, fileName: 'presentation.ppt', pages: 30, status: 'Queued', isUserJob: false, token: 'PS-125', cost: 60.0, isFastOrder: false, paymentStatus: 'Paid', priority: 3, customerName: 'Sameer Khan', upiId: 'sameer.khan@okhdfc' },
      { id: 5, fileName: 'essay_draft.docx', pages: 5, status: 'Collected', isUserJob: false, token: 'PS-121', cost: 2.5, isFastOrder: false, paymentStatus: 'Paid', priority: 2, customerName: 'Anjali Singh', upiId: 'anjali.s@paytm' },
    ]));
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
  
  public refreshQueueData(): void {
    // 1. Simulate existing jobs progressing through the queue
    this.updateQueue();

    // 2. Occasionally, add a new mock job to simulate new customer activity
    if (Math.random() < 0.2) { // 20% chance of a new job on refresh
      const mockFileNames = ['biology_notes.pdf', 'resume_v4_final.docx', 'project_report_q3.pdf', 'event_flyer.png', 'lab_manual.pdf'];
      const mockCustomers = ['Amit Kumar', 'Sneha Reddy', 'Vikram Singh', 'Pooja Desai'];
      
      const randomFile = mockFileNames[Math.floor(Math.random() * mockFileNames.length)];
      const randomCustomer = mockCustomers[Math.floor(Math.random() * mockCustomers.length)];
      const randomPages = Math.floor(Math.random() * 40) + 2;
      const isFast = Math.random() > 0.8;
      const isPaid = Math.random() > 0.3;
      const cost = randomPages * (Math.random() > 0.3 ? this.rates().bw : this.rates().color) * (isFast ? this.rates().surcharge : 1);
      
      this.addJob({
        fileName: randomFile,
        pages: randomPages,
        status: 'Queued',
        cost: cost,
        isFastOrder: isFast,
        paymentStatus: isPaid ? 'Paid' : 'Unpaid',
        customerName: randomCustomer,
        upiId: isPaid ? `${randomCustomer.split(' ')[0].toLowerCase()}@okbank` : undefined,
        file: new File(["mock content"], randomFile, { type: 'application/octet-stream' })
      });
    }
  }

  private _sortQueue(queue: PrintJob[]): PrintJob[] {
    return queue.sort((a, b) => {
      // 1. Priority (lower is better)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 2. Fast Track (true is better)
      if (a.isFastOrder !== b.isFastOrder) {
        return Number(b.isFastOrder) - Number(a.isFastOrder);
      }
      // 3. Time submitted (lower ID is better)
      return a.id - b.id;
    });
  }

  private updateQueue(): void {
    this.printQueue.update(currentQueue => {
        const printingJobId = currentQueue.find(j => j.status === 'Printing')?.id;
        // The queue is always sorted, so the first 'Queued' job is the correct next one.
        const nextJobToPrintId = currentQueue.find(j => j.status === 'Queued')?.id;

        const readyJobs = currentQueue.filter(j => j.status === 'Ready' && !j.isUserJob);
        let jobToCollectId: number | undefined;
        if (readyJobs.length > 2 && Math.random() > 0.5) {
            jobToCollectId = readyJobs[0].id;
        }

        if (!printingJobId && !nextJobToPrintId && !jobToCollectId) {
            return currentQueue;
        }

        return currentQueue.map(job => {
            // If a job is printing, it becomes ready.
            if (job.id === printingJobId) return { ...job, status: 'Ready' as JobStatus };

            // If there is NO job currently printing, the next queued job starts printing.
            if (!printingJobId && job.id === nextJobToPrintId) return { ...job, status: 'Printing' as JobStatus };

            // A ready job gets collected.
            if (job.id === jobToCollectId) return { ...job, status: 'Collected' as JobStatus };

            // Otherwise, the job remains unchanged.
            return job;
        });
    });
  }
}
