import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { MonetizationService } from './monetization.service';
import { FREE_DAILY_OPERATIONS, UsageQuotaService } from './usage-quota.service';

/**
 * An in-memory stand-in for Capacitor Preferences.
 *
 * The quota is the only thing standing between the free tier and unlimited use,
 * so these tests are about the ways it could quietly fail open: a day boundary
 * that does not reset, a batch that counts fifty times, a premium upgrade that
 * does not lift the cap.
 */
const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      store.delete(key);
    }),
  },
}));

const KEY = 'IFH_DAILY_USAGE_V1';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

describe('UsageQuotaService', () => {
  let isPremium$: BehaviorSubject<boolean>;
  let premium: boolean;

  function makeService(): UsageQuotaService {
    isPremium$ = new BehaviorSubject<boolean>(premium);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UsageQuotaService,
        {
          provide: MonetizationService,
          useValue: {
            isPremium$,
            get isUserPremium() {
              return premium;
            },
          },
        },
      ],
    });
    return TestBed.inject(UsageQuotaService);
  }

  beforeEach(() => {
    store.clear();
    premium = false;
  });

  it('starts a fresh day with the full allowance', async () => {
    const quota = makeService();

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS);
    expect(await quota.canStart()).toBe(true);
  });

  it('publishes nothing until the first read, so premium never flashes a limit', () => {
    premium = true;
    const quota = makeService();

    // Rendered as "no chip at all" rather than "5 left today".
    expect(quota.remaining$.value).toBeNull();
  });

  it('counts each operation and blocks once the allowance is spent', async () => {
    const quota = makeService();

    for (let i = 0; i < FREE_DAILY_OPERATIONS; i++) {
      expect(await quota.canStart()).toBe(true);
      await quota.consume(`op-${i}`);
    }

    expect(await quota.remaining()).toBe(0);
    expect(await quota.canStart()).toBe(false);
  });

  it('publishes the remaining count so the header can show it', async () => {
    const quota = makeService();
    await quota.load();

    expect(quota.remaining$.value).toBe(FREE_DAILY_OPERATIONS);

    await quota.consume('op-1');

    expect(quota.remaining$.value).toBe(FREE_DAILY_OPERATIONS - 1);
    expect(quota.used$.value).toBe(1);
  });

  it('counts one operation per id, so a batch of many files costs one', async () => {
    const quota = makeService();

    // Fifty files saved under a single batch id.
    for (let i = 0; i < 50; i++) {
      await quota.consume('batch-1');
    }

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS - 1);
  });

  it('counts saving and then sharing the same output once', async () => {
    const quota = makeService();

    // StorageService derives this id from the file itself.
    await quota.consume('report.pdf|1024|999');
    await quota.consume('report.pdf|1024|999');

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS - 1);
  });

  it('resets when the stored day is not today', async () => {
    store.set(KEY, JSON.stringify({ date: '2020-01-01', count: FREE_DAILY_OPERATIONS }));
    const quota = makeService();

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS);
    expect(await quota.canStart()).toBe(true);
  });

  it('keeps counting within the same day across service restarts', async () => {
    store.set(KEY, JSON.stringify({ date: today(), count: 4 }));
    const quota = makeService();

    expect(await quota.remaining()).toBe(1);
    await quota.consume('op-x');
    expect(await quota.canStart()).toBe(false);
  });

  it('treats a corrupt stored value as a fresh day rather than a lockout', async () => {
    store.set(KEY, '{not json');
    const quota = makeService();

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS);
  });

  it('never blocks or counts a premium account', async () => {
    premium = true;
    const quota = makeService();

    for (let i = 0; i < 20; i++) {
      await quota.consume(`op-${i}`);
    }

    expect(await quota.canStart()).toBe(true);
    expect(await quota.remaining()).toBeNull();
    // Nothing was written, so downgrading later starts from a clean day.
    expect(store.get(KEY)).toBeUndefined();
  });

  it('lifts the cap the moment premium becomes active, without a restart', async () => {
    const quota = makeService();
    for (let i = 0; i < FREE_DAILY_OPERATIONS; i++) {
      await quota.consume(`op-${i}`);
    }
    expect(await quota.canStart()).toBe(false);

    premium = true;
    isPremium$.next(true);

    expect(await quota.canStart()).toBe(true);
    expect(await quota.remaining()).toBeNull();
  });

  it('does not lose a count when two saves land together', async () => {
    const quota = makeService();

    // Distinct ids, issued at the same moment: the read-modify-write has to be
    // serialised or one of them overwrites the other with the same total.
    await Promise.all([quota.consume('a'), quota.consume('b'), quota.consume('c')]);

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS - 3);
  });

  it('reset() clears the day, for the "erase all data" flow', async () => {
    const quota = makeService();
    await quota.consume('op-1');
    await quota.consume('op-2');

    await quota.reset();

    expect(await quota.remaining()).toBe(FREE_DAILY_OPERATIONS);
  });
});
