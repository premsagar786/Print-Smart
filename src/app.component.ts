import { Component, ChangeDetectionStrategy, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';
import { AdminDashboardComponent } from './app/admin-dashboard.component';

const DARK_MODE_KEY = 'printSmartDarkMode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, AdminDashboardComponent],
})
export class AppComponent {
  public apiService = inject(ApiService);

  // --- UI STATE MANAGEMENT ---
  isDarkMode = signal<boolean>(false);

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
}
