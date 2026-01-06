import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Imported JobStatus to resolve a TypeScript error in the `filteredQueue` computed signal.
import { ApiService, PrintJob, PaymentStatus, JobStatus, NotificationSettings } from './api.service';

// --- Type declaration for external libraries ---
declare var Html5Qrcode: any;
declare var pdfjsLib: any;

// --- Interface for component-specific state ---
interface PrintOptions {
  pages: string;
  totalPages: number;
  colorMode: 'bw' | 'color';
  sides: 'single' | 'double';
  copies: number;
  isFastOrder: boolean;
}

const DARK_MODE_KEY = 'printSmartDarkMode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class AppComponent implements OnDestroy {
  // Inject the new ApiService to handle all data and logic
  public apiService = inject(ApiService);

  // --- UI STATE MANAGEMENT ---
  appState = signal<'upload' | 'options' | 'tracking'>('upload');
  uploadedFile = signal<File | null>(null);
  userJob = signal<PrintJob | null>(null);
  printOptions = signal<PrintOptions>({
    pages: 'all', totalPages: 0, colorMode: 'bw', sides: 'single', copies: 1, isFastOrder: false
  });
  
  isDarkMode = signal<boolean>(false);
  isCustomerRefreshing = signal<boolean>(false);

  // --- ADMIN UI STATE ---
  adminView = signal<'queue' | 'completed' | 'payments' | 'rates' | 'settings'>('queue');
  queueFilter = signal<'all' | 'queued' | 'printing'>('all');
  showSaveConfirmation = signal<boolean>(false);
  isRefreshing = signal<boolean>(false);
  isAutoRefreshEnabled = signal<boolean>(false);
  private autoRefreshTimer: any;

  // --- MODAL & FORM STATE ---
  showWalkinOrderModal = signal<boolean>(false);
  walkinOrderPages = signal<number>(1);
  walkinOrderColorMode = signal<'bw' | 'color'>('bw');
  walkinOrderCopies = signal<number>(1);
  walkinOrderSides = signal<'single' | 'double'>('single');
  walkinOrderIsFastOrder = signal<boolean>(false);
  
  showRatesModal = signal<boolean>(false);
  
  private html5QrCode: any;
  showScannerModal = signal<boolean>(false);
  scannerMessage = signal<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  isProcessingFile = signal<boolean>(false);
  filePreviewUrl = signal<string | null>(null);

  showCustomerInfoModal = signal<boolean>(false);
  showPaymentGatewayModal = signal<boolean>(false);
  customerName = signal<string>('');
  upiId = signal<string>('');
  paymentStatus = signal<'waiting' | 'confirmed' | 'failed'>('waiting');
  customerFormError = signal<string | null>(null);
  
  editableRates = signal({ bw: 0, color: 0, discount: 0, surcharge: 0 });
  editableNotificationSettings = signal<NotificationSettings>({ newJob: true, jobReady: false });


  // --- COMPUTED SIGNALS (DERIVED FROM SERVICE AND UI STATE) ---
  rates = computed(() => this.apiService.rates());
  
  doubleSidedDiscountPercent = computed(() => Math.round((1 - this.rates().discount) * 100));
  fastOrderSurchargePercent = computed(() => Math.round((this.rates().surcharge - 1) * 100));

  baseCost = computed(() => {
    const options = this.printOptions();
    if (!options.totalPages) return 0;

    let pageCount = options.totalPages;
    if (options.pages !== 'all' && options.pages.includes('-')) {
        const [start, end] = options.pages.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && end >= start) pageCount = end - start + 1;
    } else if (options.pages !== 'all' && !isNaN(parseInt(options.pages, 10))) {
        pageCount = options.pages.split(',').length;
    }

    const costPerPage = options.colorMode === 'bw' ? this.rates().bw : this.rates().color;
    let finalCost = pageCount * costPerPage * options.copies;
    if (options.sides === 'double') finalCost *= this.rates().discount;
    return finalCost;
  });
  
  fastOrderSurcharge = computed(() => this.printOptions().isFastOrder ? this.baseCost() * (this.rates().surcharge - 1) : 0);
  totalCost = computed(() => this.baseCost() + this.fastOrderSurcharge());
  
  estimatedWaitTime = computed(() => {
    const jobsAhead = this.apiService.printQueue().filter(job => job.status === 'Queued' || job.status === 'Printing').length;
    return jobsAhead * 2;
  });

  customerLiveQueue = computed(() => {
    const myJobId = this.userJob()?.id;
    return this.apiService.printQueue().filter(job => job.status !== 'Collected' || job.id === myJobId);
  });

  // --- ADMIN COMPUTED SIGNALS ---
  totalJobsToday = computed(() => this.apiService.printQueue().length);
  totalEarningsToday = computed(() => this.apiService.printQueue().reduce((sum, job) => sum + job.cost, 0));
  
  filteredQueue = computed(() => {
    const queue = this.apiService.printQueue();
    const filter = this.queueFilter();
    // FIX: Widened the type of `liveStatuses` to `JobStatus[]` to allow `Array.includes()` 
    // to correctly type-check against `job.status` of type `JobStatus`.
    const liveStatuses: JobStatus[] = ['Queued', 'Printing', 'Ready'];
    const liveQueue = queue.filter(job => liveStatuses.includes(job.status));

    if (filter === 'queued') return liveQueue.filter(job => job.status === 'Queued');
    if (filter === 'printing') return liveQueue.filter(job => job.status === 'Printing');
    return liveQueue;
  });

  completedJobs = computed(() => this.apiService.printQueue().filter(job => job.status === 'Collected'));

  walkinOrderCost = computed(() => {
      let cost = this.walkinOrderPages() * this.walkinOrderCopies() * (this.walkinOrderColorMode() === 'bw' ? this.rates().bw : this.rates().color);
      if (this.walkinOrderSides() === 'double') cost *= this.rates().discount;
      if (this.walkinOrderIsFastOrder()) cost *= this.rates().surcharge;
      return cost;
  });

  constructor() {
    this.initializeDarkMode();
    this.syncEditableRates();
    this.syncEditableNotificationSettings();


    // Effect to manage the auto-refresh timer
    effect((onCleanup) => {
      this.stopAutoRefresh();
      if (this.isAutoRefreshEnabled() && this.apiService.isLoggedIn()) {
        this.autoRefreshTimer = setInterval(() => this.refreshDashboardData(), 30000);
      }
      onCleanup(() => this.stopAutoRefresh());
    });
  }

  private initializeDarkMode(): void {
    const storedDarkMode = localStorage.getItem(DARK_MODE_KEY);
    this.isDarkMode.set(storedDarkMode ? storedDarkMode === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    effect(() => {
      document.documentElement.classList.toggle('dark', this.isDarkMode());
      localStorage.setItem(DARK_MODE_KEY, String(this.isDarkMode()));
    });
  }
  
  private syncEditableRates(): void {
    effect(() => {
        const currentRates = this.rates();
        this.editableRates.set({
            bw: currentRates.bw,
            color: currentRates.color,
            discount: Math.round((1 - currentRates.discount) * 100),
            surcharge: Math.round((currentRates.surcharge - 1) * 100)
        });
    });
  }
  
  private syncEditableNotificationSettings(): void {
    effect(() => {
        this.editableNotificationSettings.set(this.apiService.notificationSettings());
    });
  }


  toggleDarkMode(): void {
    this.isDarkMode.update(value => !value);
  }

  async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isProcessingFile.set(true);
    this.uploadedFile.set(file);
    this.filePreviewUrl.set(null);

    this.printOptions.set({
      pages: 'all', totalPages: 0, colorMode: 'bw', sides: 'single', copies: 1, isFastOrder: false
    });
    this.appState.set('options');

    try {
      if (file.type === 'application/pdf') await this.processPdf(file);
      else if (file.type.startsWith('image/')) this.processImage(file);
      else {
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.printOptions.update(options => ({ ...options, totalPages: pdf.numPages }));

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      this.filePreviewUrl.set(canvas.toDataURL('image/jpeg'));
    }
  }

  private processImage(file: File): void {
    this.printOptions.update(options => ({ ...options, totalPages: 1 }));
    this.filePreviewUrl.set(URL.createObjectURL(file));
  }
  
  startOver(): void {
    this.uploadedFile.set(null);
    this.userJob.set(null);
    this.appState.set('upload');

    const currentPreview = this.filePreviewUrl();
    if (currentPreview?.startsWith('blob:')) URL.revokeObjectURL(currentPreview);
    this.filePreviewUrl.set(null);

    this.printOptions.set({
      pages: 'all', totalPages: 0, colorMode: 'bw', sides: 'single', copies: 1, isFastOrder: false
    });
  }
  
  updateOption(key: keyof PrintOptions, value: any) {
    this.printOptions.update(options => ({...options, [key]: value}));
  }

  submitJob(paymentStatus: PaymentStatus): void {
    const file = this.uploadedFile();
    if (!file) return;

    const newJob = this.apiService.addJob({
      fileName: file.name,
      pages: this.printOptions().totalPages,
      status: 'Queued',
      cost: this.totalCost(),
      isFastOrder: this.printOptions().isFastOrder,
      paymentStatus: paymentStatus,
      customerName: this.customerName() || undefined,
      upiId: this.upiId() || undefined,
      file: file,
    });
    
    this.userJob.set(newJob);
    this.appState.set('tracking');
  }

  // --- PAYMENT FLOW METHODS ---
  initiatePayment(): void {
    this.customerFormError.set(null);
    this.showCustomerInfoModal.set(true);
  }

  proceedToPayment(): void {
    this.customerFormError.set(null);
    if (!this.customerName().trim() || !this.upiId().trim()) {
      this.customerFormError.set('Please fill out both your name and UPI ID.');
      return;
    }
    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(this.upiId())) {
      this.customerFormError.set('Please enter a valid UPI ID (e.g., yourname@bank).');
      return;
    }

    this.showCustomerInfoModal.set(false);
    this.paymentStatus.set('waiting');
    this.showPaymentGatewayModal.set(true);

    setTimeout(() => {
      this.paymentStatus.set('confirmed');
      setTimeout(() => {
        this.showPaymentGatewayModal.set(false);
        this.submitJob('Paid');
      }, 1500);
    }, 3000);
  }

  skipAndPayLater(): void {
    this.closeCustomerInfoModal();
    this.submitJob('Unpaid');
  }

  closeCustomerInfoModal(): void {
    this.showCustomerInfoModal.set(false);
    this.customerName.set('');
    this.upiId.set('');
    this.customerFormError.set(null);
  }

  async refreshCustomerQueue(): Promise<void> {
    if (this.isCustomerRefreshing()) return;
    this.isCustomerRefreshing.set(true);
    await new Promise(resolve => setTimeout(resolve, 500)); 
    // In a real app, this would be a fetch call. Here, we just re-read the signal.
    // The service's simulation will update the signal automatically.
    this.isCustomerRefreshing.set(false);
  }

  // --- ADMIN METHODS ---
  login(): void {
    this.apiService.login();
  }

  logout(): void {
    this.apiService.logout();
  }

  printJobDocument(job: PrintJob): void {
    if (!job.file) {
      alert('This job has no printable file. It might be a walk-in order or from a previous session.');
      return;
    }

    const fileURL = URL.createObjectURL(job.file);
    const printFrame = document.createElement('iframe');
    printFrame.style.display = 'none';
    document.body.appendChild(printFrame);

    const cleanup = () => {
      URL.revokeObjectURL(fileURL);
      document.body.removeChild(printFrame);
    };

    printFrame.onload = () => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch (error) {
        console.error('Printing failed:', error);
        alert('Could not open print dialog automatically due to browser security.\nA new tab will open. Please print it from there.');
        window.open(fileURL, '_blank');
      } finally {
        setTimeout(cleanup, 1000);
      }
    };
    printFrame.src = fileURL;
  }

  async refreshDashboardData(): Promise<void> {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    await new Promise(resolve => setTimeout(resolve, 500)); 
    this.isRefreshing.set(false);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
  }

  toggleWalkinOrderModal(): void {
    this.showWalkinOrderModal.update(v => !v);
    if (!this.showWalkinOrderModal()) {
        this.walkinOrderPages.set(1);
        this.walkinOrderColorMode.set('bw');
        this.walkinOrderCopies.set(1);
        this.walkinOrderSides.set('single');
        this.walkinOrderIsFastOrder.set(false);
    }
  }

  addWalkinOrder(): void {
      this.apiService.addWalkinJob({
          fileName: 'Walk-in Order',
          pages: this.walkinOrderPages(),
          status: 'Queued',
          cost: this.walkinOrderCost(),
          isFastOrder: this.walkinOrderIsFastOrder(),
          paymentStatus: 'Unpaid',
          customerName: 'Walk-in Customer',
      });
      this.toggleWalkinOrderModal();
  }

  toggleRatesModal(): void {
    this.showRatesModal.update(v => !v);
  }

  updateEditableRate(key: keyof ReturnType<typeof this.editableRates>, value: string): void {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) this.editableRates.update(rates => ({...rates, [key]: numValue}));
  }

  saveRates(): void {
    const newRates = this.editableRates();
    this.apiService.updateRates({
        bw: newRates.bw,
        color: newRates.color,
        discount: 1 - (newRates.discount / 100),
        surcharge: 1 + (newRates.surcharge / 100)
    });
    this.showSaveConfirmation.set(true);
    setTimeout(() => this.showSaveConfirmation.set(false), 3000);
  }

  cancelRateChanges(): void {
    this.syncEditableRates(); // Resyncs with the service state
  }
  
  // --- NOTIFICATION SETTINGS ---
  private requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  toggleNotificationSetting(key: keyof NotificationSettings) {
    const currentValue = this.editableNotificationSettings()[key];
    // If we are enabling a notification, ensure we have permission.
    if (!currentValue) {
      this.requestNotificationPermission();
    }
    this.editableNotificationSettings.update(settings => ({ ...settings, [key]: !currentValue }));
  }

  saveNotificationSettings(): void {
    this.apiService.updateNotificationSettings(this.editableNotificationSettings());
    this.showSaveConfirmation.set(true);
    setTimeout(() => this.showSaveConfirmation.set(false), 3000);
  }

  cancelNotificationSettings(): void {
    this.syncEditableNotificationSettings();
  }


  // --- QR SCANNER METHODS ---
  toggleScannerModal(): void {
    const isOpening = !this.showScannerModal();
    this.showScannerModal.set(isOpening);
    this.scannerMessage.set(null);
    if (isOpening) setTimeout(() => this.startScanner(), 100);
    else this.stopScanner();
  }

  private startScanner(): void {
    const onScanSuccess = (decodedText: string) => {
      this.html5QrCode.pause();
      const token = decodedText.startsWith('PrintSmart-Token:') ? decodedText.split(':')[1] : null;
      const job = token ? this.apiService.printQueue().find(j => j.token === token) : null;

      if (job) {
          if (job.status !== 'Ready') {
              this.scannerMessage.set({ type: 'info', text: `Job ${token} is not ready. Status: ${job.status}` });
          } else {
              this.apiService.updateJobStatus(job.id, 'Collected');
              this.scannerMessage.set({ type: 'success', text: `Success! Job ${token} marked as collected.` });
          }
      } else {
          this.scannerMessage.set({ type: 'error', text: 'Invalid QR Code or Job not found.' });
      }

      this.stopScanner();
      setTimeout(() => this.toggleScannerModal(), 2500);
    };

    try {
      this.html5QrCode = new Html5Qrcode('qr-reader');
      this.html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, () => {});
    } catch(err) {
      console.error("Error initializing scanner", err);
      this.scannerMessage.set({ type: 'error', text: 'Could not start QR scanner.' });
    }
  }

  private stopScanner(): void {
    if (this.html5QrCode?.isScanning) this.html5QrCode.stop().catch(console.error);
  }
  
  ngOnDestroy(): void {
    this.stopScanner();
    this.stopAutoRefresh();
    const currentPreview = this.filePreviewUrl();
    if (currentPreview?.startsWith('blob:')) URL.revokeObjectURL(currentPreview);
  }

  getQrCodeUrl(token: string): string {
    const upiData = `upi://pay?pa=printsmart@okhdfc&pn=PrintSmart%20Shop&am=${this.totalCost().toFixed(2)}&cu=INR&tn=Job${token}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiData)}`;
  }
}
