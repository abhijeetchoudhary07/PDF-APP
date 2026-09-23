import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthSessionStore, type StoredSession } from './auth-session.store';
import {
  FREE_ENTITLEMENT,
  type PdfApiError,
  type PdfAuthResponse,
  type PdfEntitlement,
  type PdfMeResponse,
  type PdfSafeUser,
  type PdfSubscription,
} from './pdf-api.types';

/** Endpoints that must never carry a token or trigger a refresh. */
const UNAUTHENTICATED_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/subscription/plans'];

export const API_ROOT = `${environment.apiBaseUrl}/api/v1/pdf-app`;

export function isUnauthenticatedEndpoint(url: string): boolean {
  return UNAUTHENTICATED_PATHS.some((path) => url.includes(path));
}

/** A failure that already carries a message worth showing the user. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * The optional account layer.
 *
 * The app works fully signed out — every tool runs on the device either way.
 * An account buys two things: premium that follows the person to a new phone,
 * and premium that support can grant them without a store purchase. Nothing
 * here uploads document data.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthSessionStore);

  readonly user$ = new BehaviorSubject<PdfSafeUser | null>(null);
  readonly entitlement$ = new BehaviorSubject<PdfEntitlement>(FREE_ENTITLEMENT);
  readonly subscription$ = new BehaviorSubject<PdfSubscription | null>(null);

  /** False until the stored session has been read, so the UI can avoid a flash of "signed out". */
  readonly ready$ = new BehaviorSubject<boolean>(false);

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private syncedAt = 0;

  /**
   * In-flight refresh, shared by every caller.
   *
   * Refresh tokens rotate: two parallel refreshes would race, one would win and
   * the other would present a token the server has just revoked — signing the
   * user out in the middle of a working session. Single-flighting is not an
   * optimisation here, it is the correctness requirement.
   */
  private refreshInFlight: Promise<string | null> | null = null;

  private readonly restored = this.restore();

  get isSignedIn(): boolean {
    return this.user$.value !== null;
  }

  /** Last successful sync with the server, for "as of" messaging when offline. */
  get lastSyncedAt(): number {
    return this.syncedAt;
  }

  /** Resolves once the persisted session (if any) has been loaded. */
  whenReady(): Promise<void> {
    return this.restored;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  // --- Startup -------------------------------------------------------------

  private async restore(): Promise<void> {
    const stored = await this.store.load();

    if (stored) {
      this.accessToken = stored.accessToken;
      this.refreshToken = stored.refreshToken;
      this.syncedAt = stored.syncedAt;
      this.user$.next(stored.user);
      // Publish the cached entitlement immediately: a premium user opening the
      // app on a train should not see the paywall while /auth/me times out.
      this.entitlement$.next(stored.entitlement);
    }

    this.ready$.next(true);

    if (stored) {
      // Best effort. A failure leaves the cached entitlement in place, which is
      // the whole reason it is cached.
      void this.syncProfile();
    }
  }

  // --- Authentication ------------------------------------------------------

  async register(email: string, password: string, displayName?: string): Promise<void> {
    const response = await this.post<PdfAuthResponse>('/auth/register', {
      email,
      password,
      displayName,
    });
    await this.adoptSession(response);
  }

  async signIn(email: string, password: string): Promise<void> {
    const response = await this.post<PdfAuthResponse>('/auth/login', { email, password });
    await this.adoptSession(response);
  }

  async signOut(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.syncedAt = 0;
    this.refreshInFlight = null;
    this.user$.next(null);
    this.subscription$.next(null);
    this.entitlement$.next(FREE_ENTITLEMENT);
    await this.store.clear();
  }

  /**
   * Re-reads the profile and entitlement from the server.
   *
   * This is how an admin granting or revoking premium reaches the device: the
   * app calls it on resume, so the change lands without a reinstall.
   */
  async syncProfile(): Promise<PdfEntitlement | null> {
    if (!this.isSignedIn) {
      return null;
    }

    try {
      const me = await firstValueFrom(this.http.get<PdfMeResponse>(`${API_ROOT}/auth/me`));
      this.user$.next(me.user);
      this.entitlement$.next(me.entitlement);
      this.subscription$.next(me.subscription);
      this.syncedAt = Date.now();
      await this.persist();
      return me.entitlement;
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        // The account was suspended, or the refresh token is gone. Either way
        // this device is no longer signed in, and pretending otherwise just
        // produces a stream of failing calls.
        await this.signOut();
      }
      return null;
    }
  }

  /**
   * Exchanges the refresh token for a new pair.
   *
   * Returns the new access token, or null when the session is unrecoverable —
   * in which case the user has already been signed out.
   */
  refreshSession(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const token = this.refreshToken;
    if (!token) {
      return Promise.resolve(null);
    }

    this.refreshInFlight = (async () => {
      try {
        const response = await firstValueFrom(
          this.http.post<PdfAuthResponse>(`${API_ROOT}/auth/refresh`, { refreshToken: token }),
        );
        await this.adoptSession(response);
        return response.accessToken;
      } catch {
        await this.signOut();
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // --- Internals -----------------------------------------------------------

  private async adoptSession(response: PdfAuthResponse): Promise<void> {
    this.accessToken = response.accessToken;
    this.refreshToken = response.refreshToken;
    this.syncedAt = Date.now();
    this.user$.next(response.user);
    this.entitlement$.next(response.entitlement);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const user = this.user$.value;
    if (!this.accessToken || !this.refreshToken || !user) {
      return;
    }

    const session: StoredSession = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      user,
      entitlement: this.entitlement$.value,
      syncedAt: this.syncedAt,
    };

    await this.store.save(session);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(`${API_ROOT}${path}`, body));
    } catch (error) {
      throw toAuthError(error);
    }
  }
}

/**
 * Turns an HTTP failure into something worth putting in a toast.
 *
 * The server sends a human-readable `error` string for every 4xx it raises on
 * purpose, so that is preferred over anything invented here; status 0 means the
 * request never left the device, which is a different problem and deserves a
 * different sentence.
 */
export function toAuthError(error: unknown): AuthError {
  if (!(error instanceof HttpErrorResponse)) {
    return new AuthError('Something went wrong. Please try again.', 0);
  }

  if (error.status === 0) {
    return new AuthError('No connection. Check your network and try again.', 0);
  }

  const body = error.error as PdfApiError | string | null;
  const message =
    typeof body === 'object' && body && typeof body.error === 'string'
      ? body.error
      : 'Something went wrong. Please try again.';

  return new AuthError(message, error.status);
}
