import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { MonetizationService } from './monetization.service';

/** What a free account may produce in one day. */
export const FREE_DAILY_OPERATIONS = 5;

const STORAGE_KEY = 'IFH_DAILY_USAGE_V1';

interface StoredUsage {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

/**
 * The free tier's daily allowance.
 *
 * An "operation" is a completed output — a compressed photo, a merged PDF, a
 * finished conversion. Work that fails or is cancelled costs nothing, because
 * charging someone for the app's own errors is the fastest way to lose them.
 *
 * The counter lives on the device, not on the server. That is a deliberate
 * trade: it keeps every tool working offline, which is the whole premise of the
 * app, at the cost of being resettable by clearing app data. The alternative —
 * a server round trip before every compression — would break the offline
 * promise to stop a determined minority doing something that costs us nothing.
 */
@Injectable({ providedIn: 'root' })
export class UsageQuotaService {
  private readonly monetization = inject(MonetizationService);

  /** Operations used today. Premium accounts are not counted at all. */
  readonly used$ = new BehaviorSubject<number>(0);
  /**
   * What is left today, or null when the account is unlimited.
   *
   * Starts null, which the UI renders as nothing at all. Seeding it with the
   * full allowance instead made a premium account flash "5 left today" for the
   * moment between construction and the first read — telling a paying customer
   * they are rate limited, however briefly.
   */
  readonly remaining$ = new BehaviorSubject<number | null>(null);

  /**
   * Operation ids already counted in this app session.
   *
   * Two different things de-duplicate through here. A batch run saves many
   * files but is one operation, so the caller passes one id for the group. And
   * saving a result and then sharing the same result is also one operation —
   * that falls out of the default id, which is derived from the file itself.
   *
   * Capped, because a long session with hundreds of outputs should not grow a
   * set forever; the oldest ids are the least likely to be revisited.
   */
  private readonly counted = new Set<string>();
  private static readonly MAX_REMEMBERED = 200;

  /** Serialises read-modify-write, so two quick saves cannot both read `n`. */
  private queue: Promise<unknown> = Promise.resolve();

  private loaded = false;

  constructor() {
    void this.load();
    // Buying premium has to lift the cap immediately, not on next launch.
    this.monetization.isPremium$.subscribe(() => void this.publish());
  }

  get limit(): number {
    return FREE_DAILY_OPERATIONS;
  }

  get isUnlimited(): boolean {
    return this.monetization.isUserPremium;
  }

  /** Today in the device's own timezone — the day boundary a user expects. */
  private today(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private async read(): Promise<StoredUsage> {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value) {
        const parsed = JSON.parse(value) as Partial<StoredUsage>;
        // A stored day that is not today is spent: the allowance has reset.
        if (parsed.date === this.today() && typeof parsed.count === 'number') {
          return { date: parsed.date, count: Math.max(0, parsed.count) };
        }
      }
    } catch {
      // Unreadable storage must not lock someone out of their own tools.
    }
    return { date: this.today(), count: 0 };
  }

  private async write(usage: StoredUsage): Promise<void> {
    try {
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(usage) });
    } catch {
      // Losing the write costs us one operation of accounting, not the app.
    }
  }

  private async publish(usage?: StoredUsage): Promise<void> {
    const current = usage ?? (await this.read());
    this.used$.next(current.count);
    this.remaining$.next(
      this.isUnlimited ? null : Math.max(0, FREE_DAILY_OPERATIONS - current.count),
    );
  }

  /** Reads the stored counter. Safe to call repeatedly. */
  async load(): Promise<void> {
    await this.publish();
    this.loaded = true;
  }

  /** How many operations are left today; null when unlimited. */
  async remaining(): Promise<number | null> {
    if (this.isUnlimited) {
      return null;
    }
    const usage = await this.read();
    return Math.max(0, FREE_DAILY_OPERATIONS - usage.count);
  }

  /** True when another operation may produce an output right now. */
  async canStart(): Promise<boolean> {
    if (this.isUnlimited) {
      return true;
    }
    const usage = await this.read();
    return usage.count < FREE_DAILY_OPERATIONS;
  }

  /**
   * Counts one operation.
   *
   * `operationId` groups the saves that belong to a single run: a split that
   * writes ten files, or a batch that writes fifty, is one operation to the
   * person who started it, and the user-facing rule says so.
   */
  async consume(operationId?: string): Promise<void> {
    if (this.isUnlimited) {
      return;
    }
    if (operationId) {
      if (this.counted.has(operationId)) {
        return;
      }
      this.counted.add(operationId);
      if (this.counted.size > UsageQuotaService.MAX_REMEMBERED) {
        // Sets iterate in insertion order, so this drops the oldest.
        this.counted.delete(this.counted.values().next().value as string);
      }
    }

    this.queue = this.queue.then(async () => {
      const usage = await this.read();
      const next: StoredUsage = { date: usage.date, count: usage.count + 1 };
      await this.write(next);
      await this.publish(next);
    });

    await this.queue;
  }

  /**
   * Clears today's count.
   *
   * For tests and support, **not** for the in-app "Clear history" or "Factory
   * reset" controls: wiring it there would hand every free user a one-tap way
   * to refill their own allowance, which is the whole thing this service
   * exists to prevent.
   */
  async reset(): Promise<void> {
    this.counted.clear();
    await this.write({ date: this.today(), count: 0 });
    await this.publish();
  }

  /** True once the first read has completed, for callers that want to wait. */
  get isLoaded(): boolean {
    return this.loaded;
  }
}
