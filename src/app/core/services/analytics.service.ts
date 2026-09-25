import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Product analytics — currently inert, deliberately.
 *
 * This used to call `@capacitor-community/firebase-analytics`. That plugin was
 * never configured: there is no `google-services.json`, so Firebase could not
 * initialise and every call rejected silently. What it *did* do was merge
 * `com.google.android.gms.permission.AD_ID` into the manifest, so the app
 * asked for the advertising identifier, collected nothing with it, and
 * contradicted both its own privacy policy -- which states that no advertising
 * identifier is read -- and the Data Safety answers that have to match it.
 *
 * The plugin is gone rather than the call sites: what is worth measuring is
 * still recorded here, so turning analytics on later means adding a provider
 * back in one file instead of hunting for the events again. Until then nothing
 * leaves the device, which is what the listing promises.
 */
@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  async logEvent(name: string, params?: Record<string, unknown>): Promise<void> {
    if (!environment.production) {
      // Visible while a tool is being built, silent in a production build --
      // a released app should not narrate what someone is doing into a console.
      console.log(`Analytics Event: ${name}`, params ?? {});
    }
  }

  async setUserId(_userId: string): Promise<void> {
    // No provider to identify against. Kept so callers need no changes when
    // one is added.
  }
}
