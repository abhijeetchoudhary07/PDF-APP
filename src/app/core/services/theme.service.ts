import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'IFH_THEME_MODE';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public currentTheme$ = new BehaviorSubject<ThemeMode>('system');
  public isDark$ = new BehaviorSubject<boolean>(false);

  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.initTheme();
  }

  private async initTheme() {
    try {
      const { value } = await Preferences.get({ key: THEME_STORAGE_KEY });
      const savedTheme: ThemeMode = (value as ThemeMode) || 'system';
      this.setTheme(savedTheme, false);
    } catch {
      this.setTheme('system', false);
    }

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', (e) => {
      if (this.currentTheme$.value === 'system') {
        this.applyThemeToDOM('system');
      }
    });
  }

  async setTheme(theme: ThemeMode, persist: boolean = true): Promise<void> {
    this.currentTheme$.next(theme);
    this.applyThemeToDOM(theme);

    if (persist) {
      await Preferences.set({
        key: THEME_STORAGE_KEY,
        value: theme
      });
    }
  }

  private applyThemeToDOM(theme: ThemeMode): void {
    const root = document.documentElement;
    const body = document.body;

    let effectiveIsDark = false;

    if (theme === 'dark') {
      effectiveIsDark = true;
    } else if (theme === 'light') {
      effectiveIsDark = false;
    } else {
      effectiveIsDark = this.mediaQuery.matches;
    }

    this.isDark$.next(effectiveIsDark);

    if (effectiveIsDark) {
      root.setAttribute('data-theme', 'dark');
      body.classList.add('theme-dark');
      body.classList.remove('theme-light');
    } else {
      root.setAttribute('data-theme', 'light');
      body.classList.add('theme-light');
      body.classList.remove('theme-dark');
    }
  }
}
