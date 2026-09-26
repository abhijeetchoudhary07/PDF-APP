import { DestroyRef, Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GlobalSearchService {
  public isOpen$ = new BehaviorSubject<boolean>(false);

  private readonly onKeydown = (e: KeyboardEvent): void => {
    // Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k') {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor() {
    window.addEventListener('keydown', this.onKeydown);

    /*
     * The handler used to be an inline closure that was never removed. As a
     * root-provided singleton this service outlives every page, so in the app
     * that leaked nothing -- but it meant the listener could not be undone at
     * all, and a second instance (a test harness, a lazy injector, anything
     * that rebuilds the root providers) silently doubled it, so Ctrl+K toggled
     * twice and the palette appeared to do nothing.
     */
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', this.onKeydown);
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
