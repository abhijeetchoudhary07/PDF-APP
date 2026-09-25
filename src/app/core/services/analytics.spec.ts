import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

/*
 * Analytics is deliberately inert, and that is the thing to defend.
 *
 * The listing's privacy policy and Data Safety answers both say nothing is
 * collected, so the test that matters is not "does it log" but "does it stay
 * on the device" — and, separately, that a released build does not narrate
 * what someone is doing into a console a connected laptop can read.
 *
 * If a provider is ever added back, these tests should fail. That is the point.
 */
describe('AnalyticsService', () => {
  let analytics: AnalyticsService;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    analytics = TestBed.inject(AnalyticsService);
  });

  afterEach(() => log.mockRestore());

  it('sends nothing off the device', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation((() => {
      throw new Error('analytics must not make network calls');
    }) as never);
    const beacon = vi.fn();
    (navigator as any).sendBeacon = beacon;

    await analytics.logEvent('tool_opened', { tool: 'compress-pdf' });
    await analytics.setUserId('user-123');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('records the event name and params while developing', async () => {
    await analytics.logEvent('tool_opened', { tool: 'compress-pdf' });

    expect(log).toHaveBeenCalledWith('Analytics Event: tool_opened', { tool: 'compress-pdf' });
  });

  it('logs an empty object rather than undefined when a caller passes no params', async () => {
    await analytics.logEvent('app_opened');

    expect(log).toHaveBeenCalledWith('Analytics Event: app_opened', {});
  });

  it('accepts a user id without doing anything with it', async () => {
    await expect(analytics.setUserId('user-123')).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('never rejects, so a call site cannot break a tool by awaiting it', async () => {
    await expect(analytics.logEvent('x')).resolves.toBeUndefined();
  });

  describe('in a production build', () => {
    afterEach(() => {
      vi.resetModules();
      vi.doUnmock('../../../environments/environment');
    });

    it('stays silent', async () => {
      vi.resetModules();
      vi.doMock('../../../environments/environment', () => ({
        environment: { production: true },
      }));

      const { AnalyticsService: ProdAnalyticsService } = await import('./analytics.service');
      const prodLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await new ProdAnalyticsService().logEvent('tool_opened', { tool: 'compress-pdf' });

      expect(prodLog).not.toHaveBeenCalled();
      prodLog.mockRestore();
    });
  });
});
