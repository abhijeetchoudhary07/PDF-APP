/**
 * Google AdMob configuration for Indian Form Helper / PDF & Image Tools.
 *
 * Registered App: PDF & Image Tools: Form Helper
 * Package Name: com.pdfhelper.indianformhelper
 * AdMob App ID: ca-app-pub-4740907887313137~8958102463
 * Publisher ID: pub-4740907887313137
 */

export interface AdMobUnitConfig {
  production: string;
  test: string;
}

export interface AdMobConfig {
  appId: string;
  publisherId: string;
  banner: AdMobUnitConfig;
  interstitial: AdMobUnitConfig;
  rewarded: AdMobUnitConfig;
  /**
   * Set to true during development / automated testing to avoid policy violations.
   * On release builds this should be false so live ads serve.
   */
  isTesting: boolean;
  /** Global toggle to enable/disable ads in the application. */
  adsEnabled: boolean;
  /** Minimum seconds between full-screen interstitial ads (AdMob policy compliant). */
  interstitialCooldownSeconds: number;
  /** Minimum user actions (exports/conversions) before showing an interstitial ad. */
  minActionsBeforeInterstitial: number;
}

export const ADMOB_CONFIG: AdMobConfig = {
  appId: 'ca-app-pub-4740907887313137~8958102463',
  publisherId: 'pub-4740907887313137',

  banner: {
    // Live AdMob Banner ID for PDF & Image Tools: Form Helper
    production: 'ca-app-pub-4740907887313137/7261877414',
    // Standard Google AdMob Test Banner ID
    test: 'ca-app-pub-3940256099942544/6300978111',
  },

  interstitial: {
    // Live AdMob Interstitial ID for PDF & Image Tools: Form Helper
    production: 'ca-app-pub-4740907887313137/2009550738',
    // Standard Google AdMob Test Interstitial ID
    test: 'ca-app-pub-3940256099942544/1033173712',
  },

  rewarded: {
    // Live AdMob Rewarded ID for PDF & Image Tools: Form Helper
    production: 'ca-app-pub-4740907887313137/5757224059',
    // Standard Google AdMob Test Rewarded ID
    test: 'ca-app-pub-3940256099942544/5224354917',
  },

  // Set isTesting to false for production live ads (or override dynamically via isDevMode)
  isTesting: false,
  adsEnabled: true,
  interstitialCooldownSeconds: 90,
  minActionsBeforeInterstitial: 2,
};
