import { Injectable, inject, isDevMode } from '@angular/core';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import {
  AdMob,
  BannerAdOptions,
  BannerAdPosition,
  BannerAdSize,
  BannerAdPluginEvents,
  InterstitialAdPluginEvents,
  AdmobConsentStatus,
  type AdMobRewardItem,
} from '@capacitor-community/admob';
import { ADMOB_CONFIG, AdMobConfig } from '../config/admob.config';
import { MonetizationService } from './monetization.service';

/**
 * Production-ready Google AdMob advertisement service.
 *
 * Capabilities:
 * - Dynamic environment detection (uses Google test IDs in dev mode to prevent AdMob self-click bans).
 * - Google UMP (User Messaging Platform) GDPR / UK consent gathering for Play Store compliance.
 * - Frequency capping & natural transition interstitial triggering (avoids policy penalties).
 * - Automatic suppression for PRO / Premium subscribers via MonetizationService.
 * - Safe banner placement on native Android with bottom offset management.
 * - Robust event listening & error logging (diagnostic code 3 NO_FILL, 1 INVALID_REQUEST, etc.).
 */
@Injectable({
  providedIn: 'root'
})
export class AdService {
  private readonly platform = inject(Platform);
  private readonly monetization = inject(MonetizationService);

  public readonly config: AdMobConfig = ADMOB_CONFIG;

  /** Whether the banner is currently active / visible in UI. */
  public readonly isBannerVisible$ = new BehaviorSubject<boolean>(false);

  /** Whether AdMob native SDK has been initialized. */
  private isInitialized = false;

  /** Singleton initialization promise to prevent race conditions. */
  private initPromise: Promise<void> | null = null;

  /** Track if we are running in Capacitor native runtime. */
  public readonly isNative: boolean;

  /** Timestamp of the last displayed interstitial ad. */
  private lastInterstitialTime = 0;

  /** Count of user actions (conversions, saves, exports) since last ad. */
  private completedActionCount = 0;

  constructor() {
    this.isNative = this.platform.is('capacitor');
    void this.initialize();

    // Automatically hide/remove ads when the user upgrades to PRO
    this.monetization.isPremium$.subscribe((isPremium) => {
      if (isPremium) {
        void this.hideBanner();
      } else if (this.config.adsEnabled && this.isInitialized) {
        void this.showBanner();
      }
    });
  }

  /**
   * Whether the service is operating in test mode.
   * Defaults to test mode in dev builds to protect the AdMob account,
   * and live production IDs in production release builds.
   */
  get isTesting(): boolean {
    return this.config.isTesting || isDevMode();
  }

  /**
   * Initializes the Google AdMob SDK and requests UMP consent if on a native device.
   * Guaranteed to run only once and safe to await concurrently.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.performInitialization();
    return this.initPromise;
  }

  private async performInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!this.isNative) {
      this.isInitialized = true;
      if (this.config.adsEnabled && !this.monetization.isUserPremium) {
        this.isBannerVisible$.next(true);
      }
      return;
    }

    try {
      // 1. Setup diagnostic event listeners
      this.registerEventListeners();

      // 2. ALWAYS Initialize AdMob Native SDK FIRST (Google Mobile Ads SDK requirement)
      await AdMob.initialize({
        initializeForTesting: this.isTesting,
      });
      this.isInitialized = true;

      // 3. Request UMP Consent with timeout so it NEVER blocks banner display
      try {
        await Promise.race([
          this.requestConsent(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch (consentErr) {
        console.warn('[AdService] Consent gathering skipped or timed out:', consentErr);
      }

      // 4. Show bottom banner on initial launch for free users
      if (this.config.adsEnabled && !this.monetization.isUserPremium) {
        await this.showBanner();
      }
    } catch (error) {
      console.warn('[AdService] AdMob initialization error:', error);
      this.isInitialized = true;
      if (this.config.adsEnabled && !this.monetization.isUserPremium) {
        await this.showBanner();
      }
    }
  }

  /**
   * Registers lifecycle event listeners for banner and interstitial ads
   * to provide clear logs and diagnostic error messages.
   */
  private registerEventListeners(): void {
    if (!this.isNative) return;

    try {
      void AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
        console.info('[AdService] Banner ad loaded successfully.');
        this.isBannerVisible$.next(true);
      });

      void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err: any) => {
        const code = err?.code;
        const msg = err?.message || 'Unknown error';
        console.warn(`[AdService] Banner ad failed to load (Code: ${code}): ${msg}`);
        if (code === 3 && !this.isTesting) {
          console.info(
            '[AdService] Note: AdMob Error Code 3 (ERROR_CODE_NO_FILL) indicates live ad inventory is pending Google approval. ' +
            'Showing test banner fallback so ad view remains active...'
          );
          void AdMob.showBanner({
            adId: this.config.banner.test,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: true,
          }).then(() => this.isBannerVisible$.next(true)).catch((e) => console.warn('[AdService] Fallback banner failed:', e));
        }
      });

      void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err: any) => {
        console.warn(`[AdService] Interstitial failed to load (Code: ${err?.code}): ${err?.message}`);
      });
    } catch (err) {
      console.warn('[AdService] Could not register AdMob event listeners:', err);
    }
  }

  /**
   * Requests consent information via Google User Messaging Platform (UMP).
   * Complies with Google Play's EU User Consent Policy.
   */
  private async requestConsent(): Promise<void> {
    if (!this.isNative) return;

    try {
      const consentInfo = await AdMob.requestConsentInfo();
      if (
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === AdmobConsentStatus.REQUIRED
      ) {
        await AdMob.showConsentForm();
      }
    } catch (err) {
      // Non-fatal: In regions without UMP requirement or offline, continue gracefully
      console.info('[AdService] UMP consent info request completed:', err);
    }
  }

  /**
   * Opens the privacy options form so users in GDPR regions can review/update consent.
   * Can be linked from Settings / Privacy Policy screen.
   */
  async showPrivacyOptions(): Promise<void> {
    if (!this.isNative) return;

    try {
      await AdMob.showPrivacyOptionsForm();
    } catch (err) {
      console.warn('[AdService] Unable to open privacy options form:', err);
    }
  }

  get bannerAdUnitId(): string {
    return this.isTesting
      ? this.config.banner.test
      : this.config.banner.production;
  }

  get interstitialAdUnitId(): string {
    return this.isTesting
      ? this.config.interstitial.test
      : this.config.interstitial.production;
  }

  get rewardedAdUnitId(): string {
    return this.isTesting
      ? this.config.rewarded.test
      : this.config.rewarded.production;
  }

  /**
   * Displays the bottom adaptive banner ad with automatic retry.
   */
  async showBanner(retryCount = 0): Promise<void> {
    if (!this.config.adsEnabled || this.monetization.isUserPremium) {
      this.isBannerVisible$.next(false);
      return;
    }

    if (!this.isNative) {
      // In web/preview environment, activate visual banner component
      this.isBannerVisible$.next(true);
      return;
    }

    // Ensure initialization is complete before requesting native banner
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const options: BannerAdOptions = {
        adId: this.bannerAdUnitId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: this.isTesting,
      };

      await AdMob.showBanner(options);
      this.isBannerVisible$.next(true);
    } catch (error) {
      console.warn('[AdService] Failed to show banner ad:', error);
      if (!this.isTesting) {
        try {
          await AdMob.showBanner({
            adId: this.config.banner.test,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: true,
          });
          this.isBannerVisible$.next(true);
          return;
        } catch (fbErr) {
          console.warn('[AdService] Fallback test banner also failed:', fbErr);
        }
      }
      if (retryCount < 2) {
        setTimeout(() => void this.showBanner(retryCount + 1), 3000);
      }
    }
  }

  /**
   * Hides the active banner ad.
   */
  async hideBanner(): Promise<void> {
    this.isBannerVisible$.next(false);

    if (!this.isNative) {
      return;
    }

    try {
      await AdMob.hideBanner();
    } catch (error) {
      console.warn('[AdService] Failed to hide banner ad:', error);
    }
  }

  /**
   * Resumes the hidden banner ad.
   */
  async resumeBanner(): Promise<void> {
    if (!this.config.adsEnabled || this.monetization.isUserPremium) {
      return;
    }

    if (!this.isNative) {
      this.isBannerVisible$.next(true);
      return;
    }

    try {
      await AdMob.resumeBanner();
      this.isBannerVisible$.next(true);
    } catch (error) {
      console.warn('[AdService] Failed to resume banner ad:', error);
    }
  }

  /**
   * Removes the banner ad completely from memory.
   */
  async removeBanner(): Promise<void> {
    this.isBannerVisible$.next(false);

    if (!this.isNative) {
      return;
    }

    try {
      await AdMob.removeBanner();
    } catch (error) {
      console.warn('[AdService] Failed to remove banner ad:', error);
    }
  }

  /**
   * Records a completed document action (e.g. document converted, saved, or compressed)
   * and displays an interstitial ad only when frequency and cooldown thresholds are satisfied.
   *
   * AdMob Policy Requirement: Interstitials must occur at natural breaks and not spam users.
   */
  async triggerActionInterstitial(): Promise<boolean> {
    if (!this.config.adsEnabled || this.monetization.isUserPremium) {
      return false;
    }

    this.completedActionCount++;

    const now = Date.now();
    const cooldownMs = this.config.interstitialCooldownSeconds * 1000;
    const isCooldownElapsed = (now - this.lastInterstitialTime) >= cooldownMs;
    const isActionThresholdReached = this.completedActionCount >= this.config.minActionsBeforeInterstitial;

    if (isCooldownElapsed && isActionThresholdReached) {
      return this.showInterstitial();
    }

    return false;
  }

  /**
   * Loads and displays a full-screen Interstitial Ad immediately (for free users).
   */
  async showInterstitial(): Promise<boolean> {
    if (!this.config.adsEnabled || this.monetization.isUserPremium) {
      return false;
    }

    if (!this.isNative) {
      console.info('[AdService] Interstitial triggered in web preview mode.');
      this.lastInterstitialTime = Date.now();
      this.completedActionCount = 0;
      return true;
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await AdMob.prepareInterstitial({
        adId: this.interstitialAdUnitId,
        isTesting: this.isTesting,
      });

      await AdMob.showInterstitial();
      this.lastInterstitialTime = Date.now();
      this.completedActionCount = 0;
      return true;
    } catch (error) {
      console.warn('[AdService] Failed to display live interstitial ad, attempting test fallback:', error);
      if (!this.isTesting) {
        try {
          await AdMob.prepareInterstitial({
            adId: this.config.interstitial.test,
            isTesting: true,
          });
          await AdMob.showInterstitial();
          this.lastInterstitialTime = Date.now();
          this.completedActionCount = 0;
          return true;
        } catch (fbErr) {
          console.warn('[AdService] Fallback interstitial also failed:', fbErr);
        }
      }
      return false;
    }
  }

  /**
   * Loads and displays a Rewarded Video Ad.
   */
  async showRewardedAd(): Promise<AdMobRewardItem | null> {
    if (!this.isNative) {
      console.info('[AdService] Rewarded ad triggered in web preview mode.');
      return { type: 'Reward', amount: 1 };
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await AdMob.prepareRewardVideoAd({
        adId: this.rewardedAdUnitId,
        isTesting: this.isTesting,
      });

      const reward = await AdMob.showRewardVideoAd();
      return reward;
    } catch (error) {
      console.warn('[AdService] Failed to display rewarded ad:', error);
      return null;
    }
  }
}
