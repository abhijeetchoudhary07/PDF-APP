import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../api/auth.service';
import { PdfApiService } from '../api/pdf-api.service';
import { FREE_ENTITLEMENT, type PdfEntitlement, type PdfSafeUser } from '../api/pdf-api.types';
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
