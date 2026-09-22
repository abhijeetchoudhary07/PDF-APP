import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GlobalSearchService {
  public isOpen$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.initKeyboardShortcut();
  }

  private initKeyboardShortcut() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  open(): void {
    this.isOpen$.next(true);
  }

  close(): void {
    this.isOpen$.next(false);
  }

  toggle(): void {
    this.isOpen$.next(!this.isOpen$.value);
  }
}
