import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_ROOT, AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

/**
 * The interceptor is the only thing standing between a 15-minute access token
 * and a user being thrown back to the sign-in screen mid-session, so the retry
 * path is pinned here rather than left to manual testing.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: {
    getAccessToken: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    auth = {
      getAccessToken: vi.fn(() => 'access-token-1'),
      refreshSession: vi.fn(async () => 'access-token-2'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  it('attaches the access token to backend calls', () => {
    http.get(`${API_ROOT}/auth/me`).subscribe();

    const req = backend.expectOne(`${API_ROOT}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token-1');
    req.flush({});
    backend.verify();
  });

  it('leaves local asset requests alone', () => {
    // These are bundled JSON files, not API calls. A bearer token on them is
    // both pointless and a leak if the path ever became remote.
    http.get('assets/presets/photo-presets.json').subscribe();

    const req = backend.expectOne('assets/presets/photo-presets.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
    backend.verify();
  });

  it('does not send a token to the endpoints that issue one', () => {
    http.post(`${API_ROOT}/auth/login`, {}).subscribe();
    const login = backend.expectOne(`${API_ROOT}/auth/login`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush({});

    http.post(`${API_ROOT}/auth/refresh`, {}).subscribe();
    const refresh = backend.expectOne(`${API_ROOT}/auth/refresh`);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({});

    backend.verify();
  });

  it('renews an expired token and retries the call once', async () => {
    const seen: unknown[] = [];
    http.get(`${API_ROOT}/auth/me`).subscribe((value) => seen.push(value));

    const first = backend.expectOne(`${API_ROOT}/auth/me`);
    expect(first.request.headers.get('Authorization')).toBe('Bearer access-token-1');
    first.flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    // The refresh is a promise, so the retry lands on a later microtask.
    await Promise.resolve();
    await Promise.resolve();

    const retry = backend.expectOne(`${API_ROOT}/auth/me`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-token-2');
    retry.flush({ ok: true });

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ ok: true }]);
    backend.verify();
  });

  it('gives up when the refresh fails, rather than looping', async () => {
    auth.refreshSession = vi.fn(async () => null);

    let failure: unknown = null;
    http.get(`${API_ROOT}/auth/me`).subscribe({ error: (err) => (failure = err) });

    backend
      .expectOne(`${API_ROOT}/auth/me`)
      .flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    await Promise.resolve();

    expect(failure).toBeTruthy();
    // No second attempt: a retry loop against a dead session is how an app
    // ends up hammering the server from every open screen.
    backend.verify();
  });

  it('does not treat other failures as an expired token', async () => {
    let failure: unknown = null;
    http.get(`${API_ROOT}/auth/me`).subscribe({ error: (err) => (failure = err) });

    backend
      .expectOne(`${API_ROOT}/auth/me`)
      .flush({ error: 'suspended' }, { status: 403, statusText: 'Forbidden' });

    await Promise.resolve();

    expect(failure).toBeTruthy();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    backend.verify();
  });
});
