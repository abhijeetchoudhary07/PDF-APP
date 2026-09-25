import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GlobalSearchService } from './global-search.service';

/*
 * The command palette's open/closed state, and the keyboard shortcut that
 * drives it.
 *
 * The shortcut is the part worth testing: it is a bare window listener, so it
 * fires from anywhere in the app including while someone is typing in a field.
 * Ctrl+K has to be swallowed (Chrome focuses the address bar with it), and
 * nothing else may be.
 */
describe('GlobalSearchService', () => {
  let search: GlobalSearchService;

  function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers });
    window.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    search = TestBed.inject(GlobalSearchService);
  });

  it('starts closed', () => {
    expect(search.isOpen$.value).toBe(false);
  });

  it('opens, closes and toggles', () => {
    search.open();
    expect(search.isOpen$.value).toBe(true);

    search.close();
    expect(search.isOpen$.value).toBe(false);

    search.toggle();
    expect(search.isOpen$.value).toBe(true);
    search.toggle();
    expect(search.isOpen$.value).toBe(false);
  });

  it('is idempotent, so a second open does not flip it shut', () => {
    search.open();
    search.open();

    expect(search.isOpen$.value).toBe(true);
  });

  it('notifies subscribers of each change', () => {
    const seen: boolean[] = [];
    const sub = search.isOpen$.subscribe(v => seen.push(v));

    search.open();
    search.close();
    sub.unsubscribe();

    expect(seen).toEqual([false, true, false]);
  });

  describe('the keyboard shortcut', () => {
    it('opens on Ctrl+K and closes on the next one', () => {
      press('k', { ctrlKey: true });
      expect(search.isOpen$.value).toBe(true);

      press('k', { ctrlKey: true });
      expect(search.isOpen$.value).toBe(false);
    });

    it('works with Cmd on a Mac', () => {
      press('k', { metaKey: true });

      expect(search.isOpen$.value).toBe(true);
    });

    it('accepts a capital K, so Shift held down still works', () => {
      press('K', { metaKey: true, shiftKey: true });

      expect(search.isOpen$.value).toBe(true);
    });

    it('swallows the event, so the browser does not take the shortcut', () => {
      const event = press('k', { ctrlKey: true });

      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves a plain k alone', () => {
      const event = press('k');

      expect(search.isOpen$.value).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    });

    it.each(['j', 'l', 'p', 'Enter', 'Escape'])('leaves Ctrl+%s alone', key => {
      const event = press(key, { ctrlKey: true });

      expect(search.isOpen$.value).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  /*
   * The listener is added in the constructor and never removed. For a service
   * that is `providedIn: 'root'` and lives as long as the app, that is fine —
   * but it does mean a second instance doubles the handler, which is why this
   * is the one place the service is built twice on purpose.
   */
  it('registers exactly one handler per instance', () => {
    const spy = vi.spyOn(window, 'addEventListener');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    TestBed.inject(GlobalSearchService);

    expect(spy.mock.calls.filter(([type]) => type === 'keydown').length).toBe(1);
    spy.mockRestore();
  });
});
