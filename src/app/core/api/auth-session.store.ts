import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { PdfEntitlement, PdfSafeUser } from './pdf-api.types';

const SESSION_KEY = 'IFH_PDF_ACCOUNT_SESSION_V1';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: PdfSafeUser;
  /**
   * Last entitlement the server reported.
   *
   * Cached so a launch with no network still knows the user is premium. It is
   * replaced by the live value as soon as `/auth/me` answers, so a revocation
   * takes effect on the next successful call rather than persisting forever.
   */
  entitlement: PdfEntitlement;
  /** When the cached entitlement was written, for staleness messaging. */
  syncedAt: number;
}

/**
 * Persists the signed-in session across app launches.
 *
 * Capacitor Preferences, not a keystore: this app ships no secure-storage
 * plugin, and Preferences already lands in the app's private sandbox
 * (SharedPreferences / UserDefaults), which is where a token lives in most
 * apps that have not taken a native keystore dependency. The exposure that
 * remains is a rooted or jailbroken device, and it is bounded on the server
 * side -- access tokens last 15 minutes, refresh tokens rotate on every use
 * and are revoked the moment an admin suspends the account.
 *
 * Nothing about the user's documents is stored here.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  async load(): Promise<StoredSession | null> {
    try {
      const { value } = await Preferences.get({ key: SESSION_KEY });
      if (!value) {
        return null;
      }

      const parsed = JSON.parse(value) as Partial<StoredSession>;
      // A half-written or hand-edited blob must read as "signed out" rather
      // than crash the app on launch.
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.user) {
        return null;
      }

      return parsed as StoredSession;
    } catch {
      return null;
    }
  }

  async save(session: StoredSession): Promise<void> {
    try {
      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
    } catch (error) {
      // Losing persistence costs the user a sign-in next launch; it must not
      // fail the sign-in that is happening right now.
      console.warn('Could not persist the account session', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await Preferences.remove({ key: SESSION_KEY });
    } catch (error) {
      console.warn('Could not clear the account session', error);
    }
  }
}
