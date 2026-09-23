import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { AuthService } from '../../core/api/auth.service';
import { PdfApiService } from '../../core/api/pdf-api.service';
import type { PdfPlan } from '../../core/api/pdf-api.types';
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
 * Pricing comes from the server so it can be changed without shipping a build;
 * the purchase itself still goes through the store, which is the only thing
 * allowed to take money on Android and iOS.
 */
const OFFLINE_PLANS: PdfPlan[] = [
  {
    planId: 'pro_monthly',
    name: 'Pro Monthly',
    price: 149,
    currency: 'INR',
    durationDays: 30,
    features: ['Unlimited pages', 'Batch processing', 'OCR & PDF intelligence', 'No ads'],
    isActive: true,
    sortOrder: 1,
  },
  {
    planId: 'pro_annual',
    name: 'Pro Annual',
    price: 1199,
    currency: 'INR',
    durationDays: 365,
    features: ['Everything in Pro Monthly', '2 months free'],
    isActive: true,
    sortOrder: 2,
  },
  {
    planId: 'lifetime',
    name: 'Lifetime',
    price: 2999,
    currency: 'INR',
    durationDays: null,
    features: ['Everything in Pro Annual', 'One-time payment'],
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

  plans: PdfPlan[] = [];
  loadingPlans = true;
  /** True when pricing came from the bundled fallback rather than the server. */
  offlinePricing = false;
  purchasingPlanId: string | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const plans = await this.api.plans();
      // 'free' is a tier, not something to sell on the paywall.
      this.plans = plans.filter((plan) => plan.planId !== 'free');
      this.offlinePricing = false;
    } catch {
      // A paywall that renders nothing when the network is down is worse than
      // one showing last-known prices, and the store quotes the real, local
      // price at checkout anyway.
      this.plans = OFFLINE_PLANS;
      this.offlinePricing = true;
    } finally {
      this.loadingPlans = false;
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
      return 'Billed annually. Best value.';
    }
    return 'Billed monthly. Cancel anytime.';
  }

  priceLabel(plan: PdfPlan): string {
    const period = plan.durationDays === null ? '' : plan.durationDays >= 365 ? '/yr' : '/mo';
    try {
      const amount = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: plan.currency,
        maximumFractionDigits: 0,
      }).format(plan.price);
      return `${amount}${period}`;
    } catch {
      return `${plan.currency} ${plan.price}${period}`;
    }
  }

  async buy(plan: PdfPlan): Promise<void> {
    if (this.purchasingPlanId) {
      return;
    }

    const match = this.findPackage(plan);
    if (!match) {
      // Off-device, or the Play Console product is not configured yet. Saying
      // which is impossible from here, so the message stays about what the
      // user can do next.
      this.toast.info('Purchases are available in the installed app from the Play Store.');
      return;
    }

    this.purchasingPlanId = plan.planId;
    try {
      const success = await this.monetization.purchasePackage(match);
      if (!success) {
        this.toast.info('Purchase was not completed.');
        return;
      }

      this.toast.success('Welcome to Premium!');
      if (!this.auth.isSignedIn) {
        // Without an account the entitlement lives only in this device's store
        // account: a reinstall on a new phone loses it, and support cannot see
        // it. Worth one nudge, not a blocker.
        this.toast.info('Create an account to keep premium if you change phones.');
      }
      void this.router.navigate(['/home']);
    } finally {
      this.purchasingPlanId = null;
    }
  }

  /**
   * Maps a server plan onto a store package.
   *
   * Play Console product ids are configured to end in the plan id, which is
   * the same convention the server uses when it verifies a purchase.
   */
  private findPackage(plan: PdfPlan): PurchasesPackage | null {
    const packages = this.monetization.packages$.value;
    const normalized = (value: string) => value.trim().toLowerCase().replace(/[.\-]/g, '_');

    return (
      packages.find((pkg) => normalized(pkg.product.identifier) === plan.planId) ??
      packages.find((pkg) => normalized(pkg.product.identifier).endsWith(plan.planId)) ??
      packages.find((pkg) => normalized(pkg.identifier).includes(plan.planId)) ??
      null
    );
  }

  goToAccount(): void {
    void this.router.navigate(['/account']);
  }
}
