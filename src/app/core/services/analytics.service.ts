import { Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-community/firebase-analytics';
import { Platform } from '@ionic/angular';
import { environment } from '../../../environments/environment';

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
    } else if (!environment.production) {
      /*
       * There is no Firebase off-device, so the event has nowhere to go. It is
       * echoed during development to make the funnel visible while a tool is
       * being built — but not in a production web build, where it would print
       * a running commentary of what the user is doing into a console anyone
       * can open.
       */
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
