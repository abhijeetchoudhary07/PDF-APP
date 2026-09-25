import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../api/auth.service';
import { PdfApiService } from '../api/pdf-api.service';
import { FREE_ENTITLEMENT, type PdfEntitlement, type PdfSafeUser } from '../api/pdf-api.types';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { MonetizationService } from './monetization.service';

// The native SDK cannot load under jsdom, and none of these tests exercise a
// real store: off-device the service short-circuits every store call.
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    setLogLevel: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
    getCustomerInfo: vi.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
    getOfferings: vi.fn(async () => ({ current: { availablePackages: [] } })),
    logIn: vi.fn(async () => undefined),
    logOut: vi.fn(async () => undefined),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}));

function premium(planId: string): PdfEntitlement {
  return {
    isPremium: true,
    planId,
    status: 'active',
    validUntil: null,
    platform: 'manual_admin',
    daysRemaining: null,
  };
}

/**
 * The reconciliation between a store purchase and an account entitlement is
 * the one piece of real logic in this service, and getting it wrong is either
 * "paying customer sees the paywall offline" or "admin grant never reaches the
 * device". Both are pinned here.
 */
describe('MonetizationService', () => {
  let entitlement$: BehaviorSubject<PdfEntitlement>;
  let user$: BehaviorSubject<PdfSafeUser | null>;
  let service: MonetizationService;

  beforeEach(() => {
    TestBed.resetTestingModule();

    entitlement$ = new BehaviorSubject<PdfEntitlement>(FREE_ENTITLEMENT);
    user$ = new BehaviorSubject<PdfSafeUser | null>(null);

    TestBed.configureTestingModule({
      providers: [
        // Off-device: no RevenueCat, so the account is the only signal.
        { provide: Platform, useValue: { is: () => false } },
        {
          provide: AuthService,
          useValue: {
            entitlement$,
            user$,
            isSignedIn: false,
            syncProfile: vi.fn(async () => null),
          },
        },
        { provide: PdfApiService, useValue: { verifyPurchase: vi.fn() } },
      ],
    });

    service = TestBed.inject(MonetizationService);
  });

  it('starts on the free tier', () => {
    expect(service.isUserPremium).toBe(false);
    expect(service.isPremium$.value).toBe(false);
    expect(service.premiumSource).toBe('none');
  });

  it('unlocks premium when the account is entitled, with no store involved', () => {
    // This is the admin-grant path: nothing was purchased on this device.
    entitlement$.next(premium('lifetime'));

    expect(service.isUserPremium).toBe(true);
    expect(service.isPremium$.value).toBe(true);
    expect(service.premiumSource).toBe('account');
  });

  it('drops back to free when the account entitlement is revoked', () => {
    entitlement$.next(premium('pro_annual'));
    expect(service.isPremium$.value).toBe(true);

    entitlement$.next(FREE_ENTITLEMENT);

    expect(service.isUserPremium).toBe(false);
    expect(service.isPremium$.value).toBe(false);
  });

  it('keeps store-granted premium when the account says free', () => {
    // A purchase the server has not verified yet (offline, or no store
    // credentials configured) must not lock a paying customer out.
    (service as unknown as { storeEntitled: boolean }).storeEntitled = true;
    (service as unknown as { publish: () => void }).publish();

    entitlement$.next(FREE_ENTITLEMENT);

    expect(service.isUserPremium).toBe(true);
    expect(service.premiumSource).toBe('store');
  });

  it('emits only when the answer actually changes', () => {
    const seen: boolean[] = [];
    service.isPremium$.subscribe((value) => seen.push(value));

    entitlement$.next(premium('pro_monthly'));
    entitlement$.next(premium('pro_annual'));
    entitlement$.next(premium('lifetime'));

    // Three premium entitlements in a row are one state change, not three --
    // every consumer of this subject re-renders on each emission.
    expect(seen).toEqual([false, true]);
  });
});

/**
 * Every test above runs off-device, which is the one platform where restoring
 * always worked. On a device the service used to take a different branch
 * entirely: it called the native plugin, the plugin rejected because
 * `configure` had never run against the placeholder keys, and the caught
 * rejection returned false without ever re-reading the account. Since payment
 * here is a UPI transfer turned into an admin grant, that was every paying
 * customer losing premium on reinstall.
 */
describe('MonetizationService restore on a device with no store configured', () => {
  let entitlement$: BehaviorSubject<PdfEntitlement>;
  let syncProfile: ReturnType<typeof vi.fn>;
  let service: MonetizationService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();

    entitlement$ = new BehaviorSubject<PdfEntitlement>(FREE_ENTITLEMENT);
    // What the server does for an admin-granted account.
    syncProfile = vi.fn(async () => {
      entitlement$.next(premium('lifetime'));
      return null;
    });

    TestBed.configureTestingModule({
      providers: [
        // On a device, but not iOS: the android placeholder key is the one read.
        { provide: Platform, useValue: { is: (feature: string) => feature === 'capacitor' } },
        {
          provide: AuthService,
          useValue: {
            entitlement$,
            user$: new BehaviorSubject<PdfSafeUser | null>(null),
            isSignedIn: true,
            syncProfile,
          },
        },
        { provide: PdfApiService, useValue: { verifyPurchase: vi.fn() } },
      ],
    });

    service = TestBed.inject(MonetizationService);
  });

  it('restores an admin-granted entitlement from the account', async () => {
    const restored = await service.restorePurchases();

    expect(syncProfile).toHaveBeenCalled();
    expect(restored).toBe(true);
    expect(service.premiumSource).toBe('account');
  });

  it('does not call the unconfigured plugin at all', async () => {
    await service.restorePurchases();

    // Placeholder keys mean `configure` never ran, so there is nothing to ask
    // and the rejection is not worth provoking just to swallow it.
    expect(Purchases.restorePurchases).not.toHaveBeenCalled();
  });

  it('keeps the account entitlement when the store rejects', async () => {
    // Belt and braces: even if the store were reached and failed, the account
    // answer synced first must still stand.
    (service as unknown as { storeReady: Promise<boolean> }).storeReady = Promise.resolve(true);
    vi.mocked(Purchases.restorePurchases).mockRejectedValueOnce(new Error('network down'));

    const restored = await service.restorePurchases();

    expect(Purchases.restorePurchases).toHaveBeenCalled();
    expect(restored).toBe(true);
  });

  /**
   * Play reports a subscription as `product:basePlan` while the Console shows
   * only `product`. Comparing the two strings directly therefore matches every
   * one-time product and no subscription at all — a paywall where the lifetime
   * button works and both subscriptions are dead, which reads as a RevenueCat
   * outage rather than a string bug.
   */
  describe('packageForPlan', () => {
    function withPackages(...identifiers: string[]): void {
      service.packages$.next(
        identifiers.map(
          (identifier) => ({ product: { identifier } }) as never,
        ),
      );
    }

    it('matches a subscription despite the base-plan suffix', () => {
      withPackages('pro_monthly:monthly');

      expect(service.packageForPlan('pro_monthly')).not.toBeNull();
    });

    it('matches a one-time product', () => {
      withPackages('lifetime');

      expect(service.packageForPlan('lifetime')).not.toBeNull();
    });

    it('does not confuse two plans that share a prefix', () => {
      withPackages('pro_annual:annual');

      expect(service.packageForPlan('pro_monthly')).toBeNull();
    });

    it('returns null for a plan the store does not sell', () => {
      withPackages('pro_monthly:monthly');

      expect(service.packageForPlan('lifetime')).toBeNull();
      expect(service.packageForPlan('free')).toBeNull();
    });
  });
});
