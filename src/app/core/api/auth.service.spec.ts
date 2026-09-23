import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_ROOT, AuthService } from './auth.service';
import { AuthSessionStore, type StoredSession } from './auth-session.store';
import { FREE_ENTITLEMENT, type PdfAuthResponse } from './pdf-api.types';

function authResponse(overrides: Partial<PdfAuthResponse> = {}): PdfAuthResponse {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 900,
    tokenType: 'Bearer',
    user: {
      id: 'u1',
      email: 'reader@example.in',
      displayName: 'Reader',
      authProvider: 'email',
      isActive: true,
      isVerified: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    },
    entitlement: FREE_ENTITLEMENT,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let backend: HttpTestingController;
  let store: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  function configure(stored: StoredSession | null = null) {
    store = {
      load: vi.fn(async () => stored),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionStore, useValue: store },
      ],
    });

    service = TestBed.inject(AuthService);
    backend = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts signed out and reports ready once storage has been read', async () => {
    configure(null);
    await service.whenReady();

    expect(service.isSignedIn).toBe(false);
    expect(service.ready$.value).toBe(true);
    expect(service.entitlement$.value.isPremium).toBe(false);
    backend.verify();
  });

  it('persists the session after a sign-in', async () => {
    configure(null);
    await service.whenReady();

    const signIn = service.signIn('reader@example.in', 'CorrectHorse1');
    backend.expectOne(`${API_ROOT}/auth/login`).flush(authResponse());
    await signIn;

    expect(service.isSignedIn).toBe(true);
    expect(service.getAccessToken()).toBe('access-1');
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
    );
    backend.verify();
  });

  it('publishes the cached entitlement before the server answers', async () => {
    // The point of caching: a premium user opening the app offline must not be
    // shown the paywall while /auth/me times out.
    configure({
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      user: authResponse().user,
      entitlement: { ...FREE_ENTITLEMENT, isPremium: true, planId: 'lifetime', status: 'active' },
      syncedAt: Date.now() - 60_000,
    });

    await service.whenReady();

    expect(service.entitlement$.value.isPremium).toBe(true);
    expect(service.entitlement$.value.planId).toBe('lifetime');

    // The restore kicks off a background /auth/me; answer it so the test ends clean.
    backend.expectOne(`${API_ROOT}/auth/me`).flush({
      user: authResponse().user,
      entitlement: FREE_ENTITLEMENT,
      subscription: null,
    });
    backend.verify();
  });

  it('shares one rotation between concurrent refreshes', async () => {
    configure(null);
    await service.whenReady();

    const signIn = service.signIn('reader@example.in', 'CorrectHorse1');
    backend.expectOne(`${API_ROOT}/auth/login`).flush(authResponse());
    await signIn;

    // Refresh tokens rotate, so two parallel exchanges would present the same
    // token twice and the loser would be signed out mid-session.
    const first = service.refreshSession();
    const second = service.refreshSession();

    const requests = backend.match(`${API_ROOT}/auth/refresh`);
    expect(requests.length).toBe(1);
    requests[0].flush(authResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' }));

    expect(await first).toBe('access-2');
    expect(await second).toBe('access-2');
    expect(service.getAccessToken()).toBe('access-2');
    backend.verify();
  });

  it('signs out when the refresh token is rejected', async () => {
    configure(null);
    await service.whenReady();

    const signIn = service.signIn('reader@example.in', 'CorrectHorse1');
    backend.expectOne(`${API_ROOT}/auth/login`).flush(authResponse());
    await signIn;

    const refreshed = service.refreshSession();
    backend
      .expectOne(`${API_ROOT}/auth/refresh`)
      .flush({ error: 'invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(await refreshed).toBeNull();
    expect(service.isSignedIn).toBe(false);
    expect(store.clear).toHaveBeenCalled();
    backend.verify();
  });

  it('signs out when the account has been suspended', async () => {
    configure(null);
    await service.whenReady();

    const signIn = service.signIn('reader@example.in', 'CorrectHorse1');
    backend.expectOne(`${API_ROOT}/auth/login`).flush(authResponse());
    await signIn;

    const synced = service.syncProfile();
    backend
      .expectOne(`${API_ROOT}/auth/me`)
      .flush({ error: 'suspended' }, { status: 403, statusText: 'Forbidden' });

    expect(await synced).toBeNull();
    expect(service.isSignedIn).toBe(false);
    expect(service.entitlement$.value.isPremium).toBe(false);
    backend.verify();
  });

  it('keeps the last known entitlement when the server is unreachable', async () => {
    configure(null);
    await service.whenReady();

    const signIn = service.signIn('reader@example.in', 'CorrectHorse1');
    backend
      .expectOne(`${API_ROOT}/auth/login`)
      .flush(authResponse({ entitlement: { ...FREE_ENTITLEMENT, isPremium: true, planId: 'pro_annual', status: 'active' } }));
    await signIn;

    const synced = service.syncProfile();
    backend.expectOne(`${API_ROOT}/auth/me`).error(new ProgressEvent('offline'), { status: 0 });

    expect(await synced).toBeNull();
    // Still signed in, still premium: a dead network is not a revocation.
    expect(service.isSignedIn).toBe(true);
    expect(service.entitlement$.value.isPremium).toBe(true);
    backend.verify();
  });

  it('does not call the server when signed out', async () => {
    configure(null);
    await service.whenReady();

    expect(await service.syncProfile()).toBeNull();
    backend.verify();
  });
});
