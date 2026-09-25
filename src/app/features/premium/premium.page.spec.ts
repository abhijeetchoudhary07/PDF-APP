import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../core/api/auth.service';
import { PdfApiService } from '../../core/api/pdf-api.service';
import type { PdfPlan } from '../../core/api/pdf-api.types';
import type { StoreStatus } from '../../core/config/store.config';
import { MonetizationService } from '../../core/services/monetization.service';
import { ToastService } from '../../core/services/toast.service';
import { PremiumPage } from './premium.page';

const PLANS: PdfPlan[] = [
  {
    planId: 'pro_monthly',
    name: 'Pro Monthly',
    price: 49,
    currency: 'INR',
    durationDays: 30,
    features: [],
    isActive: true,
    sortOrder: 1,
  },
];

const SETTINGS = {
  upiId: 'someone@okicici',
  upiName: 'Indian Form Helper',
  qrCodeData: null,
  bankName: null,
  bankAccountNumber: null,
  bankAccountName: null,
  bankIfsc: null,
  bankBranch: null,
  instructions: '',
  reviewHours: 24,
  isActive: true,
};

/**
 * Which payment route the paywall takes is a compliance boundary, not a
 * preference. Play's Payments policy forbids the app from offering the UPI
 * transfer alongside Play Billing, and the failure mode is silent: the UPI
 * panel opening on a device looks exactly like the flow working. So the branch
 * is pinned from both sides — the panel must be unreachable on a device, and
 * must still work in a browser, which is not a Play distribution.
 */
describe('PremiumPage — payment route', () => {
  let page: PremiumPage;
  let storeStatus$: BehaviorSubject<StoreStatus>;
  let purchasePackage: ReturnType<typeof vi.fn>;
  let packageForPlan: ReturnType<typeof vi.fn>;
  let paymentSettings: ReturnType<typeof vi.fn>;
  let toastInfo: ReturnType<typeof vi.fn>;

  async function build(isCapacitor: boolean, status: StoreStatus): Promise<void> {
    TestBed.resetTestingModule();

    storeStatus$ = new BehaviorSubject<StoreStatus>(status);
    purchasePackage = vi.fn(async () => true);
    packageForPlan = vi.fn(() => ({ identifier: 'monthly' }));
    paymentSettings = vi.fn(async () => SETTINGS);
    toastInfo = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Platform, useValue: { is: (name: string) => isCapacitor && name === 'capacitor' } },
        {
          provide: MonetizationService,
          useValue: {
            storeStatus$,
            packages$: new BehaviorSubject([]),
            isPremium$: new BehaviorSubject(false),
            get canPurchase() {
              return storeStatus$.value === 'ready';
            },
            packageForPlan,
            purchasePackage,
            restorePurchases: vi.fn(async () => false),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isSignedIn: true,
            whenReady: vi.fn(async () => undefined),
            user$: new BehaviorSubject(null),
            entitlement$: new BehaviorSubject(null),
          },
        },
        {
          provide: PdfApiService,
          useValue: {
            plans: vi.fn(async () => PLANS),
            paymentSettings,
            myManualPayments: vi.fn(async () => ({ pending: null, requests: [] })),
          },
        },
        {
          provide: ToastService,
          useValue: { info: toastInfo, success: vi.fn(), error: vi.fn() },
        },
      ],
    });

    /*
     * Constructed directly rather than through `createComponent`.
     *
     * The compliance boundary lives in the class, and compiling the real
     * template would drag in the QR canvas and the Ionic shell to assert
     * nothing extra. `runInInjectionContext` is what makes the `inject()`
     * field initialisers resolve against the providers above.
     */
    page = TestBed.runInInjectionContext(() => new PremiumPage());
    await page.ngOnInit();
  }

  describe('on a device', () => {
    it('buys through Play and never opens the UPI panel', async () => {
      await build(true, 'ready');

      await page.choose(PLANS[0]);

      expect(purchasePackage).toHaveBeenCalledOnce();
      expect(packageForPlan).toHaveBeenCalledWith('pro_monthly');
      expect(page.selectedPlan).toBeNull();
      expect(page.payPanelPlan).toBeNull();
    });

    it('never fetches the UPI payee', async () => {
      await build(true, 'ready');

      expect(paymentSettings).not.toHaveBeenCalled();
      expect(page.settings).toBeNull();
    });

    it('explains an unsellable store instead of falling back to UPI', async () => {
      await build(true, 'no-products');

      await page.choose(PLANS[0]);

      expect(purchasePackage).not.toHaveBeenCalled();
      expect(page.payPanelPlan).toBeNull();
      expect(toastInfo).toHaveBeenCalledWith(
        'These plans are not on sale yet. Please try again shortly.',
      );
    });

    it('names the placeholder build as the reason when keys are missing', async () => {
      await build(true, 'not-configured');

      await page.choose(PLANS[0]);

      expect(toastInfo).toHaveBeenCalledWith(
        'In-app purchases are not available in this build yet.',
      );
    });
  });

  describe('in a browser', () => {
    it('still opens the UPI panel', async () => {
      await build(false, 'off-device');

      await page.choose(PLANS[0]);

      expect(purchasePackage).not.toHaveBeenCalled();
      expect(page.payPanelPlan?.planId).toBe('pro_monthly');
    });

    it('fetches the payee, because that route needs it', async () => {
      await build(false, 'off-device');

      expect(paymentSettings).toHaveBeenCalledOnce();
      expect(page.settings).not.toBeNull();
    });
  });
});
