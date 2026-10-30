import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, SimpleChange } from '@angular/core';
import { PasswordStrengthMeterComponent } from './password-strength-meter.component';
import { PasswordEvaluationService } from '../../../core/services/password-evaluation.service';

describe('PasswordStrengthMeterComponent', () => {
  let component: PasswordStrengthMeterComponent;
  let service: PasswordEvaluationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PasswordEvaluationService,
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() }
        }
      ]
    });

    service = TestBed.inject(PasswordEvaluationService);
    component = TestBed.runInInjectionContext(() => new PasswordStrengthMeterComponent());
  });

  it('initializes with default state', () => {
    expect(component.password).toBe('');
    expect(component.evaluation.score).toBe(0);
    expect(component.evaluation.level).toBe('very-weak');
    expect(component.isOwnerFallback).toBe(false);
    expect(component.isEducationalExpanded).toBe(false);
  });

  it('updates evaluation when password changes', () => {
    component.password = 'SuperSecurePass123!@#';
    component.ngOnChanges({
      password: new SimpleChange(null, component.password, true)
    });

    expect(component.evaluation.score).toBeGreaterThanOrEqual(80);
    expect(component.evaluation.checks.minLength).toBe(true);
    expect(component.evaluation.checks.hasMixedCase).toBe(true);
    expect(component.evaluation.checks.hasNumbers).toBe(true);
    expect(component.evaluation.checks.hasSymbols).toBe(true);
  });

  it('flags fallback warning when only user password is provided', () => {
    component.password = 'UserSecret123';
    component.ownerPassword = '';
    component.ngOnChanges({
      password: new SimpleChange(null, component.password, true),
      ownerPassword: new SimpleChange(null, '', true)
    });

    expect(component.isOwnerFallback).toBe(true);

    // When owner password is provided, fallback warning disappears
    component.ownerPassword = 'OwnerMaster456';
    component.ngOnChanges({
      ownerPassword: new SimpleChange('', component.ownerPassword, false)
    });

    expect(component.isOwnerFallback).toBe(false);
  });

  it('generates a strong passphrase, emits event, and copies to clipboard', async () => {
    const emitSpy = vi.spyOn(component.passphraseGenerated, 'emit');
    const changeSpy = vi.spyOn(component.passwordChange, 'emit');

    // Mock clipboard writeText
    if (typeof navigator !== 'undefined') {
      (navigator as any).clipboard = {
        writeText: vi.fn().mockResolvedValue(undefined)
      };
    }

    await component.generateStrongPassphrase();

    expect(component.password).toBeDefined();
    expect(component.password.split('-').length).toBe(4);
    expect(emitSpy).toHaveBeenCalledWith(component.password);
    expect(changeSpy).toHaveBeenCalledWith(component.password);
    expect(component.lastCopiedPassphrase).toBe(component.password);
  });

  it('toggles educational accordion expansion', () => {
    expect(component.isEducationalExpanded).toBe(false);
    component.isEducationalExpanded = true;
    expect(component.isEducationalExpanded).toBe(true);
  });

  it('computes segment classes correctly across score thresholds', () => {
    component.password = '123456';
    component.ngOnChanges({ password: new SimpleChange(null, component.password, true) });
    expect(component.getSegmentClass(1)).toContain('fill-very-weak');
    expect(component.getSegmentClass(35)).toBe('');

    component.password = 'xK9#mQ2$vL8&pT4!';
    component.ngOnChanges({ password: new SimpleChange('123456', component.password, false) });
    expect(component.getSegmentClass(1)).toContain('fill-excellent');
    expect(component.getSegmentClass(35)).toContain('fill-excellent');
    expect(component.getSegmentClass(65)).toContain('fill-excellent');
    expect(component.getSegmentClass(85)).toContain('fill-excellent');
  });

  it('updates criteria checks and levels for all 5 standard test inputs', () => {
    const inputs = [
      { pwd: '123456', expectedLevel: 'very-weak' },
      { pwd: 'password', expectedLevel: 'weak' },
      { pwd: 'Admin@123', expectedLevel: 'fair' },
      { pwd: 'P@ssw0rd2026!', expectedLevel: 'strong' },
      { pwd: 'xK9#mQ2$vL8&pT4!', expectedLevel: 'excellent' }
    ];

    for (const item of inputs) {
      component.password = item.pwd;
      component.ngOnChanges({ password: new SimpleChange(null, item.pwd, true) });
      expect(component.evaluation.level).toBe(item.expectedLevel);
    }
  });

  it('cleans up timers and memory on ngOnDestroy', async () => {
    vi.useFakeTimers();
    if (typeof navigator !== 'undefined') {
      (navigator as any).clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    }

    await component.generateStrongPassphrase();
    expect(component.lastCopiedPassphrase).toBeTruthy();

    // Fast forward timer to test clearance
    vi.advanceTimersByTime(3600);
    expect(component.lastCopiedPassphrase).toBe('');

    // Trigger generate again and destroy
    await component.generateStrongPassphrase();
    expect(component.lastCopiedPassphrase).toBeTruthy();
    component.ngOnDestroy();
    expect(component.lastCopiedPassphrase).toBe('');
    expect(component.password).toBe('');

    vi.useRealTimers();
  });
});
