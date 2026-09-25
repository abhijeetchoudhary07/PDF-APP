/**
 * Store (RevenueCat) credentials.
 *
 * These are publishable client keys, not secrets — RevenueCat expects them in
 * the app bundle. They live here rather than inline in the service so that
 * "has anyone filled these in yet?" is a one-file question, and so the app can
 * tell the difference between *no store* and *a store nobody configured*.
 *
 * Get them from RevenueCat → Project settings → API keys → Public app keys.
 */
export const REVENUECAT_API_KEYS = {
  android: 'goog_XXXXX',
  ios: 'appl_XXXXX',
} as const;

/**
 * True once a real key has replaced the placeholder.
 *
 * Shipping with the placeholder is the failure that looks like nothing at all:
 * `Purchases.configure()` accepts the string, every offering comes back empty,
 * and each plan button ends in a dismissible toast instead of a Play checkout
 * sheet. Checking explicitly turns that into something the paywall can say out
 * loud and a test can assert on.
 */
export function isStoreConfigured(apiKey: string): boolean {
  return !!apiKey && !/XXXXX/i.test(apiKey);
}

/**
 * How far the store got. The paywall renders a different explanation for each,
 * because "you are in a browser" and "this build has no store keys" need very
 * different follow-up actions.
 */
export type StoreStatus =
  /** No Capacitor runtime: a browser or `ng serve`. There is no billing here. */
  | 'off-device'
  /** On a device, but the build still carries placeholder credentials. */
  | 'not-configured'
  /** Configured and reached, but the store returned no purchasable products. */
  | 'no-products'
  /** Configured, reached, and offering packages. */
  | 'ready'
  /** Configured, but the store could not be reached at all. */
  | 'error';

/**
 * The Play Console product id that sells each server plan.
 *
 * The keys are `pdf_plans.plan_id` as the server serves them; the values are
 * the product ids created in **Play Console → Monetise → Products**. They are
 * deliberately the same strings — there is no reason for them to differ, and a
 * mapping nobody can hold in their head is how a paywall ends up selling the
 * annual plan at the monthly price.
 *
 * `pro_monthly` and `pro_annual` are **subscriptions**; `lifetime` is a
 * **one-time in-app product**. The distinction is made in the Console, not
 * here, and it decides which of the two Play product catalogues you create it
 * in.
 *
 * `free` is absent on purpose: it is not sold.
 */
export const PLAY_PRODUCT_IDS: Readonly<Record<string, string>> = {
  pro_monthly: 'pro_monthly',
  pro_annual: 'pro_annual',
  lifetime: 'lifetime',
};

/**
 * Strips the base-plan suffix Play appends to subscription products.
 *
 * A Play subscription is a product plus a base plan, and RevenueCat reports the
 * pair as `pro_monthly:monthly` in `product.identifier` while the Console shows
 * the product as `pro_monthly`. Matching the two strings directly therefore
 * finds every one-time product and no subscription at all — a paywall where
 * only the lifetime button works, which is a miserable thing to diagnose from a
 * store report.
 */
export function baseProductId(productIdentifier: string): string {
  return productIdentifier.split(':')[0];
}
