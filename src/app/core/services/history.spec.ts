import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HistoryItem, HistoryService } from './history.service';

/*
 * The local record of what this device has processed.
 *
 * It never leaves the phone, so nothing here is about privacy; it is about the
 * list staying readable. Newest first, capped so it cannot grow without bound,
 * and — because the whole list is read, mutated and written back on every add —
 * surviving a stored value that is missing or corrupt.
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

const KEY = 'IFH_HISTORY_V2';

type NewItem = Omit<HistoryItem, 'id' | 'date'>;

function entry(overrides: Partial<NewItem> = {}): NewItem {
  return {
    operation: 'pdf',
    originalFileName: 'in.pdf',
    outputFileName: 'out.pdf',
    originalSizeBytes: 1000,
    outputSizeBytes: 400,
    ...overrides,
  };
}

describe('HistoryService', () => {
  let history: HistoryService;

  beforeEach(() => {
    store.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    history = TestBed.inject(HistoryService);
  });

  it('starts empty on a device that has never saved anything', async () => {
    expect(await history.getHistory()).toEqual([]);
  });

  it('stamps an id and a date the caller does not have to supply', async () => {
    const before = Date.now();
    await history.addHistoryItem(entry());
    const [item] = await history.getHistory();

    expect(item.id).toMatch(/^hist_\d+_[a-z0-9]+$/);
    expect(item.date).toBeGreaterThanOrEqual(before);
    expect(item.originalFileName).toBe('in.pdf');
  });

  it('puts the newest entry first', async () => {
    await history.addHistoryItem(entry({ outputFileName: 'first.pdf' }));
    await history.addHistoryItem(entry({ outputFileName: 'second.pdf' }));

    const items = await history.getHistory();
    expect(items.map(i => i.outputFileName)).toEqual(['second.pdf', 'first.pdf']);
  });

  it('keeps 100 entries and drops the oldest', async () => {
    for (let i = 0; i < 105; i++) {
      await history.addHistoryItem(entry({ outputFileName: `out_${i}.pdf` }));
    }

    const items = await history.getHistory();
    expect(items.length).toBe(100);
    expect(items[0].outputFileName).toBe('out_104.pdf');
    expect(items[99].outputFileName).toBe('out_5.pdf');
  });

  it('deletes by id and leaves the rest alone', async () => {
    await history.addHistoryItem(entry({ outputFileName: 'keep_a.pdf' }));
    await history.addHistoryItem(entry({ outputFileName: 'drop.pdf' }));
    await history.addHistoryItem(entry({ outputFileName: 'keep_b.pdf' }));

    const target = (await history.getHistory()).find(i => i.outputFileName === 'drop.pdf')!;
    await history.deleteItem(target.id);

    const names = (await history.getHistory()).map(i => i.outputFileName);
    expect(names).toEqual(['keep_b.pdf', 'keep_a.pdf']);
  });

  /*
   * A batch run writes one entry per saved file in a tight loop, so several
   * land in the same millisecond. While the id was just `hist_<ms>` those
   * entries shared an id and deleting one deleted all of them.
   */
  it('gives entries written in the same millisecond different ids', async () => {
    for (let i = 0; i < 25; i++) {
      await history.addHistoryItem(entry({ outputFileName: `batch_${i}.jpg` }));
    }

    const items = await history.getHistory();
    expect(new Set(items.map(i => i.id)).size).toBe(25);

    await history.deleteItem(items[0].id);
    expect((await history.getHistory()).length).toBe(24);
  });

  it('ignores a delete for an id that is not there', async () => {
    await history.addHistoryItem(entry());

    await history.deleteItem('hist_does_not_exist');

    expect((await history.getHistory()).length).toBe(1);
  });

  it('clears everything', async () => {
    await history.addHistoryItem(entry());

    await history.clearHistory();

    expect(await history.getHistory()).toEqual([]);
    expect(store.has(KEY)).toBe(false);
  });

  it('reads back what a previous session stored', async () => {
    store.set(
      KEY,
      JSON.stringify([
        { id: 'hist_1', operation: 'photo', originalFileName: 'a.jpg', outputFileName: 'b.jpg', originalSizeBytes: 9, outputSizeBytes: 4, date: 1 },
      ]),
    );

    const items = await history.getHistory();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('hist_1');
  });

  /*
   * Corrupt storage is not hypothetical: the value is hand-written JSON in
   * Preferences, and a partial write or a downgrade can leave it unparseable.
   * `getHistory` used to let the SyntaxError out, which reached the history and
   * profile pages as a blank screen.
   */
  it('reads a corrupt stored value as no history rather than throwing', async () => {
    store.set(KEY, '{not json');

    await expect(history.getHistory()).resolves.toEqual([]);
  });

  it('ignores a stored value that parses but is not a list', async () => {
    store.set(KEY, '{"unexpected":"shape"}');

    await expect(history.getHistory()).resolves.toEqual([]);
  });

  it('can be written again after the damaged value is read', async () => {
    store.set(KEY, '{not json');

    await history.addHistoryItem(entry({ outputFileName: 'after.pdf' }));

    const items = await history.getHistory();
    expect(items.map(i => i.outputFileName)).toEqual(['after.pdf']);
  });
});
