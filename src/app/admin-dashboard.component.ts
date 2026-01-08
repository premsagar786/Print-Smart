import { Component, ChangeDetectionStrategy, signal, computed, effect, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, PrintJob, PaymentStatus, JobStatus, NotificationSettings, PrintRates, AdminUser } from '../api.service';

import { QueueViewComponent } from './queue-view.component';
import { CompletedViewComponent } from './completed-view.component';
import { PaymentsViewComponent } from './payments-view.component';
import { RatesViewComponent } from './rates-view.component';
import { SettingsViewComponent } from './settings-view.component';
import { UsersViewComponent } from './users-view.component';

// --- Type declaration for external libraries ---
declare var Html5Qrcode: any;

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    QueueViewComponent,
    CompletedViewComponent,
    PaymentsViewComponent,
    RatesViewComponent,
    SettingsViewComponent,
    UsersViewComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnDestroy {
  public apiService = inject(ApiService);

  // --- ADMIN UI STATE ---
  adminView = signal<'queue' | 'completed' | 'payments' | 'rates' | 'settings' | 'users'>('queue');
  queueFilter = signal<'all' | 'queued' | 'printing'>('all');
  paymentFilter = signal<'all' | 'paid' | 'unpaid'>('all');
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
  
  private html5QrCode: any;
  showScannerModal = signal<boolean>(false);
  scannerMessage = signal<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  editableRates = signal({ bw: 0, color: 0, discount: 0, surcharge: 0 });
  editableNotificationSettings = signal<NotificationSettings>({ newJob: true, jobReady: false });
  userCreationError = signal<string | null>(null);
  userDeletionError = signal<string | null>(null);
  userUpdateError = signal<string | null>(null);

  // --- COMPUTED SIGNALS (DERIVED FROM SERVICE AND UI STATE) ---
  rates = computed(() => this.apiService.rates());
  currentUser = computed(() => this.apiService.currentUser());
  
  doubleSidedDiscountPercent = computed(() => Math.round((1 - this.rates().discount) * 100));
  fastOrderSurchargePercent = computed(() => Math.round((this.rates().surcharge - 1) * 100));
  
  totalJobsToday = computed(() => this.apiService.printQueue().length);
  totalEarningsToday = computed(() => this.apiService.printQueue().reduce((sum, job) => sum + job.cost, 0));
  
  filteredQueue = computed(() => {
    const queue = this.apiService.printQueue();
    const filter = this.queueFilter();
    const liveStatuses: JobStatus[] = ['Queued', 'Printing', 'Ready'];
    const liveQueue = queue.filter(job => liveStatuses.includes(job.status));

    if (filter === 'queued') return liveQueue.filter(job => job.status === 'Queued');
    if (filter === 'printing') return liveQueue.filter(job => job.status === 'Printing');
    return liveQueue;
  });

  completedJobs = computed(() => this.apiService.printQueue().filter(job => job.status === 'Collected'));
  
  filteredPayments = computed(() => {
    const queue = this.apiService.printQueue();
    const filter = this.paymentFilter();
    if (filter === 'paid') return queue.filter(job => job.paymentStatus === 'Paid');
    if (filter === 'unpaid') return queue.filter(job => job.paymentStatus === 'Unpaid');
    return queue;
  });

  walkinOrderCost = computed(() => {
      let cost = this.walkinOrderPages() * this.walkinOrderCopies() * (this.walkinOrderColorMode() === 'bw' ? this.rates().bw : this.rates().color);
      if (this.walkinOrderSides() === 'double') cost *= this.rates().discount;
      if (this.walkinOrderIsFastOrder()) cost *= this.rates().surcharge;
      return cost;
  });

  adminUsers = computed(() => this.apiService.getUsers());

  constructor() {
    this.syncEditableRates();
    this.syncEditableNotificationSettings();

    effect((onCleanup) => {
      this.stopAutoRefresh();
      if (this.isAutoRefreshEnabled() && this.apiService.isLoggedIn()) {
        this.autoRefreshTimer = setInterval(() => this.refreshDashboardData(), 30000);
      }
      onCleanup(() => this.stopAutoRefresh());
    });
  }

  private syncEditableRates(): void {
    effect(() => {
        const currentRates = this.rates();
        this.editableRates.set({
            bw: currentRates.bw,
            color: currentRates.color,
            discount: Math.round((1 - currentRates.discount) * 100),
            surcharge: Math.round((this.rates().surcharge - 1) * 100)
        });
    });
  }
  
  private syncEditableNotificationSettings(): void {
    effect(() => {
        this.editableNotificationSettings.set(this.apiService.notificationSettings());
    });
  }
  
  logout(): void {
    this.apiService.logout();
  }

  async refreshDashboardData(): Promise<void> {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    
    // Actually fetch/update data from the service
    this.apiService.refreshQueueData();
    
    // A short delay for UX, letting the user see the spinner
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    this.isRefreshing.set(false);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
  }

  // --- Modal Toggles & Actions ---
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

  onRateUpdate(event: { key: 'bw' | 'color' | 'discount' | 'surcharge', value: number }): void {
    this.editableRates.update(rates => ({ ...rates, [event.key]: event.value }));
  }

  cancelRateChanges(): void {
    this.syncEditableRates();
  }
  
  updateJobPriority(event: { id: number; priority: number }): void {
    this.apiService.updateJobPriority(event.id, event.priority);
  }

  private requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  toggleNotificationSetting(key: keyof NotificationSettings) {
    const currentValue = this.editableNotificationSettings()[key];
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

  createUser(user: AdminUser): void {
    this.userCreationError.set(null);
    this.userDeletionError.set(null);
    this.userUpdateError.set(null);
    const result = this.apiService.addUser(user);
    if (result.success) {
        this.showSaveConfirmation.set(true);
        setTimeout(() => this.showSaveConfirmation.set(false), 3000);
    } else {
        this.userCreationError.set(result.message || 'An unknown error occurred.');
    }
  }
  
  deleteUser(username: string): void {
    this.userCreationError.set(null);
    this.userDeletionError.set(null);
    this.userUpdateError.set(null);
    const result = this.apiService.deleteUser(username);
    if (result.success) {
        this.showSaveConfirmation.set(true);
        setTimeout(() => this.showSaveConfirmation.set(false), 3000);
    } else {
        this.userDeletionError.set(result.message || 'An unknown error occurred.');
    }
  }

  updateUserPassword(event: { username: string; password: string }): void {
    this.userCreationError.set(null);
    this.userDeletionError.set(null);
    this.userUpdateError.set(null);
    const result = this.apiService.updateUserPassword(event.username, event.password);
    if (result.success) {
      this.showSaveConfirmation.set(true);
      setTimeout(() => this.showSaveConfirmation.set(false), 3000);
    } else {
      this.userUpdateError.set(result.message || 'An unknown error occurred.');
    }
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
  }

  // --- Child Component Outputs ---
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
}