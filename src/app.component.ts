import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

// --- Interfaces for our data models ---
interface PrintOptions {
  pages: string;
  totalPages: number;
  colorMode: 'bw' | 'color';
  sides: 'single' | 'double';
  copies: number;
  isFastOrder: boolean;
}

type JobStatus = 'Queued' | 'Printing' | 'Ready' | 'Collected';

interface PrintJob {
  id: number;
  fileName: string;
  pages: number;
  status: JobStatus;
  isUserJob: boolean;
  token: string;
  cost: number;
  isFastOrder: boolean;
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class AppComponent implements OnDestroy {
  // --- STATE MANAGEMENT ---
  appState = signal<'upload' | 'options' | 'tracking'>('upload');
  uploadedFile = signal<File | null>(null);
  printOptions = signal<PrintOptions>({
    pages: 'all',
    totalPages: 0,
    colorMode: 'bw',
    sides: 'single',
    copies: 1,
    isFastOrder: false,
  });
  userJob = signal<PrintJob | null>(null);
  printQueue = signal<PrintJob[]>([]);
  
  // --- ADMIN STATE ---
  isLoggedIn = signal<boolean>(false);
  adminView = signal<'queue' | 'completed' | 'payments' | 'rates'>('queue');
  queueFilter = signal<'all' | 'queued' | 'printing'>('all');

  // --- WALK-IN ORDER STATE ---
  showWalkinOrderModal = signal<boolean>(false);
  walkinOrderPages = signal<number>(1);
  walkinOrderColorMode = signal<'bw' | 'color'>('bw');

  // --- RATES MODAL STATE ---
  showRatesModal = signal<boolean>(false);

  // --- CONFIG & DYNAMIC RATES ---
  private queueInterval: any;
  costPerPageBw = signal(0.5);
  costPerPageColor = signal(2.0);
  doubleSidedDiscount = signal(0.9); // Stored as multiplier e.g. 0.9 for 10% discount
  fastOrderSurchargeMultiplier = signal(1.25); // Stored as multiplier e.g. 1.25 for 25% surcharge

  // --- ADMIN RATE EDITING STATE ---
  editableRates = signal({
    bw: this.costPerPageBw(),
    color: this.costPerPageColor(),
    discount: (1 - this.doubleSidedDiscount()) * 100,
    surcharge: (this.fastOrderSurchargeMultiplier() - 1) * 100
  });

  // --- COMPUTED SIGNALS (DERIVED STATE) ---

  baseCost = computed(() => {
    const options = this.printOptions();
    if (!options.totalPages) return 0;

    let pageCount = options.totalPages;
    if (options.pages !== 'all' && options.pages.includes('-')) {
        const [start, end] = options.pages.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
            pageCount = end - start + 1;
        }
    } else if (options.pages !== 'all' && !isNaN(parseInt(options.pages, 10))) {
        pageCount = options.pages.split(',').length;
    }

    const baseCostPerPage = options.colorMode === 'bw' ? this.costPerPageBw() : this.costPerPageColor();
    let finalCost = pageCount * baseCostPerPage * options.copies;

    if (options.sides === 'double') {
      finalCost *= this.doubleSidedDiscount();
    }
    return finalCost;
  });
  
  fastOrderSurcharge = computed(() => {
    if (!this.printOptions().isFastOrder) return 0;
    return this.baseCost() * (this.fastOrderSurchargeMultiplier() - 1);
  });

  totalCost = computed(() => {
    return this.baseCost() + this.fastOrderSurcharge();
  });
  
  estimatedWaitTime = computed(() => {
    const jobsAhead = this.printQueue().filter(job => job.status === 'Queued' || job.status === 'Printing').length;
    return jobsAhead * 2;
  });

  // --- ADMIN COMPUTED SIGNALS ---
  totalJobsToday = computed(() => this.printQueue().length);
  totalEarningsToday = computed(() => this.printQueue().reduce((sum, job) => sum + job.cost, 0));
  
  filteredQueue = computed(() => {
    const queue = this.printQueue();
    const filter = this.queueFilter();
    const liveStatuses: JobStatus[] = ['Queued', 'Printing', 'Ready'];
    const liveQueue = queue.filter(job => liveStatuses.includes(job.status));

    if (filter === 'queued') {
      return liveQueue.filter(job => job.status === 'Queued');
    }
    if (filter === 'printing') {
      return liveQueue.filter(job => job.status === 'Printing');
    }
    return liveQueue;
  });

  completedJobs = computed(() => {
      return this.printQueue().filter(job => job.status === 'Collected');
  });

  walkinOrderCost = computed(() => {
      const pages = this.walkinOrderPages();
      const costPerPage = this.walkinOrderColorMode() === 'bw' ? this.costPerPageBw() : this.costPerPageColor();
      return pages * costPerPage;
  });


  constructor() {
    this.initializeMockQueue();
    effect(() => {
      console.log(`App state changed to: ${this.appState()}`);
    });
  }

  // --- COMPONENT LOGIC & METHODS ---

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.uploadedFile.set(file);
      
      const simulatedPageCount = Math.floor(Math.random() * (100 - 5 + 1)) + 5;
      
      this.printOptions.update(options => ({
        ...options,
        totalPages: simulatedPageCount,
        pages: 'all'
      }));

      this.appState.set('options');
    }
  }
  
  startOver(): void {
    this.uploadedFile.set(null);
    this.userJob.set(null);
    this.appState.set('upload');
    this.printOptions.set({
        pages: 'all',
        totalPages: 0,
        colorMode: 'bw',
        sides: 'single',
        copies: 1,
        isFastOrder: false,
    });
  }
  
  updateOption(key: keyof PrintOptions, value: any) {
    if (key === 'copies' || key === 'totalPages') {
        value = parseInt(value, 10);
        if (isNaN(value)) value = 1;
    }
    this.printOptions.update(options => ({...options, [key]: value}));
  }

  submitJob(): void {
    const file = this.uploadedFile();
    if (!file) return;

    const token = `PS-${Math.floor(Math.random() * 900) + 100}`;
    const newJob: PrintJob = {
      id: Date.now(),
      fileName: file.name,
      pages: this.printOptions().totalPages,
      status: 'Queued',
      isUserJob: true,
      token: token,
      cost: this.totalCost(),
      isFastOrder: this.printOptions().isFastOrder,
    };
    
    this.userJob.set(newJob);
    this.printQueue.update(queue => [newJob, ...queue].sort((a,b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages));
    this.appState.set('tracking');
  }

  // --- ADMIN METHODS ---
  login(): void {
    this.isLoggedIn.set(true);
    this.stopQueueSimulation();
  }

  logout(): void {
    this.isLoggedIn.set(false);
    this.startQueueSimulation();
  }
  
  updateJobStatus(jobId: number, status: JobStatus): void {
      this.printQueue.update(queue => 
        queue.map(job => 
            job.id === jobId ? { ...job, status } : job
        )
      );
  }

  toggleWalkinOrderModal(): void {
    this.showWalkinOrderModal.update(v => !v);
    // Reset form on close
    if (!this.showWalkinOrderModal()) {
        this.walkinOrderPages.set(1);
        this.walkinOrderColorMode.set('bw');
    }
  }

  addWalkinOrder(): void {
      const token = `FO-${Math.floor(Math.random() * 900) + 100}`;
      const newJob: PrintJob = {
          id: Date.now(),
          fileName: 'Walk-in Order',
          pages: this.walkinOrderPages(),
          status: 'Queued',
          isUserJob: false,
          token: token,
          cost: this.walkinOrderCost(),
          isFastOrder: false,
      };
      this.printQueue.update(queue => [newJob, ...queue].sort((a, b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages));
      this.toggleWalkinOrderModal();
  }

  toggleRatesModal(): void {
    this.showRatesModal.update(v => !v);
  }

  updateEditableRate(key: keyof typeof this.editableRates.prototype, value: string): void {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
        this.editableRates.update(rates => ({...rates, [key]: numValue}));
    }
  }

  saveRates(): void {
    const newRates = this.editableRates();
    this.costPerPageBw.set(newRates.bw);
    this.costPerPageColor.set(newRates.color);
    this.doubleSidedDiscount.set(1 - (newRates.discount / 100));
    this.fastOrderSurchargeMultiplier.set(1 + (newRates.surcharge / 100));
    // Optionally show a success message
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

  initializeMockQueue(): void {
    // Initial dummy jobs
    this.printQueue.set([
      { id: 1, fileName: 'thermodynamics_notes.pdf', pages: 45, status: 'Printing', isUserJob: false, token: 'PS-123', cost: 22.5, isFastOrder: false },
      { id: 2, fileName: 'urgent_assignment.pdf', pages: 10, status: 'Queued', isUserJob: false, token: 'PS-126', cost: 12.5, isFastOrder: true },
      { id: 3, fileName: 'lab_report_final.docx', pages: 12, status: 'Queued', isUserJob: false, token: 'PS-124', cost: 6.0, isFastOrder: false },
      { id: 4, fileName: 'presentation_slides.ppt', pages: 30, status: 'Queued', isUserJob: false, token: 'PS-125', cost: 60.0, isFastOrder: false },
      { id: 5, fileName: 'essay_draft.docx', pages: 5, status: 'Collected', isUserJob: false, token: 'PS-121', cost: 2.5, isFastOrder: false },
    ]);
    
    if(!this.isLoggedIn()){
      this.startQueueSimulation();
    }
  }

  updateQueue(): void {
    this.printQueue.update(currentQueue => {
        // Find the IDs of jobs that need to change status
        const printingJobId = currentQueue.find(j => j.status === 'Printing')?.id;
        const nextJobToPrintId = currentQueue
            .filter(j => j.status === 'Queued')
            .sort((a, b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages)[0]?.id;

        const readyJobs = currentQueue.filter(j => j.status === 'Ready' && !j.isUserJob);
        let jobToCollectId: number | undefined;
        if (readyJobs.length > 2 && Math.random() > 0.5) {
            jobToCollectId = readyJobs[0].id;
        }

        // If no state transitions are possible, return the original array to prevent re-renders.
        if (!printingJobId && !nextJobToPrintId && !jobToCollectId) {
            return currentQueue;
        }

        // Create a new array with updated job objects (immutable update)
        return currentQueue.map(job => {
            if (job.id === printingJobId) {
                return { ...job, status: 'Ready' as JobStatus };
            }
            if (job.id === nextJobToPrintId) {
                return { ...job, status: 'Printing' as JobStatus };
            }
            if (job.id === jobToCollectId) {
                return { ...job, status: 'Collected' as JobStatus };
            }
            return job; // Return unchanged job
        });
    });
  }

  ngOnDestroy(): void {
    this.stopQueueSimulation();
  }

  getQrCodeUrl(token: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`PrintSmart-Token:${token}`)}`;
  }
}
