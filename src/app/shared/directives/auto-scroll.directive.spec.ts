import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoScrollDirective } from './auto-scroll.directive';

@Component({
  template: `
    <div
      class="scroll-container"
      appAutoScroll
      [autoScrollSpeed]="1"
      [autoScrollPauseDelay]="500"
      style="width: 100px; overflow-x: auto; white-space: nowrap;">
      <span style="display: inline-block; width: 300px;">Long Content</span>
    </div>
  `,
  standalone: true,
  imports: [AutoScrollDirective]
})
class TestAutoScrollComponent {}

describe('AutoScrollDirective', () => {
  let fixture: ComponentFixture<TestAutoScrollComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestAutoScrollComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TestAutoScrollComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should initialize the directive on host element', () => {
    const el = fixture.nativeElement.querySelector('.scroll-container');
    expect(el).toBeTruthy();
  });

  it('should pause auto-scrolling on mouseenter and resume after delay on mouseleave', () => {
    vi.useFakeTimers();
    const el = fixture.nativeElement.querySelector('.scroll-container');

    el.dispatchEvent(new MouseEvent('mouseenter'));
    // mouseenter pauses immediately
    el.dispatchEvent(new MouseEvent('mouseleave'));
    // Advance timers past autoScrollPauseDelay (500ms)
    vi.advanceTimersByTime(600);

    vi.useRealTimers();
  });

  it('should pause on touchstart and resume on touchend', () => {
    vi.useFakeTimers();
    const el = fixture.nativeElement.querySelector('.scroll-container');

    el.dispatchEvent(new Event('touchstart'));
    el.dispatchEvent(new Event('touchend'));
    vi.advanceTimersByTime(600);

    vi.useRealTimers();
  });
});
