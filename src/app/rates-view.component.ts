import { Component, ChangeDetectionStrategy, input, output, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface EditableRates {
  bw: number;
  color: number;
  discount: number;
  surcharge: number;
}

@Component({
  selector: 'app-rates-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Manage Printing Rates</h3>
      </div>
      <form (submit)="$event.preventDefault(); saveRates.emit()">
        <div class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- B&W Rate -->
            <div>
              <label for="rate-bw" class="block text-sm font-medium text-gray-700 dark:text-gray-300">B&W Rate (per page)</label>
              <div class="mt-1 relative rounded-md shadow-sm">
                <div class="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span class="text-gray-500 sm:text-sm">₹</span></div>
                <input type="number" id="rate-bw" [value]="editableRates().bw" (input)="updateRate.emit({key: 'bw', value: +$event.target.value})" class="w-full pl-7 pr-12 rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-primary focus:ring-primary" step="0.01" min="0">
              </div>
            </div>
            <!-- Color Rate -->
            <div>
              <label for="rate-color" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color Rate (per page)</label>
              <div class="mt-1 relative rounded-md shadow-sm">
                <div class="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span class="text-gray-500 sm:text-sm">₹</span></div>
                <input type="number" id="rate-color" [value]="editableRates().color" (input)="updateRate.emit({key: 'color', value: +$event.target.value})" class="w-full pl-7 pr-12 rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-primary focus:ring-primary" step="0.01" min="0">
              </div>
            </div>
            <!-- Double-Sided Discount -->
            <div>
              <label for="rate-discount" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Double-Sided Discount</label>
              <div class="mt-1 relative rounded-md shadow-sm">
                <input type="number" id="rate-discount" [value]="editableRates().discount" (input)="updateRate.emit({key: 'discount', value: +$event.target.value})" class="w-full pr-12 rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-primary focus:ring-primary" min="0" max="100">
                <div class="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center"><span class="text-gray-500 sm:text-sm">%</span></div>
              </div>
            </div>
            <!-- Fast Track Surcharge -->
            <div>
              <label for="rate-surcharge" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Fast Track Surcharge</label>
                <div class="mt-1 relative rounded-md shadow-sm">
                <input type="number" id="rate-surcharge" [value]="editableRates().surcharge" (input)="updateRate.emit({key: 'surcharge', value: +$event.target.value})" class="w-full pr-12 rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:border-primary focus:ring-primary" min="0">
                <div class="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center"><span class="text-gray-500 sm:text-sm">%</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center space-x-3">
            @if(showSaveConfirmation()) {
            <div class="flex items-center space-x-2 text-green-600 dark:text-green-400 transition-opacity duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                <span class="text-sm font-medium">Saved!</span>
            </div>
            }
            <button type="button" (click)="cancelRateChanges.emit()" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">Cancel</button>
            <button type="submit" class="flex items-center space-x-2 bg-primary hover:bg-primary-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6a1 1 0 10-2 0v5.586L7.707 10.293zM3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 11-2 0V5H5v1a1 1 0 11-2 0V4z" /></svg>
                <span>Save Changes</span>
            </button>
        </div>
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatesViewComponent {
  editableRates = input.required<EditableRates>();
  showSaveConfirmation = input.required<boolean>();

  updateRate = output<{key: keyof EditableRates, value: number}>();
  saveRates = output();
  cancelRateChanges = output();
}
