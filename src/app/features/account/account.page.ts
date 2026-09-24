import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import { AuthError, AuthService } from '../../core/api/auth.service';
import { emailProblem, normalizeEmail, passwordProblem } from '../../core/api/credential-rules';
import { PdfApiService } from '../../core/api/pdf-api.service';
import type { PdfPlan } from '../../core/api/pdf-api.types';
import { MonetizationService } from '../../core/services/monetization.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AppButtonComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  AppInputComponent,
  AppPageHeaderComponent,
} from '../../shared/components/ui';

type Mode = 'signIn' | 'register';

/**
 * Optional account for premium that follows the person, not the phone.
 *
 * The app has always worked with no account and still does — this screen only
 * exists so a purchase survives a reinstall and so support can grant premium
 * to someone whose store purchase went wrong. No document data is involved
 * anywhere in it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppInputComponent,
    AppIconComponent,
  ],
})
export class AccountPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly monetization = inject(MonetizationService);
  private readonly api = inject(PdfApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Plan names as the admin wrote them, so the screen never shows a raw id. */
  private planNames = new Map<string, string>();

  mode: Mode = 'signIn';

  email = '';
  password = '';
  displayName = '';

  busy = false;
  /** Field-level messages, so the error lands next to the thing that is wrong. */
  emailError = '';
  passwordError = '';

  private signedOutSub?: Subscription;

  async ngOnInit(): Promise<void> {
    await this.auth.whenReady();
    void this.loadPlanNames();

    /*
     * Reset the form whenever the session ends.
     *
     * Without this the screen keeps whichever tab was last used, so someone who
     * created an account and then signed out is shown "Create account" again --
     * and the same happens when the sign-out was not their doing at all, which
     * is the case for a suspended account or a refresh token the server has
     * revoked. "Sign in" is what a person who has just been signed out wants.
     */
    this.signedOutSub = this.auth.user$.subscribe((user) => {
      if (!user) {
        this.mode = 'signIn';
        this.password = '';
        this.emailError = '';
        this.passwordError = '';
      }
    });
  }

  ngOnDestroy(): void {
    this.signedOutSub?.unsubscribe();
  }

  private async loadPlanNames(): Promise<void> {
    try {
      const plans = await this.api.plans();
      this.planNames = new Map(plans.map((plan: PdfPlan) => [plan.planId, plan.name]));
    } catch {
      // Offline: `planLabel` falls back to a readable form of the id.
    }
  }

  /**
   * The plan's display name.
   *
   * The entitlement carries only the id, and `pro_annual` is not something to
   * show a person. The server's own name wins when it is available; otherwise
   * the id is unsnaked, which reads correctly for every plan shipped so far.
   */
  planLabel(planId: string): string {
    const named = this.planNames.get(planId);
    if (named) {
      return named;
    }
    return planId
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.emailError = '';
    this.passwordError = '';
  }

  async submit(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.emailError = '';
    this.passwordError = '';

    /*
     * Both fields are checked before either is reported, so someone with a bad
     * address *and* a short password fixes them in one pass instead of two.
     * The rules themselves are the server's, imported rather than restated —
     * see credential-rules.ts for why that matters.
     */
    const email = normalizeEmail(this.email);
    this.emailError = emailProblem(this.email) ?? '';
    this.passwordError = passwordProblem(this.password) ?? '';
    if (this.emailError || this.passwordError) {
      return;
    }

    this.busy = true;
    try {
      if (this.mode === 'register') {
        await this.auth.register(email, this.password, this.displayName.trim() || undefined);
        this.toast.success('Account created. Your premium will follow you now.');
      } else {
        await this.auth.signIn(email, this.password);
        this.toast.success('Signed in.');
      }

      this.password = '';
      // A sign-in is also the moment to reconcile with the store, in case the
      // person bought premium on this device before making an account.
      await this.monetization.refreshFromServer();
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Something went wrong.';
      // 401 is always the password; 409 is always the address already existing.
      if (error instanceof AuthError && error.status === 409) {
        this.emailError = message;
      } else if (error instanceof AuthError && error.status === 401) {
        this.passwordError = message;
      } else {
        this.toast.error(message);
      }
    } finally {
      this.busy = false;
    }
  }

  async refresh(): Promise<void> {
    this.busy = true;
    try {
      const entitlement = await this.auth.syncProfile();
      if (entitlement) {
        this.toast.success(
          entitlement.isPremium ? 'Premium is active on this account.' : 'Account is up to date.',
        );
      } else {
        this.toast.info('Could not reach the server. Showing the last known status.');
      }
    } finally {
      this.busy = false;
    }
  }

  async restorePurchases(): Promise<void> {
    this.busy = true;
    try {
      const restored = await this.monetization.restorePurchases();
      if (restored) {
        this.toast.success('Premium restored.');
      } else {
        this.toast.info('No active purchase found for this store account.');
      }
    } finally {
      this.busy = false;
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.toast.info('Signed out. Every tool still works offline.');
  }

  goPremium(): void {
    void this.router.navigate(['/features/premium']);
  }

  /**
   * Opens and closes the delete confirmation.
   *
   * Deletion is behind a second, typed step rather than a single button. It is
   * the only irreversible action in the app, and it sits next to "Sign out" —
   * two buttons that look alike and differ by everything.
   */
  confirmingDelete = false;
  deleteConfirmation = '';

  readonly DELETE_PHRASE = 'DELETE';

  get canDelete(): boolean {
    return this.deleteConfirmation.trim().toUpperCase() === this.DELETE_PHRASE;
  }

  startDelete(): void {
    this.confirmingDelete = true;
    this.deleteConfirmation = '';
  }

  cancelDelete(): void {
    this.confirmingDelete = false;
    this.deleteConfirmation = '';
  }

  async deleteAccount(): Promise<void> {
    if (!this.canDelete) {
      return;
    }

    this.busy = true;
    try {
      await this.auth.deleteAccount();
      this.confirmingDelete = false;
      this.deleteConfirmation = '';
      this.toast.success('Your account and its data have been deleted.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not delete the account. Please try again.';
      this.toast.error(message);
    } finally {
      this.busy = false;
    }
  }

  /** "Checked 4 minutes ago", for when the network is down. */
  lastSyncedLabel(): string {
    const at = this.auth.lastSyncedAt;
    if (!at) {
      return 'not yet checked';
    }

    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
  }

  formatExpiry(validUntil: string | null, isPremium: boolean): string {
    if (!isPremium) return '—';
    if (!validUntil) return 'Never expires';
    return new Date(validUntil).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
