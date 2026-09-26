import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export interface HistoryItem {
  id: string;
  operation: string; // 'photo', 'signature', 'pdf', 'batch'
  originalFileName: string;
  outputFileName: string;
  originalSizeBytes: number;
  outputSizeBytes: number;
  originalDimensions?: string; // '1920x1080'
  outputDimensions?: string;
  date: number;
  outputPath?: string;
}

const HISTORY_STORAGE_KEY = 'IFH_HISTORY_V2';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  constructor() {}

  async getHistory(): Promise<HistoryItem[]> {
    const { value } = await Preferences.get({ key: HISTORY_STORAGE_KEY });
    if (!value) return [];

    /*
     * A stored value that will not parse is treated as no history.
     *
     * This is hand-written JSON in Preferences, and a partial write, a killed
     * process mid-save or a downgrade can leave it truncated. `JSON.parse` threw
     * straight out of here, and because every caller awaits `getHistory` the
     * rejection surfaced as a blank history page and a blank profile page --
     * with the real list still on disk but unreachable, since nothing could get
     * far enough to rewrite it. Returning an empty list keeps both pages usable
     * and lets the next save replace the damaged value.
     */
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn('Stored history could not be read and was ignored.');
      return [];
    }
  }

  async addHistoryItem(item: Omit<HistoryItem, 'id' | 'date'>): Promise<void> {
    const history = await this.getHistory();
    const now = new Date().getTime();
    const newItem: HistoryItem = {
      ...item,
      /*
       * The timestamp alone is not unique.
       *
       * A batch run adds one entry per saved file in a tight loop, and several
       * of those land in the same millisecond. With `hist_${now}` as the id
       * they all got the *same* id, and `deleteItem` filters by id — so
       * removing one row from the history page removed every row that happened
       * to be written in that millisecond. The random suffix is what makes the
       * id identify a row rather than an instant.
       *
       * Entries written before this change keep their plain `hist_<ms>` ids;
       * deletion matches on the exact string, so they are unaffected.
       */
      id: `hist_${now}_${Math.random().toString(36).slice(2, 8)}`,
      date: now
    };
    
    // Keep last 100 items
    history.unshift(newItem);
    if (history.length > 100) {
      history.pop();
    }
    
    await Preferences.set({
      key: HISTORY_STORAGE_KEY,
      value: JSON.stringify(history)
    });
  }

  async deleteItem(id: string): Promise<void> {
    const history = await this.getHistory();
    const filtered = history.filter(item => item.id !== id);
    await Preferences.set({
      key: HISTORY_STORAGE_KEY,
      value: JSON.stringify(filtered)
    });
  }

  async clearHistory(): Promise<void> {
    await Preferences.remove({ key: HISTORY_STORAGE_KEY });
  }
}
