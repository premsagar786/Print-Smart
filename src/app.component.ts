
import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

// --- Type declaration for the QR Code scanner library ---
declare var Html5Qrcode: any;
declare var pdfjsLib: any;

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
type PaymentStatus = 'Paid' | 'Unpaid';

interface PrintJob {
  id: number;
  fileName: string;
  pages: number;
  status: JobStatus;
  isUserJob: boolean;
  token: string;
  cost: number;
  isFastOrder: boolean;
  paymentStatus: PaymentStatus;
  file?: File;
}

interface PrintRates {
  bw: number;
  color: number;
  discount: number; // Stored as multiplier, e.g. 0.9
  surcharge: number; // Stored as multiplier, e.g. 1.25
}

// --- Local Storage Keys ---
const QUEUE_STORAGE_KEY = 'printSmartQueue';
const RATES_STORAGE_KEY = 'printSmartRates';


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
  isCustomerRefreshing = signal<boolean>(false);
  
  // --- ADMIN STATE ---
  isLoggedIn = signal<boolean>(false);
  adminView = signal<'queue' | 'completed' | 'payments' | 'rates'>('queue');
  queueFilter = signal<'all' | 'queued' | 'printing'>('all');
  showSaveConfirmation = signal<boolean>(false);
  isRefreshing = signal<boolean>(false);
  isAutoRefreshEnabled = signal<boolean>(false);
  private autoRefreshTimer: any;


  // --- WALK-IN ORDER STATE ---
  showWalkinOrderModal = signal<boolean>(false);
  walkinOrderPages = signal<number>(1);
  walkinOrderColorMode = signal<'bw' | 'color'>('bw');
  walkinOrderCopies = signal<number>(1);
  walkinOrderSides = signal<'single' | 'double'>('single');
  walkinOrderIsFastOrder = signal<boolean>(false);

  // --- RATES MODAL STATE ---
  showRatesModal = signal<boolean>(false);

  // --- SCANNER STATE ---
  private html5QrCode: any;
  showScannerModal = signal<boolean>(false);
  scannerMessage = signal<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  // --- FILE PROCESSING STATE ---
  isProcessingFile = signal<boolean>(false);
  filePreviewUrl = signal<string | null>(null);


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
    discount: Math.round((1 - this.doubleSidedDiscount()) * 100),
    surcharge: Math.round((this.fastOrderSurchargeMultiplier() - 1) * 100)
  });

  // --- COMPUTED SIGNALS (DERIVED STATE) ---
  doubleSidedDiscountPercent = computed(() => {
    return Math.round((1 - this.doubleSidedDiscount()) * 100);
  });

  fastOrderSurchargePercent = computed(() => {
    return Math.round((this.fastOrderSurchargeMultiplier() - 1) * 100);
  });

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

  customerLiveQueue = computed(() => {
    const myJobId = this.userJob()?.id;
    // Show all jobs that are not 'Collected', but always include the user's own job regardless of its status.
    return this.printQueue().filter(job => job.status !== 'Collected' || job.id === myJobId);
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
      const copies = this.walkinOrderCopies();
      const costPerPage = this.walkinOrderColorMode() === 'bw' ? this.costPerPageBw() : this.costPerPageColor();
      
      let cost = pages * copies * costPerPage;

      if (this.walkinOrderSides() === 'double') {
          cost *= this.doubleSidedDiscount();
      }

      if (this.walkinOrderIsFastOrder()) {
          cost *= this.fastOrderSurchargeMultiplier();
      }

      return cost;
  });


  constructor() {
    this.loadStateFromStorage();
    
    // Auto-save the queue to local storage whenever it changes.
    effect(() => {
      // NOTE: The 'file' property of a job is not serializable and will be omitted from localStorage.
      // This is a known limitation of this frontend-only implementation.
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.printQueue()));
    });
    
    // Resets the rate editing form when the admin navigates to the rates tab
    effect(() => {
      if (this.adminView() === 'rates') {
        this.cancelRateChanges();
      }
    });

    // Effect to manage the auto-refresh timer
    effect((onCleanup) => {
      this.stopAutoRefresh(); // Clear previous interval on re-run
      const isEnabled = this.isAutoRefreshEnabled();

      if (isEnabled && this.isLoggedIn()) {
        this.autoRefreshTimer = setInterval(() => {
          this.refreshDashboardData();
        }, 30000); // 30 seconds
      }
  
      onCleanup(() => {
        this.stopAutoRefresh();
      });
    });
  }

  // --- DATA PERSISTENCE ---
  private loadStateFromStorage(): void {
    // Load Rates
    try {
      const savedRates = localStorage.getItem(RATES_STORAGE_KEY);
      if (savedRates) {
        const rates: PrintRates = JSON.parse(savedRates);
        this.costPerPageBw.set(rates.bw);
        this.costPerPageColor.set(rates.color);
        this.doubleSidedDiscount.set(rates.discount);
        this.fastOrderSurchargeMultiplier.set(rates.surcharge);
      }
    } catch (e) {
      console.error('Failed to parse rates from localStorage', e);
    }

    // Load Queue
    try {
      const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (savedQueue) {
        // NOTE: Jobs loaded from storage will not have the 'file' property.
        const queue: PrintJob[] = JSON.parse(savedQueue);
        this.printQueue.set(queue);
      } else {
        this.initializeMockQueue(); // Load default data if nothing is saved
      }
    } catch (e) {
      console.error('Failed to parse queue from localStorage', e);
      this.initializeMockQueue(); // Load default data on error
    }
  }

  // --- COMPONENT LOGIC & METHODS ---

  async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isProcessingFile.set(true);
    this.uploadedFile.set(file);
    this.filePreviewUrl.set(null);

    // Reset options and move to options screen to show loader
    this.printOptions.set({
      pages: 'all', totalPages: 0, colorMode: 'bw', sides: 'single', copies: 1, isFastOrder: false
    });
    this.appState.set('options');

    try {
      if (file.type === 'application/pdf') {
        await this.processPdf(file);
      } else if (file.type.startsWith('image/')) {
        this.processImage(file);
      } else {
        console.error('Unsupported file type:', file.type);
        alert('Unsupported file type. Please upload a PDF or an image.');
        this.startOver();
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('There was an error processing your file. Please try again.');
      this.startOver();
    } finally {
      this.isProcessingFile.set(false);
    }
  }

  private async processPdf(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.printOptions.update(options => ({ ...options, totalPages: pdf.numPages }));

    // Generate preview of the first page
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      const renderContext = { canvasContext: context, viewport: viewport };
      await page.render(renderContext).promise;
      this.filePreviewUrl.set(canvas.toDataURL('image/jpeg'));
    }
  }

  private processImage(file: File): void {
    this.printOptions.update(options => ({ ...options, totalPages: 1 }));
    const objectUrl = URL.createObjectURL(file);
    this.filePreviewUrl.set(objectUrl);
  }
  
  startOver(): void {
    this.uploadedFile.set(null);
    this.userJob.set(null);
    this.appState.set('upload');

    const currentPreview = this.filePreviewUrl();
    if (currentPreview && currentPreview.startsWith('blob:')) {
      URL.revokeObjectURL(currentPreview);
    }
    this.filePreviewUrl.set(null);

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

  submitJob(paymentStatus: PaymentStatus): void {
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
      paymentStatus: paymentStatus,
      file: file,
    };
    
    this.userJob.set(newJob);
    this.printQueue.update(queue => [newJob, ...queue].sort((a,b) => (b.isFastOrder ? 1 : 0) - (a.isFastOrder ? 1 : 0) || a.pages - b.pages));
    this.appState.set('tracking');
  }

  async refreshCustomerQueue(): Promise<void> {
    if (this.isCustomerRefreshing()) return;

    this.isCustomerRefreshing.set(true);
    // Simulate a quick refresh latency
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // This is the same logic the admin refresh and the timer uses.
    this.updateQueue(); 
    
    this.isCustomerRefreshing.set(false);
  }

  // --- ADMIN METHODS ---
  login(): void {
    this.isLoggedIn.set(true);
    this.stopQueueSimulation();
  }

  logout(): void {
    this.isLoggedIn.set(false);
    this.isAutoRefreshEnabled.set(false); // This will stop the timer via the effect
    this.startQueueSimulation();
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

  printJobDocument(job: PrintJob): void {
    if (!job.file) {
      alert('This job has no printable file. It might be a walk-in order or from a previous session.');
      return;
    }

    const fileURL = URL.createObjectURL(job.file);
    const printFrame = document.createElement('iframe');
    
    // Hide the iframe
    printFrame.style.position = 'absolute';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    
    document.body.appendChild(printFrame);

    const cleanup = () => {
      URL.revokeObjectURL(fileURL);
      if (document.body.contains(printFrame)) {
        document.body.removeChild(printFrame);
      }
    };

    printFrame.onload = () => {
      try {
        // This may fail for PDFs in some browsers due to cross-origin security policies.
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch (error) {
        console.error('Printing failed:', error);
        // Provide a fallback for the user.
        alert('Could not open print dialog automatically due to browser security.\nA new tab will open with your document. Please print it from there.');
        window.open(fileURL, '_blank');
      } finally {
        // Cleanup after a delay to ensure the print dialog has time to open.
        setTimeout(cleanup, 1000);
      }
    };
    
    // Setting the src triggers the load event.
    printFrame.src = fileURL;
  }

  async refreshDashboardData(): Promise<void> {
    if (this.isRefreshing()) return;

    this.isRefreshing.set(true);
    // Simulate network latency for a better UX feel
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // In a real app, you might re-fetch from an API. Here we simulate updates by running the queue logic.
    this.updateQueue(); 
    
    this.isRefreshing.set(false);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  toggleWalkinOrderModal(): void {
    this.showWalkinOrderModal.update(v => !v);
    // Reset form on close
    if (!this.showWalkinOrderModal()) {
        this.walkinOrderPages.set(1);
        this.walkinOrderColorMode.set('bw');
        this.walkinOrderCopies.set(1);
        this.walkinOrderSides.set('single');
        this.walkinOrderIsFastOrder.set(false);
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
          isFastOrder: this.walkinOrderIsFastOrder(),
          paymentStatus: 'Unpaid',
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
    const discountMultiplier = 1 - (newRates.discount / 100);
    this.doubleSidedDiscount.set(discountMultiplier);
    const surchargeMultiplier = 1 + (newRates.surcharge / 100);
    this.fastOrderSurchargeMultiplier.set(surchargeMultiplier);

    const ratesToSave: PrintRates = {
        bw: newRates.bw,
        color: newRates.color,
        discount: discountMultiplier,
        surcharge: surchargeMultiplier
    };

    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(ratesToSave));
    
    this.showSaveConfirmation.set(true);
    setTimeout(() => this.showSaveConfirmation.set(false), 3000);
  }

  cancelRateChanges(): void {
    this.editableRates.set({
      bw: this.costPerPageBw(),
      color: this.costPerPageColor(),
      discount: this.doubleSidedDiscountPercent(),
      surcharge: this.fastOrderSurchargePercent()
    });
  }

  // --- QR SCANNER METHODS ---
  toggleScannerModal(): void {
    const isOpening = !this.showScannerModal();
    this.showScannerModal.set(isOpening);
    this.scannerMessage.set(null);

    if (isOpening) {
      // Defer scanner initialization to ensure the DOM element is visible
      setTimeout(() => this.startScanner(), 100);
    } else {
      this.stopScanner();
    }
  }

  private startScanner(): void {
    const onScanSuccess = (decodedText: string) => {
      this.html5QrCode.pause();
      if (decodedText.startsWith('PrintSmart-Token:')) {
        const token = decodedText.split(':')[1];
        const job = this.printQueue().find(j => j.token === token);

        if (!job) {
          this.scannerMessage.set({ type: 'error', text: 'Invalid Token. Job not found.' });
        } else if (job.status !== 'Ready') {
          this.scannerMessage.set({ type: 'info', text: `Job ${token} is not ready. Status: ${job.status}` });
        } else {
          this.updateJobStatus(job.id, 'Collected');
          this.scannerMessage.set({ type: 'success', text: `Success! Job ${token} marked as collected.` });
        }
      } else {
        this.scannerMessage.set({ type: 'error', text: 'Invalid QR Code.' });
      }

      this.stopScanner();
      setTimeout(() => this.toggleScannerModal(), 2500);
    };

    const onScanFailure = (error: string) => {
      // This is called frequently, so we typically ignore it.
      // console.warn(`QR error = ${error}`);
    };

    try {
      this.html5QrCode = new Html5Qrcode('qr-reader');
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      this.html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
    } catch(err) {
      console.error("Error initializing scanner", err);
      this.scannerMessage.set({ type: 'error', text: 'Could not start QR scanner.' });
    }
  }

  private stopScanner(): void {
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      this.html5QrCode.stop().catch((err: any) => {
        console.error('Failed to stop QR scanner.', err);
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

  initializeMockQueue(): void {
    // Initial dummy jobs
    this.printQueue.set([
      { id: 1, fileName: 'thermodynamics_notes.pdf', pages: 45, status: 'Printing', isUserJob: false, token: 'PS-123', cost: 22.5, isFastOrder: false, paymentStatus: 'Paid' },
      { id: 2, fileName: 'urgent_assignment.pdf', pages: 10, status: 'Queued', isUserJob: false, token: 'PS-126', cost: 12.5, isFastOrder: true, paymentStatus: 'Paid' },
      { id: 3, fileName: 'lab_report_final.docx', pages: 12, status: 'Queued', isUserJob: false, token: 'PS-124', cost: 6.0, isFastOrder: false, paymentStatus: 'Unpaid' },
      { id: 4, fileName: 'presentation_slides.ppt', pages: 30, status: 'Queued', isUserJob: false, token: 'PS-125', cost: 60.0, isFastOrder: false, paymentStatus: 'Paid' },
      { id: 5, fileName: 'essay_draft.docx', pages: 5, status: 'Collected', isUserJob: false, token: 'PS-121', cost: 2.5, isFastOrder: false, paymentStatus: 'Paid' },
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
    this.stopScanner();
    this.stopAutoRefresh();
    const currentPreview = this.filePreviewUrl();
    if (currentPreview && currentPreview.startsWith('blob:')) {
      URL.revokeObjectURL(currentPreview);
    }
  }

  getQrCodeUrl(token: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`PrintSmart-Token:${token}`)}`;
  }
}
