import { Injectable, inject } from '@angular/core';
import {
  LOG_LEVEL,
  Purchases,
  type PurchasesPackage,
  type PurchasesStoreTransaction,
} from '@revenuecat/purchases-capacitor';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../api/auth.service';
import { PdfApiService } from '../api/pdf-api.service';
import type { PdfSafeUser } from '../api/pdf-api.types';
import {
  PLAY_PRODUCT_IDS,
  REVENUECAT_API_KEYS,
  baseProductId,
  isStoreConfigured,
  type StoreStatus,
} from '../config/store.config';

/**
 * Premium status, reconciled between the store and the account.
 *
 * Two independent sources can entitle someone:
 *
 *   - the **store** (RevenueCat / Google Play), which knows what this device's
 *     store account has bought;
 *   - the **server**, which knows what the signed-in account is entitled to —
 *     including a grant an admin made by hand, which no store will ever report.
 *
 * Premium is the union of the two. Taking the intersection would drop a paying
 * customer to the paywall whenever the network is down, and reading only the
 * store would make the admin portal's manual grants invisible on the device.
 *
 * The public surface (`isPremium$`, `isUserPremium`, `purchasePackage`,
 * `restorePurchases`) is unchanged — the ad service, batch processing,
 * conversion service, profile page and header all keep working as they were.
 */
@Injectable({
  providedIn: 'root'
})
export class MonetizationService {
  private readonly platform = inject(Platform);
  private readonly auth = inject(AuthService);
  private readonly api = inject(PdfApiService);

  public isPremium$ = new BehaviorSubject<boolean>(false);
  private isPremium = false;

  /** What the device's store account is entitled to. */
  private storeEntitled = false;
  /** What the signed-in account is entitled to, per the server. */
  private serverEntitled = false;

  /** Purchasable packages, once RevenueCat has been reached. Empty off-device. */
  public packages$ = new BehaviorSubject<PurchasesPackage[]>([]);

  /**
   * How far the store got, so the paywall can explain itself.
   *
   * Without this the page could only ever say "purchases are unavailable" and
   * leave the reason to guesswork: a browser, a build with placeholder keys and
   * a Play Console with no live products all produced exactly the same empty
   * `packages$` and the same dismissible toast.
   */
  public storeStatus$ = new BehaviorSubject<StoreStatus>('off-device');

  /** Resolves when `configure` has run, so identity calls cannot race it. */
  private storeReady: Promise<boolean>;
  /** The app user id currently bound in RevenueCat, so logOut is only called if logIn was. */
  private boundAppUserId: string | null = null;

  constructor() {
    this.storeReady = this.initRevenueCat();

    this.auth.entitlement$.subscribe((entitlement) => {
      this.serverEntitled = entitlement.isPremium;
      this.publish();
    });

    this.auth.user$.subscribe((user) => {
      void this.bindStoreIdentity(user);
    });
  }

  async initRevenueCat(): Promise<boolean> {
    if (!this.platform.is('capacitor')) {
      // Browser and `ionic serve`: no store. The account still drives premium,
      // which is what makes this flow testable without a device.
      this.storeStatus$.next('off-device');
      return false;
    }

    const apiKey = this.platform.is('ios')
      ? REVENUECAT_API_KEYS.ios
      : REVENUECAT_API_KEYS.android;

    if (!isStoreConfigured(apiKey)) {
      /*
       * Bail out loudly rather than configuring with the placeholder.
       * `Purchases.configure()` accepts any string, so carrying on here would
       * produce an empty offering list and a paywall whose buttons silently do
       * nothing -- indistinguishable, from the outside, from a working build.
       */
      console.error(
        '[monetization] RevenueCat is not configured: src/app/core/config/store.config.ts ' +
          'still holds a placeholder API key, so no purchase can complete.'
      );
      this.storeStatus$.next('not-configured');
      return false;
    }

    try {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      await Purchases.configure({ apiKey });

      await this.checkSubscriptionStatus();
      await this.loadPackages();
      return true;
    } catch (e) {
      console.error('RevenueCat could not be initialised', e);
      this.storeStatus$.next('error');
      return false;
    }
  }

  /**
   * Ties the store account to the signed-in app account.
   *
   * Without this the server cannot match a RevenueCat subscriber to a
   * `pdf_users` row, so `subscription/verify` has nothing to look up and a
   * purchase never becomes a durable entitlement.
   */
  private async bindStoreIdentity(user: PdfSafeUser | null): Promise<void> {
    if (!(await this.storeReady)) {
      return;
    }

    try {
      if (user) {
        if (this.boundAppUserId === user.id) {
          return;
        }
        await Purchases.logIn({ appUserID: user.id });
        this.boundAppUserId = user.id;
        await this.checkSubscriptionStatus();
        // A purchase made before signing in belongs to this account now.
        await this.pushEntitlementToServer();
      } else if (this.boundAppUserId) {
        // Only when a logIn actually happened: calling logOut on the anonymous
        // user throws.
        await Purchases.logOut();
        this.boundAppUserId = null;
        await this.checkSubscriptionStatus();
      }
    } catch (e) {
      console.error('Could not sync the store identity', e);
    }
  }

  async checkSubscriptionStatus(): Promise<void> {
    if (!this.platform.is('capacitor')) {
      return;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      // 'premium' is the typical entitlement identifier set in RevenueCat
      this.storeEntitled =
        typeof customerInfo.customerInfo.entitlements.active['premium'] !== 'undefined';
      this.publish();
    } catch (e) {
      console.error('Error fetching customer info', e);
    }
  }

  private async loadPackages(): Promise<void> {
    try {
      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      this.packages$.next(packages);

      if (!packages.length) {
        // Reached the store, but it has nothing to sell: the Play Console
        // products are missing, still in draft, or not in the current offering.
        console.warn(
          '[monetization] RevenueCat returned no packages. Check that the Play Console ' +
            'products are active and attached to the current offering.'
        );
      }
      this.storeStatus$.next(packages.length ? 'ready' : 'no-products');
    } catch (e) {
      console.error('Could not load store offerings', e);
      this.packages$.next([]);
      this.storeStatus$.next('error');
    }
  }

  /** True only when a purchase could actually complete right now. */
  get canPurchase(): boolean {
    return this.storeStatus$.value === 'ready';
  }

  /**
   * The store package that sells a server plan, or null when there is none.
   *
   * This is the join between the catalogue the server prices (`pdf_plans`) and
   * the catalogue Play actually sells. A null means the two have drifted — a
   * product that was never created, is still in draft, or is not attached to
   * the current offering — and the paywall has to say so rather than open a
   * checkout sheet that cannot complete.
   */
  packageForPlan(planId: string): PurchasesPackage | null {
    const productId = PLAY_PRODUCT_IDS[planId];
    if (!productId) {
      return null;
    }

    return (
      this.packages$.value.find(
        (pkg) => baseProductId(pkg.product.identifier) === productId,
      ) ?? null
    );
  }

  async purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
    try {
      const result = await Purchases.purchasePackage({ aPackage: pkg });

      this.storeEntitled =
        typeof result.customerInfo.entitlements.active['premium'] !== 'undefined';
      this.publish();

      if (this.storeEntitled) {
        // Record it against the account so it survives a reinstall, a new
        // phone, and shows up in the admin portal. Failure here is not a
        // failed purchase -- the user has premium either way, and the next
        // launch retries.
        await this.reportPurchase(result.transaction, result.productIdentifier);
      }

      return this.storeEntitled;
    } catch (e) {
      console.error('Purchase failed', e);
      return false;
    }
  }

  async restorePurchases(): Promise<boolean> {
    /*
     * The account is checked first and unconditionally, because it is the only
     * entitlement source that always applies: payment here is a UPI transfer
     * plus an admin grant on the server, never a store receipt, so premium can
     * only survive a reinstall or a new phone through the account.
     *
     * The store is an optional extra layered on top, and it has to stay
     * optional. `restorePurchases` rejects outright when the plugin was never
     * configured -- "Purchases must be configured before calling this function"
     * -- which is every build still carrying the placeholder keys in
     * store.config.ts. Letting that rejection decide the return value is what
     * stopped manual payers from restoring at all: on a device the account was
     * never consulted, so the one signal that could have unlocked premium was
     * skipped in favour of a store that had nothing to say.
     */
    if (this.auth.isSignedIn) {
      try {
        await this.auth.syncProfile();
      } catch (e) {
        console.error('Could not re-read the account entitlement', e);
      }
    }

    // `storeReady` is false unless `configure` actually succeeded, so this
    // never calls into an unconfigured plugin just to catch the rejection.
    if (this.platform.is('capacitor') && (await this.storeReady)) {
      try {
        const { customerInfo } = await Purchases.restorePurchases();
        this.storeEntitled = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
        this.publish();

        if (this.storeEntitled) {
          await this.pushEntitlementToServer();
        }
      } catch (e) {
        // A store that cannot be reached says nothing about the account, so
        // the entitlement synced above stands.
        console.error('Restore from the store failed', e);
      }
    }

    return this.isPremium;
  }

  /** Re-reads the account's entitlement. Called on resume, and after a restore. */
  async refreshFromServer(): Promise<void> {
    await this.auth.syncProfile();
  }

  /**
   * Re-reports an entitlement the store already granted — on restore, and when
   * someone signs in after buying.
   *
   * Unlike a fresh purchase there is no transaction in hand here: RevenueCat
   * exposes a purchase token for one-off products but not for an active
   * subscription. So a one-off sends its real token, and a subscription sends
   * the app user id, which is what the server's RevenueCat verifier looks the
   * subscriber up by anyway. A server configured for the Play API instead will
   * reject the latter, and `report` treats that as "nothing to sync" rather
   * than an error — the user keeps the premium the store gave them either way.
   */
  private async pushEntitlementToServer(): Promise<void> {
    if (!this.auth.isSignedIn) {
      return;
    }

    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      const active = customerInfo.entitlements.active['premium'];
      if (!active) {
        return;
      }

      const oneOff = Object.values(customerInfo.nonSubscriptionTransactions ?? {})
        .flat()
        .find((entry) => entry.productIdentifier === active.productIdentifier);

      await this.report(
        active.productIdentifier,
        oneOff?.purchaseToken ?? customerInfo.originalAppUserId ?? active.productIdentifier,
        oneOff?.transactionIdentifier,
      );
    } catch (e) {
      console.warn('Could not sync the store entitlement to the account', e);
    }
  }

  private async reportPurchase(
    transaction: PurchasesStoreTransaction | undefined,
    productIdentifier: string,
  ): Promise<void> {
    const token = transaction?.purchaseToken ?? transaction?.transactionIdentifier;
    await this.report(productIdentifier, token ?? productIdentifier, transaction?.transactionIdentifier);
  }

  private async report(
    productId: string,
    purchaseToken: string,
    originalTransactionId?: string,
  ): Promise<void> {
    if (!this.auth.isSignedIn) {
      return;
    }

    try {
      const response = await this.api.verifyPurchase({
        purchaseToken,
        productId,
        originalTransactionId,
      });
      this.serverEntitled = response.entitlement.isPremium;
      this.publish();
      await this.auth.syncProfile();
    } catch (e) {
      // A 501 here means the server has no store credentials configured yet.
      // The user keeps the premium the store already gave them; only the
      // durable, cross-device half is missing.
      console.warn('The server could not verify this purchase', e);
    }
  }

  private publish(): void {
    const next = this.storeEntitled || this.serverEntitled;
    if (next === this.isPremium) {
      return;
    }
    this.isPremium = next;
    this.isPremium$.next(next);
  }

  get isUserPremium(): boolean {
    return this.isPremium;
  }

  /** Where the current entitlement came from, for the profile screen. */
  get premiumSource(): 'store' | 'account' | 'none' {
    if (this.storeEntitled) return 'store';
    if (this.serverEntitled) return 'account';
    return 'none';
  }
}
