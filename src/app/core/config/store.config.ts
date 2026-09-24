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
