import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationSettings } from '../api.service';

@Component({
  selector: 'app-settings-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Notification Settings</h3>
        </div>
        <div class="p-6 space-y-6">
          <!-- New Job Notification Setting -->
          <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border dark:border-gray-700">
            <div>
              <h4 class="font-semibold text-gray-800 dark:text-gray-200">Notify on New Job</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Get a desktop notification when a new job is submitted.</p>
            </div>
            <button type="button" (click)="toggleSetting.emit('newJob')" class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" [class]="editableSettings().newJob ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'" role="switch" [attr.aria-checked]="editableSettings().newJob">
              <span class="sr-only">Notify on New Job</span>
              <span aria-hidden="true" class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" [class]="editableSettings().newJob ? 'translate-x-5' : 'translate-x-0'"></span>
            </button>
          </div>

          <!-- Job Ready Notification Setting -->
          <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border dark:border-gray-700">
            <div>
              <h4 class="font-semibold text-gray-800 dark:text-gray-200">Notify when Job is Ready</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">Get a notification when a job's status changes to "Ready".</p>
            </div>
            <button type="button" (click)="toggleSetting.emit('jobReady')" class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" [class]="editableSettings().jobReady ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'" role="switch" [attr.aria-checked]="editableSettings().jobReady">
              <span class="sr-only">Notify when Job is Ready</span>
              <span aria-hidden="true" class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" [class]="editableSettings().jobReady ? 'translate-x-5' : 'translate-x-0'"></span>
            </button>
          </div>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center space-x-3">
            @if(showSaveConfirmation()) {
            <div class="flex items-center space-x-2 text-green-600 dark:text-green-400 transition-opacity duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
              <span class="text-sm font-medium">Saved!</span>
            </div>
            }
            <button type="button" (click)="cancelSettings.emit()" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
            <button type="button" (click)="saveSettings.emit()" class="flex items-center space-x-2 bg-primary hover:bg-primary-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
               <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6a1 1 0 10-2 0v5.586L7.707 10.293zM3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 11-2 0V5H5v1a1 1 0 11-2 0V4z" /></svg>
               <span>Save Settings</span>
           </button>
        </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsViewComponent {
  editableSettings = input.required<NotificationSettings>();
  showSaveConfirmation = input.required<boolean>();

  toggleSetting = output<keyof NotificationSettings>();
  saveSettings = output();
  cancelSettings = output();
}
