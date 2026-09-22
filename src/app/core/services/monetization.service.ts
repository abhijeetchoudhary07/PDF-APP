import { Injectable } from '@angular/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { Platform } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MonetizationService {
  public isPremium$ = new BehaviorSubject<boolean>(false);
  private isPremium = false;

  constructor(private platform: Platform) {
    this.initRevenueCat();
  }

  async initRevenueCat() {
    if (this.platform.is('capacitor')) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      
      // Use your RevenueCat API keys here
      const apiKey = this.platform.is('ios') ? 'appl_XXXXX' : 'goog_XXXXX';
      await Purchases.configure({ apiKey });

      this.checkSubscriptionStatus();
    }
  }

  async checkSubscriptionStatus() {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      // 'premium' is the typical entitlement identifier set in RevenueCat
      if (typeof customerInfo.customerInfo.entitlements.active['premium'] !== 'undefined') {
        this.isPremium = true;
      } else {
        this.isPremium = false;
      }
      this.isPremium$.next(this.isPremium);
    } catch (e) {
      console.error('Error fetching customer info', e);
    }
  }

  async purchasePackage(pkg: any): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      if (typeof customerInfo.entitlements.active['premium'] !== 'undefined') {
        this.isPremium = true;
        this.isPremium$.next(true);
        return true;
      }
    } catch (e) {
      console.error('Purchase failed', e);
    }
    return false;
  }

  async restorePurchases(): Promise<boolean> {
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      if (typeof customerInfo.entitlements.active['premium'] !== 'undefined') {
        this.isPremium = true;
        this.isPremium$.next(true);
        return true;
      }
    } catch (e) {
      console.error('Restore failed', e);
    }
    return false;
  }

  get isUserPremium(): boolean {
    return this.isPremium;
  }
}
