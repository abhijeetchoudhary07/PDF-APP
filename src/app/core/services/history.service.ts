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
    if (value) {
      return JSON.parse(value);
    }
    return [];
  }

  async addHistoryItem(item: Omit<HistoryItem, 'id' | 'date'>): Promise<void> {
    const history = await this.getHistory();
    const newItem: HistoryItem = {
      ...item,
      id: `hist_${new Date().getTime()}`,
      date: new Date().getTime()
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
