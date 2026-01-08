import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrintJob, JobStatus, PaymentStatus } from '../api.service';

@Component({
  selector: 'app-queue-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
      <!-- Loading Overlay -->
      @if (isRefreshing()) {
        <div class="absolute inset-0 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm flex items-center justify-center z-10">
          <div class="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Refreshing Queue...</span>
          </div>
        </div>
      }

      <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
        <h3 class="text-xl font-bold dark:text-gray-100">Live Orders</h3>
        <div class="flex items-center space-x-2">
            <button (click)="filterChange.emit('all')" [class]="queueFilter() === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">All</button>
            <button (click)="filterChange.emit('queued')" [class]="queueFilter() === 'queued' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">Pending</button>
            <button (click)="filterChange.emit('printing')" [class]="queueFilter() === 'printing' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'" class="px-3 py-1 text-xs font-semibold rounded-full transition">Running</button>
        </div>
      </div>
      @if(jobs().length > 0) {
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                  <tr>
                      <th scope="col" class="px-6 py-3">Token</th>
                      <th scope="col" class="px-6 py-3">Details</th>
                      <th scope="col" class="px-6 py-3">Cost</th>
                      <th scope="col" class="px-6 py-3">Priority</th>
                      <th scope="col" class="px-6 py-3">Status</th>
                      <th scope="col" class="px-6 py-3">Actions</th>
                  </tr>
              </thead>
              <tbody>
                @for (job of jobs(); track job.id) {
                  <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600" [class.bg-primary-50]="job.isUserJob" [class.dark:bg-primary-900/20]="job.isUserJob">
                      <th scope="row" class="px-6 py-4 font-bold text-primary dark:text-primary-400 whitespace-nowrap flex items-center">
                        <span>{{job.token}}</span>
                        @if(job.isFastOrder) {
                          <span class="ml-2 text-xs font-bold text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-900/50 px-2 py-0.5 rounded-full">FAST</span>
                        }
                      </th>
                      <td class="px-6 py-4">
                        <p class="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-xs">{{job.fileName}}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{job.customerName}}</p>
                      </td>
                      <td class="px-6 py-4">
                        <span class="dark:text-gray-200">₹{{(job.cost || 0).toFixed(2)}}</span>
                        <span class="ml-2 font-semibold px-2 py-0.5 rounded-full text-xs"
                          [class]="{
                            'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': job.paymentStatus === 'Paid',
                            'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200': job.paymentStatus === 'Unpaid'
                          }" [title]="job.paymentStatus === 'Paid' ? 'Paid via UPI: ' + job.upiId : 'Not Paid'">
                          {{job.paymentStatus}}
                        </span>
                      </td>
                       <td class="px-6 py-4">
                        <select [value]="job.priority"
                                (change)="updatePriority.emit({id: job.id, priority: +$event.target.value})"
                                [disabled]="job.status !== 'Queued'"
                                class="w-full text-xs rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                          <option [value]="1">High</option>
                          <option [value]="2">Normal</option>
                          <option [value]="3">Low</option>
                        </select>
                      </td>
                      <td class="px-6 py-4">
                        <span class="font-semibold px-2.5 py-1 rounded-full text-xs"
                          [class]="{
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300': job.status === 'Queued',
                            'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300': job.status === 'Printing',
                            'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300': job.status === 'Ready'
                          }">
                          {{job.status}}
                        </span>
                      </td>
                      <td class="px-6 py-4 space-x-2 whitespace-nowrap">
                          <button (click)="printDocument.emit(job)" [disabled]="!job.file" title="{{ job.file ? 'Print document' : 'No file available to print' }}" class="inline-flex items-center font-medium text-white bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-md text-xs disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" />
                              </svg>
                              Print
                          </button>
                        @if(job.paymentStatus === 'Unpaid') {
                          <button (click)="markAsPaid.emit(job.id)" class="font-medium text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded-md text-xs">Mark Paid</button>
                        }
                        @if(job.status === 'Queued') {
                            <button (click)="updateStatus.emit({id: job.id, status: 'Printing'})" class="font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md text-xs">Start</button>
                        }
                        @if(job.status === 'Printing') {
                            <button (click)="updateStatus.emit({id: job.id, status: 'Ready'})" class="font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-md text-xs">Ready</button>
                        }
                        @if(job.status === 'Ready') {
                            <button (click)="updateStatus.emit({id: job.id, status: 'Collected'})" class="font-medium text-white bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded-md text-xs">Collect</button>
                        }
                      </td>
                  </tr>
                }
              </tbody>
          </table>
        </div>
      } @else {
          <p class="text-center py-12 text-gray-500 dark:text-gray-400">No jobs match the current filter.</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueViewComponent {
  jobs = input.required<PrintJob[]>();
  queueFilter = input.required<'all' | 'queued' | 'printing'>();
  isRefreshing = input.required<boolean>();

  filterChange = output<'all' | 'queued' | 'printing'>();
  updateStatus = output<{id: number, status: JobStatus}>();
  markAsPaid = output<number>();
  printDocument = output<PrintJob>();
  updatePriority = output<{id: number, priority: number}>();
}