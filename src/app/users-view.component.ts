import { Component, ChangeDetectionStrategy, input, output, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminUser } from '../api.service';

@Component({
  selector: 'app-users-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Edit Password Modal -->
    @if (showEditModal() && editingUser(); as user) {
      <div class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50" (click)="closeEditModal()">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-8 m-4" (click)="$event.stopPropagation()">
          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Change Password for <span class="text-primary">{{ user.username }}</span></h2>
          <form (submit)="$event.preventDefault(); handleUpdatePassword()">
            <div class="space-y-4">
              <div>
                <label for="edit-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
                <!-- FIX: Use component method for input event to handle multiple actions -->
                <input type="password" id="edit-password" [value]="editPassword()" (input)="onEditPasswordInput($event)" class="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white" required>
              </div>
              <div>
                <label for="edit-confirm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
                <!-- FIX: Use component method for input event to handle multiple actions -->
                <input type="password" id="edit-confirm-password" [value]="editConfirmPassword()" (input)="onEditConfirmPasswordInput($event)" class="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white" required>
              </div>
              @if(editFormError(); as msg) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ msg }}</p>
              }
              <!-- FIX: Use the getter which returns a readonly signal -->
              @if(updateError(); as msg) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ msg }}</p>
              }
            </div>
            <div class="mt-8 flex justify-end space-x-3">
              <button type="button" (click)="closeEditModal()" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">Cancel</button>
              <button type="submit" class="px-6 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-600">Save Password</button>
            </div>
          </form>
        </div>
      </div>
    }

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- Add User Form -->
      <div class="md:col-span-2">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200">Create New Admin User</h3>
          </div>
          <form (submit)="$event.preventDefault(); handleAddUser()">
            <div class="p-6 space-y-4">
              <div>
                <label for="new-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                <!-- FIX: Use component method for input event to handle multiple actions -->
                <input type="text" id="new-username" [value]="newUsername()" (input)="onNewUsernameInput($event)" class="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white" required>
              </div>
              <div>
                <label for="new-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <!-- FIX: Replaced inline event handler with component method to prevent template parsing errors. -->
                <input type="password" id="new-password" [value]="newPassword()" (input)="onNewPasswordInput($event)" class="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white" required>
              </div>
              <div>
                <label for="confirm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
                <!-- FIX: Replaced inline event handler with component method to prevent template parsing errors. -->
                <input type="password" id="confirm-password" [value]="confirmPassword()" (input)="onConfirmPasswordInput($event)" class="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white" required>
              </div>
              @if(formError(); as msg) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ msg }}</p>
              }
              <!-- FIX: Use the getter which returns a readonly signal -->
              @if(creationError(); as msg) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ msg }}</p>
              }
              <!-- FIX: Use the getter which returns a readonly signal -->
               @if(deletionError(); as msg) {
                <p class="text-sm text-red-600 dark:text-red-400">{{ msg }}</p>
              }
            </div>
            <div class="p-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center space-x-3">
              @if(showSaveConfirmation()) {
                <div class="flex items-center space-x-2 text-green-600 dark:text-green-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                    <span class="text-sm font-medium">Success!</span>
                </div>
              }
              <button type="submit" class="flex items-center space-x-2 bg-primary hover:bg-primary-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                <span>Create User</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      <!-- User List -->
      <div class="md:col-span-1">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="p-4 border-b dark:border-gray-700"><h3 class="text-xl font-bold dark:text-gray-100">Current Users</h3></div>
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            @for(user of users(); track user.username) {
              <li class="px-6 py-4 flex items-center justify-between space-x-3">
                <div class="flex items-center space-x-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clip-rule="evenodd" /></svg>
                    <span class="font-medium text-gray-700 dark:text-gray-300">{{ user.username }}</span>
                </div>
                <div class="flex items-center space-x-1">
                    <button 
                        (click)="openEditModal(user)"
                        [disabled]="user.username.toLowerCase() === currentUser()?.username.toLowerCase()"
                        [title]="user.username.toLowerCase() === currentUser()?.username.toLowerCase() ? 'You cannot edit your own account' : 'Edit user password'"
                        class="p-1 text-gray-400 hover:text-primary dark:hover:text-primary-400 rounded-full disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:text-gray-300 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                           <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                           <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <button 
                        (click)="handleDeleteUser(user.username)"
                        [disabled]="user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === currentUser()?.username.toLowerCase()"
                        [title]="(user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === currentUser()?.username.toLowerCase()) ? 'This user cannot be deleted' : 'Delete user'"
                        class="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed disabled:hover:text-gray-300 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
              </li>
            } @empty {
              <li class="p-6 text-center text-gray-500 dark:text-gray-400">No users found.</li>
            }
          </ul>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersViewComponent {
  users = input.required<AdminUser[]>();
  currentUser = input<AdminUser | null>(null);
  showSaveConfirmation = input.required<boolean>();

  // FIX: Replace input() with @Input setter and private signal to allow internal mutation
  private readonly _creationError = signal<string | null>(null);
  @Input() set creationError(value: string | null) { this._creationError.set(value); }
  get creationError() { return this._creationError.asReadonly(); }

  private readonly _deletionError = signal<string | null>(null);
  @Input() set deletionError(value: string | null) { this._deletionError.set(value); }
  get deletionError() { return this._deletionError.asReadonly(); }
  
  private readonly _updateError = signal<string | null>(null);
  @Input() set updateError(value: string | null) { this._updateError.set(value); }
  get updateError() { return this._updateError.asReadonly(); }

  addUser = output<AdminUser>();
  deleteUser = output<string>();
  updateUserPassword = output<{username: string, password: string}>();

  // Form state for creating user
  newUsername = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  formError = signal<string | null>(null);

  // State for editing user
  showEditModal = signal(false);
  editingUser = signal<AdminUser | null>(null);
  editPassword = signal('');
  editConfirmPassword = signal('');
  editFormError = signal<string | null>(null);

  onNewUsernameInput(event: Event): void {
    this.newUsername.set((event.target as HTMLInputElement).value);
    this.formError.set(null);
    this._creationError.set(null);
    this._deletionError.set(null);
  }

  onEditPasswordInput(event: Event): void {
    this.editPassword.set((event.target as HTMLInputElement).value);
    this.editFormError.set(null);
  }

  onEditConfirmPasswordInput(event: Event): void {
    this.editConfirmPassword.set((event.target as HTMLInputElement).value);
    this.editFormError.set(null);
  }

  onNewPasswordInput(event: Event): void {
    this.newPassword.set((event.target as HTMLInputElement).value);
    this.formError.set(null);
  }

  onConfirmPasswordInput(event: Event): void {
    this.confirmPassword.set((event.target as HTMLInputElement).value);
    this.formError.set(null);
  }

  handleAddUser(): void {
    this.formError.set(null);
    if (!this.newUsername() || !this.newPassword()) {
      this.formError.set('Username and password cannot be empty.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.formError.set('Passwords do not match.');
      return;
    }
    
    this.addUser.emit({
      username: this.newUsername(),
      password: this.newPassword()
    });

    // FIX: Corrected calling a signal's value. The getter returns a signal, which is then called to get the value. `creationError()()` was incorrect.
    if (!this.creationError()) {
      this.newUsername.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
    }
  }

  handleDeleteUser(username: string): void {
    if (confirm(`Are you sure you want to delete the user "${username}"? This action cannot be undone.`)) {
      this.deleteUser.emit(username);
    }
  }

  openEditModal(user: AdminUser): void {
    this.editingUser.set(user);
    this.showEditModal.set(true);
    this.editFormError.set(null);
    // FIX: The original error was trying to .set an InputSignal. Now we set the internal, writable signal.
    this._updateError.set(null);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingUser.set(null);
    this.editPassword.set('');
    this.editConfirmPassword.set('');
    this.editFormError.set(null);
  }

  handleUpdatePassword(): void {
    this.editFormError.set(null);
    const user = this.editingUser();
    if (!user) return;

    if (!this.editPassword()) {
        this.editFormError.set('Password cannot be empty.');
        return;
    }
    if (this.editPassword() !== this.editConfirmPassword()) {
        this.editFormError.set('Passwords do not match.');
        return;
    }

    this.updateUserPassword.emit({ username: user.username, password: this.editPassword() });
    
    // We expect the parent to close the modal on success, but for better UX,
    // we can close it immediately if the updateError signal isn't immediately set.
    // This requires a microtask delay to allow parent state to propagate.
    Promise.resolve().then(() => {
        // FIX: Corrected calling a signal's value. The getter returns a signal, which is then called to get the value. `updateError()()` was incorrect.
        if (!this.updateError()) {
            this.closeEditModal();
        }
    });
  }
}
