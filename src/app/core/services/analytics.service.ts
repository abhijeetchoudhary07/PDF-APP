import { Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-community/firebase-analytics';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  constructor(private platform: Platform) {}

  async logEvent(name: string, params?: any) {
    if (this.platform.is('capacitor')) {
      await FirebaseAnalytics.logEvent({
        name,
        params: params || {}
      });
    } else {
      console.log(`Analytics Event: ${name}`, params);
    }
  }

  async setUserId(userId: string) {
    if (this.platform.is('capacitor')) {
      await FirebaseAnalytics.setUserId({
        userId,
      });
    }
  }
}
