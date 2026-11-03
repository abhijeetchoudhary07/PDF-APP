import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { AdMob } from '@capacitor-community/admob';
import { MonetizationService } from './monetization.service';
import { AdService } from './ad.service';

vi.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: vi.fn(async () => undefined),
    showBanner: vi.fn(async () => undefined),
    hideBanner: vi.fn(async () => undefined),
    resumeBanner: vi.fn(async () => undefined),
    removeBanner: vi.fn(async () => undefined),
    prepareInterstitial: vi.fn(async () => ({})),
    showInterstitial: vi.fn(async () => undefined),
    prepareRewardVideoAd: vi.fn(async () => ({})),
    showRewardVideoAd: vi.fn(async () => ({ type: 'Reward', amount: 1 })),
    requestConsentInfo: vi.fn(async () => ({
      status: 'OBTAINED',
      isConsentFormAvailable: false,
      canRequestAds: true,
      privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    })),
    showConsentForm: vi.fn(async () => ({})),
    showPrivacyOptionsForm: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
  BannerAdSize: { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' },
  BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' },
  BannerAdPluginEvents: {
    SizeChanged: 'bannerAdSizeChanged',
    Loaded: 'bannerAdLoaded',
    FailedToLoad: 'bannerAdFailedToLoad',
    Opened: 'bannerAdOpened',
    Closed: 'bannerAdClosed',
    AdImpression: 'bannerAdImpression',
    AdPaid: 'bannerAdPaid',
  },
  InterstitialAdPluginEvents: {
    Loaded: 'interstitialAdLoaded',
    FailedToLoad: 'interstitialAdFailedToLoad',
    Showed: 'interstitialAdShowed',
    FailedToShow: 'interstitialAdFailedToShow',
    Dismissed: 'interstitialAdDismissed',
    AdImpression: 'interstitialAdImpression',
  },
  AdmobConsentStatus: {
    UNKNOWN: 'UNKNOWN',
    NOT_REQUIRED: 'NOT_REQUIRED',
    REQUIRED: 'REQUIRED',
    OBTAINED: 'OBTAINED',
  },
}));

describe('AdService (Production Ready)', () => {
  let isPremium$: BehaviorSubject<boolean>;
  let monetizationMock: { isPremium$: BehaviorSubject<boolean>; isUserPremium: boolean };
  let platformMock: { is: (platform: string) => boolean };

  beforeEach(() => {
    vi.clearAllMocks();
    isPremium$ = new BehaviorSubject<boolean>(false);
    monetizationMock = {
      isPremium$,
      get isUserPremium() {
        return isPremium$.value;
      },
    };
    platformMock = {
      is: (p: string) => p === 'capacitor',
    };
  });

  function createService(): AdService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AdService,
        { provide: MonetizationService, useValue: monetizationMock },
        { provide: Platform, useValue: platformMock },
      ],
    });
    return TestBed.inject(AdService);
  }

  it('initializes AdMob on native platform for free users, requests consent, and shows banner', async () => {
    const service = createService();
    await service.initialize();

    expect(AdMob.requestConsentInfo).toHaveBeenCalled();
    expect(AdMob.initialize).toHaveBeenCalled();
    expect(AdMob.showBanner).toHaveBeenCalled();
    expect(service.isBannerVisible$.value).toBe(true);
  });

  it('hides banner when user upgrades to PRO / premium', async () => {
    const service = createService();
    await service.initialize();

    expect(service.isBannerVisible$.value).toBe(true);

    isPremium$.next(true);

    expect(AdMob.hideBanner).toHaveBeenCalled();
    expect(service.isBannerVisible$.value).toBe(false);
  });

  it('does not display interstitial ads for PRO / premium users', async () => {
    const service = createService();
    isPremium$.next(true);

    const result = await service.showInterstitial();

    expect(result).toBe(false);
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
    expect(AdMob.showInterstitial).not.toHaveBeenCalled();
  });

  it('displays interstitial ads for free users on native device', async () => {
    const service = createService();
    isPremium$.next(false);

    const result = await service.showInterstitial();

    expect(result).toBe(true);
    expect(AdMob.prepareInterstitial).toHaveBeenCalledWith({
      adId: service.interstitialAdUnitId,
      isTesting: service.isTesting,
    });
    expect(AdMob.showInterstitial).toHaveBeenCalled();
  });

  it('enforces frequency capping on action interstitials', async () => {
    const service = createService();
    isPremium$.next(false);

    // First action - threshold (2) not reached yet
    const res1 = await service.triggerActionInterstitial();
    expect(res1).toBe(false);
    expect(AdMob.showInterstitial).not.toHaveBeenCalled();

    // Second action - threshold reached, should show
    const res2 = await service.triggerActionInterstitial();
    expect(res2).toBe(true);
    expect(AdMob.showInterstitial).toHaveBeenCalledTimes(1);

    // Immediate third action - cooldown not elapsed, should not show
    const res3 = await service.triggerActionInterstitial();
    expect(res3).toBe(false);
    expect(AdMob.showInterstitial).toHaveBeenCalledTimes(1);
  });

  it('allows opening GDPR privacy options form on native devices', async () => {
    const service = createService();
    await service.showPrivacyOptions();
    expect(AdMob.showPrivacyOptionsForm).toHaveBeenCalled();
  });

  it('provides the correct AdMob production and test ad unit IDs', () => {
    const service = createService();
    expect(service.config.appId).toBe('ca-app-pub-4740907887313137~8958102463');
    expect(service.config.banner.production).toBe('ca-app-pub-4740907887313137/7261877414');
    expect(service.config.interstitial.production).toBe('ca-app-pub-4740907887313137/2009550738');
    expect(service.config.rewarded.production).toBe('ca-app-pub-4740907887313137/5757224059');
  });
});
