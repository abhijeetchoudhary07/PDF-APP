import {
  Directive,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  NgZone,
  inject
} from '@angular/core';

@Directive({
  selector: '[appAutoScroll]',
  standalone: true
})
export class AutoScrollDirective implements OnInit, OnDestroy {
  private elementRef = inject(ElementRef<HTMLElement>);
  private ngZone = inject(NgZone);

  /**
   * Speed of horizontal scrolling in pixels per animation frame (at 60fps).
   * Default 0.6 (~36px/sec) ensures smooth, readable, non-jarring movement.
   */
  @Input() autoScrollSpeed = 0.65;

  /**
   * Delay in milliseconds before resuming auto-scroll after the user
   * releases hover, touch, or stops scrolling.
   */
  @Input() autoScrollPauseDelay = 2500;

  /**
   * Direction mode: 'ping-pong' glides from left to right, pauses briefly,
   * then glides back to start. 'loop' scrolls forward and resets smoothly.
   */
  @Input() autoScrollMode: 'ping-pong' | 'loop' = 'ping-pong';

  /**
   * Pause duration at edges (left and right) in milliseconds.
   */
  @Input() edgePauseDuration = 1200;

  /**
   * Whether auto scrolling is active.
   */
  @Input('appAutoScroll')
  set enabled(val: boolean | string | null | undefined) {
    this._enabled = val !== false && val !== 'false';
  }
  get enabled(): boolean {
    return this._enabled;
  }
  private _enabled = true;

  private isDestroyed = false;
  private isInteracting = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private animFrameId: number | null = null;

  private currentScroll = 0;
  private scrollDirection = 1; // 1 = forward (right), -1 = backward (left)
  private isAtEdgePause = false;
  private edgePauseStartTime = 0;
  private lastProgrammaticScroll = -1;
  private resizeObserver: ResizeObserver | null = null;

  // Unregister callbacks for event listeners
  private cleanups: Array<() => void> = [];

  ngOnInit(): void {
    const el = this.elementRef.nativeElement;
    if (!el || typeof window === 'undefined') {
      return;
    }

    this.currentScroll = el.scrollLeft;

    // Attach interaction listeners outside Angular zone to prevent change detection overhead
    this.ngZone.runOutsideAngular(() => {
      this.attachEventListeners(el);
      this.setupResizeObserver(el);
      this.startScrollLoop();
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
  }

  private attachEventListeners(el: HTMLElement): void {
    const onInteractionStart = () => {
      this.clearResumeTimer();
      this.isInteracting = true;
    };

    const onInteractionEnd = () => {
      this.clearResumeTimer();
      this.resumeTimer = setTimeout(() => {
        this.isInteracting = false;
        this.currentScroll = el.scrollLeft;
      }, this.autoScrollPauseDelay);
    };

    const onScroll = () => {
      // If the scroll position is significantly different from what our animation loop set,
      // it was triggered by a user touch swipe, trackpad drag, or mouse wheel.
      if (Math.abs(el.scrollLeft - this.lastProgrammaticScroll) > 1.5) {
        this.currentScroll = el.scrollLeft;
        this.isInteracting = true;
        this.clearResumeTimer();
        this.resumeTimer = setTimeout(() => {
          this.isInteracting = false;
        }, this.autoScrollPauseDelay);
      }
    };

    const add = (eventName: string, handler: EventListener, options?: AddEventListenerOptions) => {
      el.addEventListener(eventName, handler, options);
      this.cleanups.push(() => el.removeEventListener(eventName, handler, options));
    };

    // Hover
    add('mouseenter', onInteractionStart, { passive: true });
    add('mouseleave', onInteractionEnd, { passive: true });

    // Touch & Pointer
    add('touchstart', onInteractionStart, { passive: true });
    add('touchend', onInteractionEnd, { passive: true });
    add('touchcancel', onInteractionEnd, { passive: true });
    add('pointerdown', onInteractionStart, { passive: true });
    add('pointerup', onInteractionEnd, { passive: true });
    add('pointercancel', onInteractionEnd, { passive: true });

    // Keyboard navigation / focus
    add('focusin', onInteractionStart, { passive: true });
    add('focusout', onInteractionEnd, { passive: true });

    // Manual scroll / swipe
    add('scroll', onScroll, { passive: true });
  }

  private setupResizeObserver(el: HTMLElement): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.currentScroll = el.scrollLeft;
      });
      this.resizeObserver.observe(el);
    }
  }

  private clearResumeTimer(): void {
    if (this.resumeTimer !== null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  private startScrollLoop(): void {
    const el = this.elementRef.nativeElement;

    const step = (timestamp: number) => {
      if (this.isDestroyed) {
        return;
      }

      // Check user accessibility preference (prefers-reduced-motion)
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.animFrameId = requestAnimationFrame(step);
        return;
      }

      if (!this._enabled) {
        this.animFrameId = requestAnimationFrame(step);
        return;
      }

      // Calculate maximum possible horizontal scroll
      const maxScroll = el.scrollWidth - el.clientWidth;

      // If the content does not overflow the container, no scrolling is needed
      if (maxScroll <= 2) {
        this.animFrameId = requestAnimationFrame(step);
        return;
      }

      // If user is currently interacting (hovering, touching, scrolling), do not auto-scroll
      if (this.isInteracting) {
        this.animFrameId = requestAnimationFrame(step);
        return;
      }

      // Handle edge pause (pause at ends before reversing)
      if (this.isAtEdgePause) {
        if (timestamp - this.edgePauseStartTime >= this.edgePauseDuration) {
          this.isAtEdgePause = false;
        } else {
          this.animFrameId = requestAnimationFrame(step);
          return;
        }
      }

      if (this.autoScrollMode === 'ping-pong') {
        this.currentScroll += this.scrollDirection * this.autoScrollSpeed;

        if (this.currentScroll >= maxScroll) {
          this.currentScroll = maxScroll;
          this.scrollDirection = -1;
          this.isAtEdgePause = true;
          this.edgePauseStartTime = timestamp;
        } else if (this.currentScroll <= 0) {
          this.currentScroll = 0;
          this.scrollDirection = 1;
          this.isAtEdgePause = true;
          this.edgePauseStartTime = timestamp;
        }
      } else {
        // Continuous loop mode
        this.currentScroll += this.autoScrollSpeed;
        if (this.currentScroll >= maxScroll) {
          this.currentScroll = 0;
          this.isAtEdgePause = true;
          this.edgePauseStartTime = timestamp;
        }
      }

      this.lastProgrammaticScroll = this.currentScroll;
      el.scrollLeft = this.currentScroll;

      this.animFrameId = requestAnimationFrame(step);
    };

    this.animFrameId = requestAnimationFrame(step);
  }
}
