import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintJob } from '../api.service';

@Component({
  selector: 'app-payments-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold dark:text-gray-100">Payment History</h3>
            <div class="flex items-center space-x-2">
                <button (click)="filterChange.emit('all')" [class]="paymentFilter() === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">All</button>
                <button (click)="filterChange.emit('paid')" [class]="paymentFilter() === 'paid' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">Paid</button>
                <button (click)="filterChange.emit('unpaid')" [class]="paymentFilter() === 'unpaid' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">Unpaid</button>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr><th scope="col" class="px-6 py-3">Token</th><th scope="col" class="px-6 py-3">Customer</th><th scope="col" class="px-6 py-3">Amount</th><th scope="col" class="px-6 py-3">Job Status</th><th scope="col" class="px-6 py-3">Payment Status</th></tr>
                </thead>
                <tbody>
                    @for (job of jobs(); track job.id) {
                    <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"><th scope="row" class="px-6 py-4 font-bold text-primary dark:text-primary-400 whitespace-nowrap">{{job.token}}</th>
                    <td class="px-6 py-4">
                        <p class="font-semibold text-gray-800 dark:text-gray-200">{{job.customerName}}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{job.fileName}}</p>
                    </td>
                    <td class="px-6 py-4 font-medium text-gray-800 dark:text-gray-200">₹{{(job.cost || 0).toFixed(2)}}</td>
                    <td class="px-6 py-4"><span class="font-semibold px-2.5 py-1 rounded-full text-xs" [class]="{
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300': job.status === 'Queued',
                        'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300': job.status === 'Printing',
                        'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': job.status === 'Ready',
                        'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200': job.status === 'Collected'
                    }">{{job.status}}</span></td>
                    <td class="px-6 py-4"><span class="font-semibold px-2.5 py-1 rounded-full text-xs" [class]="{
                        'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': job.paymentStatus === 'Paid',
                        'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200': job.paymentStatus === 'Unpaid'
                    }" [title]="job.paymentStatus === 'Paid' ? 'Paid via UPI: ' + job.upiId : 'Not Paid'">{{job.paymentStatus}}</span></td>
                    </tr>
                    } @empty {
                        <tr>
                        <td colspan="5" class="text-center py-12 text-gray-500 dark:text-gray-400">No jobs match the current filter.</td>
                    </tr>
                    }
                </tbody>
            </table>
        </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsViewComponent {
  jobs = input.required<PrintJob[]>();
  paymentFilter = input.required<'all' | 'paid' | 'unpaid'>();
  filterChange = output<'all' | 'paid' | 'unpaid'>();
}
