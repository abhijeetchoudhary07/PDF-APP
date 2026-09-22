import { Injectable } from '@angular/core';
import { AdMob, BannerAdOptions, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Platform } from '@ionic/angular';
import { MonetizationService } from './monetization.service';

@Injectable({
  providedIn: 'root'
})
export class AdService {
  private isAdMobInitialized = false;

  constructor(
    private platform: Platform,
    private monetizationService: MonetizationService
  ) {
    this.initAdMob();
  }

  async initAdMob() {
    if (this.platform.is('capacitor')) {
      await AdMob.initialize({
        requestTrackingAuthorization: true,
        initializeForTesting: true, // Set to false in production
      } as any);
      this.isAdMobInitialized = true;
    }
  }

  async showBanner() {
    if (!this.isAdMobInitialized || this.monetizationService.isUserPremium) return;

    const options: BannerAdOptions = {
      adId: this.platform.is('ios') ? 'ios-banner-id' : 'android-banner-id', // Replace with real IDs
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: true // Set to false in production
    };

    await AdMob.showBanner(options);
  }

  async hideBanner() {
    if (!this.isAdMobInitialized) return;
    await AdMob.hideBanner();
  }
}
