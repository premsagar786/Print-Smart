import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintJob } from '../api.service';

@Component({
  selector: 'app-completed-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-4 border-b dark:border-gray-700"><h3 class="text-xl font-bold dark:text-gray-100">Completed Jobs Today</h3></div>
        @if(jobs().length > 0) {
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr><th scope="col" class="px-6 py-3">Token</th><th scope="col" class="px-6 py-3">Details</th><th scope="col" class="px-6 py-3">Pages</th><th scope="col" class="px-6 py-3">Cost</th></tr>
                </thead>
                <tbody>
                    @for (job of jobs(); track job.id) {
                    <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"><th scope="row" class="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{{job.token}}</th>
                    <td class="px-6 py-4">
                        <p class="font-semibold text-gray-800 dark:text-gray-200">{{job.fileName}}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{job.customerName}}</p>
                    </td>
                    <td class="px-6 py-4">{{job.pages}}</td><td class="px-6 py-4 dark:text-gray-200">₹{{(job.cost || 0).toFixed(2)}}</td></tr>
                    }
                </tbody>
            </table>
        </div>
        } @else {
            <p class="text-center py-12 text-gray-500 dark:text-gray-400">No jobs have been collected yet today.</p>
        }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompletedViewComponent {
  jobs = input.required<PrintJob[]>();
}
