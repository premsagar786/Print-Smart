import { Component, ChangeDetectionStrategy, signal, computed, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, PrintJob, PaymentStatus, JobStatus, NotificationSettings } from './api.service';
import { AdminDashboardComponent } from './app/admin-dashboard.component';

// --- Type declaration for external libraries ---
declare var heic2any: any;

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
  imports: [CommonModule, AdminDashboardComponent],
})
export class AppComponent implements OnDestroy {
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

  // --- ADMIN LOGIN STATE ---
  showAdminLogin = signal<boolean>(false);
  adminUsername = signal<string>('');
  adminPassword = signal<string>('');
  loginError = signal<string | null>(null);

  // --- MODAL & FORM STATE ---
  showRatesModal = signal<boolean>(false);
  isProcessingFile = signal<boolean>(false);
  processingMessage = signal<string>('');
  filePreviewUrl = signal<string | null>(null);
  showCustomerInfoModal = signal<boolean>(false);
  showPaymentGatewayModal = signal<boolean>(false);
  customerName = signal<string>('');
  upiId = signal<string>('');
  paymentStatus = signal<'waiting' | 'confirmed' | 'failed'>('waiting');
  customerFormError = signal<string | null>(null);

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

  constructor() {
    this.initializeDarkMode();
  }

  private initializeDarkMode(): void {
    const storedDarkMode = localStorage.getItem(DARK_MODE_KEY);
    this.isDarkMode.set(storedDarkMode ? storedDarkMode === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    effect(() => {
      document.documentElement.classList.toggle('dark', this.isDarkMode());
      localStorage.setItem(DARK_MODE_KEY, String(this.isDarkMode()));
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
    this.processingMessage.set('Preparing file...');
    this.filePreviewUrl.set(null);

    this.printOptions.set({
      pages: 'all', totalPages: 0, colorMode: 'bw', sides: 'single', copies: 1, isFastOrder: false
    });
    this.appState.set('options');

    try {
      const fileType = file.type.toLowerCase();
      const fileName = file.name.toLowerCase();

      if (file.type === 'application/pdf') {
        this.processingMessage.set('Analyzing PDF...');
        await this.processPdf(file);
      } else if (fileType.startsWith('image/heic') || fileType.startsWith('image/heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
        this.processingMessage.set('Converting HEIC image...');
        const convertedFile = await this.processHeic(file);
        this.uploadedFile.set(convertedFile);
        this.processingMessage.set('Generating preview...');
        this.processImage(convertedFile);
      } else if (file.type.startsWith('image/')) {
        this.uploadedFile.set(file);
        this.processingMessage.set('Generating preview...');
        this.processImage(file);
      } else {
        alert('Unsupported file type. Please upload a PDF or an image.');
        this.startOver();
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('There was an error processing your file. Please try again.');
      this.startOver();
    } finally {
      this.isProcessingFile.set(false);
      this.processingMessage.set('');
    }
  }

  private async processPdf(file: File): Promise<void> {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      console.error("pdf.js is not loaded.");
      alert("Error: The PDF processing library could not be loaded. Please try again.");
      this.startOver();
      return;
    }

    this.uploadedFile.set(file);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.6.347/pdf.worker.min.js`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    this.printOptions.update(options => ({ ...options, totalPages: pdf.numPages }));

    this.processingMessage.set('Generating preview...');
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

  private async processHeic(file: File): Promise<File> {
    const convertedBlob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.8,
    });
    const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpeg');
    return new File([finalBlob], newFileName, { type: 'image/jpeg' });
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
    this.isCustomerRefreshing.set(false);
  }

  // --- ADMIN LOGIN METHODS ---
  showLoginPage(): void {
    this.loginError.set(null);
    this.showAdminLogin.set(true);
  }

  hideLoginPage(): void {
    this.showAdminLogin.set(false);
    this.adminUsername.set('');
    this.adminPassword.set('');
    this.loginError.set(null);
  }
  
  attemptLogin(): void {
    this.loginError.set(null);
    const success = this.apiService.login(this.adminUsername(), this.adminPassword());
    if (!success) {
      this.loginError.set('Invalid username or password.');
    } else {
      this.hideLoginPage();
    }
  }

  logout(): void {
    this.apiService.logout();
    this.hideLoginPage();
  }

  toggleRatesModal(): void {
    this.showRatesModal.update(v => !v);
  }
  
  ngOnDestroy(): void {
    const currentPreview = this.filePreviewUrl();
    if (currentPreview?.startsWith('blob:')) URL.revokeObjectURL(currentPreview);
  }

  getQrCodeUrl(token: string): string {
    const upiData = `upi://pay?pa=printsmart@okhdfc&pn=PrintSmart%20Shop&am=${this.totalCost().toFixed(2)}&cu=INR&tn=Job${token}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiData)}`;
  }
}