import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import QRCode from 'qrcode';
import { AuthService } from '../../core/api/auth.service';
import { PdfApiService } from '../../core/api/pdf-api.service';
import type {
  PdfManualPayment,
  PdfPaymentSettings,
  PdfPlan,
} from '../../core/api/pdf-api.types';
import { MonetizationService } from '../../core/services/monetization.service';
import { ToastService } from '../../core/services/toast.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppIconComponent
} from '../../shared/components/ui';

/**
 * Pricing comes from the server so it can be changed without shipping a build.
 * Payment itself is manual: UPI in the person's own bank app, then a reference
 * submitted here for an admin to confirm.
 *
 * These bundled rows are only a fallback for a paywall opened before the
 * server answers, and they must be kept in step with `pdf_plans` by hand.
 *
 * They match migration 025, which sets the launch pricing. Note that a server
 * still on migration 023's seed serves ₹149/₹1199/₹2999 instead, so until 025
 * is deployed the fallback and the live catalogue disagree -- deploy the
 * migration rather than editing these numbers to match a stale server.
 * `offlinePricing` puts a warning on screen while these are showing, and
 * `choose()` cannot open the pay panel until `payment-settings` has been
 * fetched, so nobody can transact on a fallback price.
 */
const OFFLINE_PLANS: PdfPlan[] = [
  {
    planId: 'pro_monthly',
    name: 'Pro Monthly',
    price: 49,
    currency: 'INR',
    durationDays: 30,
    features: ['Unlimited pages', 'Batch processing', 'OCR & PDF intelligence', 'Priority support'],
    isActive: true,
    sortOrder: 1,
  },
  {
    planId: 'pro_annual',
    name: 'Pro Annual',
    price: 365,
    currency: 'INR',
    durationDays: 365,
    features: ['Everything in Pro Monthly', 'Best value for a full exam season', 'Early access to new tools'],
    isActive: true,
    sortOrder: 2,
  },
  {
    planId: 'lifetime',
    name: 'Lifetime',
    price: 999,
    currency: 'INR',
    durationDays: null,
    features: ['Everything in Pro Annual', 'One-time payment', 'Lifetime updates'],
    isActive: true,
    sortOrder: 3,
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-premium',
  templateUrl: './premium.page.html',
  styleUrls: ['./premium.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent
  ]
})
export class PremiumPage implements OnInit {
  readonly monetization = inject(MonetizationService);
  readonly auth = inject(AuthService);
  private readonly api = inject(PdfApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /*
   * Seeded, not empty.
   *
   * The paywall used to render a "Loading plans…" line and then swap in three
   * cards, so on a slow connection the page visibly jumped. The bundled prices
   * are correct for every plan the app ships with, so they go up immediately
   * and the server's copy replaces them in place when it arrives.
   */
  plans: PdfPlan[] = OFFLINE_PLANS;
  loadingPlans = true;
  /** True when pricing came from the bundled fallback rather than the server. */
  offlinePricing = true;

  /** Payee details. Null until fetched; `isActive: false` means payments are off. */
  settings: PdfPaymentSettings | null = null;

  /** The plan someone is currently paying for, if the panel is open. */
  selectedPlan: PdfPlan | null = null;
  /** Data URI for the UPI QR, generated on device. */
  qrDataUrl: string | null = null;

  /** The account's latest claim, which decides what the page shows. */
  pending: PdfManualPayment | null = null;
  latest: PdfManualPayment | null = null;

  utrNumber = '';
  senderName = '';
  contactNote = '';

  submitting = false;
  restoring = false;
  refreshing = false;

  async ngOnInit(): Promise<void> {
    /*
     * The persisted session loads asynchronously, and `isSignedIn` is false
     * until it does. Without this wait, a signed-in user with a payment under
     * review could open the paywall and see the plan cards instead of their
     * pending claim -- and pay a second time.
     */
    await this.auth.whenReady();
    await Promise.all([this.loadPlans(), this.loadSettings(), this.refreshClaims()]);
  }

  private async loadPlans(): Promise<void> {
    try {
      const plans = await this.api.plans();
      const sellable = plans.filter((plan) => plan.planId !== 'free');
      // An empty or malformed response keeps the bundled prices rather than
      // blanking the paywall.
      if (sellable.length) {
        this.plans = sellable;
        this.offlinePricing = false;
      }
    } catch {
      this.plans = OFFLINE_PLANS;
      this.offlinePricing = true;
    } finally {
      this.loadingPlans = false;
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await this.api.paymentSettings();
    } catch {
      // Unreachable server: the page says payments are unavailable rather than
      // showing a UPI id it cannot vouch for.
      this.settings = null;
    }
  }

  /** Re-reads this account's claims. Called on load and after every submit. */
  async refreshClaims(): Promise<void> {
    if (!this.auth.isSignedIn) {
      this.pending = null;
      this.latest = null;
      return;
    }

    try {
      const response = await this.api.myManualPayments();
      this.pending = response.pending;
      this.latest = response.requests[0] ?? null;
    } catch {
      this.pending = null;
      this.latest = null;
    }
  }

  /** Annual is the plan to steer people to, and the one worth badging. */
  isFeatured(plan: PdfPlan): boolean {
    return plan.planId === 'pro_annual';
  }

  billingNote(plan: PdfPlan): string {
    if (plan.durationDays === null) {
      return 'One-time payment. Lifetime access.';
    }
    if (plan.durationDays >= 365) {
      return 'Paid once a year. Best value.';
    }
    return 'Paid once a month.';
  }

  priceLabel(plan: PdfPlan): string {
    const period = plan.durationDays === null ? '' : plan.durationDays >= 365 ? '/yr' : '/mo';
    return `${this.amountLabel(plan)}${period}`;
  }

  /** The bare amount, which is what has to be transferred exactly. */
  amountLabel(plan: PdfPlan): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: plan.currency,
        maximumFractionDigits: 0,
      }).format(plan.price);
    } catch {
      return `${plan.currency} ${plan.price}`;
    }
  }

  /**
   * A claim carries a plan id and a bare number; the card has to show what the
   * person recognises. Falls back to the raw values when a plan has since been
   * retired from the catalogue, which is better than rendering nothing.
   */
  claimPlanName(claim: PdfManualPayment): string {
    return this.plans.find((plan) => plan.planId === claim.planId)?.name ?? claim.planId;
  }

  claimAmountLabel(claim: PdfManualPayment): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: claim.currency,
        maximumFractionDigits: 0,
      }).format(claim.amount);
    } catch {
      return `${claim.currency} ${claim.amount}`;
    }
  }

  get paymentsAvailable(): boolean {
    return Boolean(this.settings?.isActive);
  }

  get reviewHours(): number {
    return this.settings?.reviewHours ?? 24;
  }

  /**
   * Opens the payment panel for a plan.
   *
   * Sign-in is required before this, not after: the claim has to attach to an
   * account or there is nothing for an admin to grant premium to.
   */
  async choose(plan: PdfPlan): Promise<void> {
    if (!this.auth.isSignedIn) {
      this.toast.info('Create an account first so we can activate premium for you.');
      void this.router.navigate(['/account'], { queryParams: { next: '/features/premium' } });
      return;
    }

    if (!this.paymentsAvailable) {
      this.toast.info('Payments are unavailable right now. Please try again shortly.');
      return;
    }

    if (this.pending) {
      this.toast.info('You already have a payment awaiting review.');
      return;
    }

    this.selectedPlan = plan;
    this.utrNumber = '';
    this.qrDataUrl = await this.buildQr(plan);
  }

  closePanel(): void {
    this.selectedPlan = null;
    this.qrDataUrl = null;
  }

  /**
   * The UPI intent URI, which is both what the QR encodes and what the
   * "Open UPI app" button follows.
   *
   * `am` is the amount and `cu` the currency, so the payer's app pre-fills both
   * and there is far less chance of the wrong sum arriving — the single most
   * common reason a manual payment needs chasing.
   */
  upiUri(plan: PdfPlan): string {
    const settings = this.settings;
    if (!settings) {
      return '';
    }

    const params = new URLSearchParams({
      pa: settings.upiId,
      pn: settings.upiName,
      am: plan.price.toFixed(2),
      cu: plan.currency,
      tn: `${plan.name} - Indian Form Helper`,
    });
    return `upi://pay?${params.toString()}`;
  }

  private async buildQr(plan: PdfPlan): Promise<string | null> {
    // An admin-uploaded image wins: it may carry a payee the intent cannot express.
    if (this.settings?.qrCodeData) {
      return this.settings.qrCodeData;
    }

    try {
      return await QRCode.toDataURL(this.upiUri(plan), {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {
      // The UPI id and the "open app" button still work without a QR.
      return null;
    }
  }

  async copyUpiId(): Promise<void> {
    const upiId = this.settings?.upiId;
    if (!upiId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(upiId);
      this.toast.success('UPI ID copied.');
    } catch {
      // A denied clipboard permission is not worth an error dialog; the id is
      // on screen and selectable either way.
      this.toast.info(`Copy this UPI ID: ${upiId}`);
    }
  }

  openUpiApp(): void {
    if (!this.selectedPlan) {
      return;
    }
    // Android resolves upi:// to the installed payment apps. On a desktop
    // browser nothing handles it, which is why the id and QR are also shown.
    window.location.href = this.upiUri(this.selectedPlan);
  }

  get canSubmit(): boolean {
    return !this.submitting && /^[A-Za-z0-9-]{6,32}$/.test(this.utrNumber.trim());
  }

  async submit(): Promise<void> {
    if (!this.selectedPlan || !this.canSubmit) {
      return;
    }

    this.submitting = true;
    try {
      const request = await this.api.submitManualPayment({
        planId: this.selectedPlan.planId,
        utrNumber: this.utrNumber.trim(),
        paymentMethod: 'UPI',
        ...(this.senderName.trim() ? { senderName: this.senderName.trim() } : {}),
        ...(this.contactNote.trim() ? { contactNote: this.contactNote.trim() } : {}),
      });

      this.pending = request;
      this.latest = request;
      this.closePanel();
      this.toast.success('Payment submitted. We will activate premium once it is confirmed.');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not submit that payment. Please check your connection and try again.';
      this.toast.error(message);
    } finally {
      this.submitting = false;
    }
  }

  /**
   * Re-checks whether an admin has approved the payment yet.
   *
   * The entitlement also refreshes on app resume, but somebody staring at a
   * pending screen wants a button, not a reason to background the app.
   */
  async checkStatus(): Promise<void> {
    if (this.refreshing) {
      return;
    }

    this.refreshing = true;
    try {
      await this.monetization.refreshFromServer();
      await this.refreshClaims();

      if (this.monetization.isUserPremium) {
        this.toast.success('Premium is active. Enjoy!');
      } else if (this.pending) {
        this.toast.info('Still awaiting confirmation. We will unlock it as soon as it clears.');
      }
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Re-reads the entitlement from the account.
   *
   * With manual payments there is no store receipt to restore, so this is
   * really "sync my account" — which is exactly what restores premium after a
   * reinstall or on a new phone.
   */
  async restore(): Promise<void> {
    if (this.restoring) {
      return;
    }

    this.restoring = true;
    try {
      const restored = await this.monetization.restorePurchases();
      if (restored) {
        this.toast.success('Premium restored. Everything is unlocked.');
        return;
      }

      this.toast.info(
        this.auth.isSignedIn
          ? 'No active premium found on this account yet.'
          : 'Sign in with the account you paid on to restore premium.'
      );
    } catch {
      this.toast.info('Could not reach the server. Please try again in a moment.');
    } finally {
      this.restoring = false;
    }
  }

  goToAccount(): void {
    void this.router.navigate(['/account']);
  }
}
