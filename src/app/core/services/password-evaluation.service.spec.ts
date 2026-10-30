import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PasswordEvaluationService } from './password-evaluation.service';
import { PASSPHRASE_WORDLIST } from '../data/passphrase-wordlist.data';

describe('PasswordEvaluationService (N2 — Password Entropy & Mechanics)', () => {
  let service: PasswordEvaluationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PasswordEvaluationService]
    });
    service = TestBed.inject(PasswordEvaluationService);
  });

  // =========================================================================
  // 1. EXACT 5-INPUT SCORE TRANSITION BENCHMARK (STEP 2 VERIFICATION)
  // =========================================================================

  describe('Standard Step 2 Score Transitions (Very Weak -> Weak -> Fair -> Strong -> Excellent)', () => {
    it('evaluates "123456" as Very Weak (Score <= 20)', () => {
      const res = service.evaluate('123456');
      expect(res.level).toBe('very-weak');
      expect(res.score).toBeLessThanOrEqual(20);
      expect(res.isDictionaryMatch).toBe(true);
      expect(res.checks.minLength).toBe(false);
      expect(res.checks.hasMixedCase).toBe(false);
      expect(res.checks.hasNumbers).toBe(true);
      expect(res.checks.hasSymbols).toBe(false);
    });

    it('evaluates "password" as Weak (Score 21 - 40)', () => {
      const res = service.evaluate('password');
      expect(res.level).toBe('weak');
      expect(res.score).toBeGreaterThan(20);
      expect(res.score).toBeLessThanOrEqual(40);
      expect(res.isDictionaryMatch).toBe(true);
      expect(res.checks.minLength).toBe(true);
      expect(res.checks.hasMixedCase).toBe(false);
      expect(res.checks.hasNumbers).toBe(false);
      expect(res.checks.hasSymbols).toBe(false);
    });

    it('evaluates "Admin@123" as Fair (Score 41 - 65)', () => {
      const res = service.evaluate('Admin@123');
      expect(res.level).toBe('fair');
      expect(res.score).toBeGreaterThanOrEqual(41);
      expect(res.score).toBeLessThanOrEqual(65);
      expect(res.checks.minLength).toBe(true);
      expect(res.checks.hasMixedCase).toBe(true);
      expect(res.checks.hasNumbers).toBe(true);
      expect(res.checks.hasSymbols).toBe(true);
    });

    it('evaluates "P@ssw0rd2026!" as Strong (Score 66 - 85)', () => {
      const res = service.evaluate('P@ssw0rd2026!');
      expect(res.level).toBe('strong');
      expect(res.score).toBeGreaterThanOrEqual(66);
      expect(res.score).toBeLessThanOrEqual(85);
      expect(res.checks.minLength).toBe(true);
      expect(res.checks.hasMixedCase).toBe(true);
      expect(res.checks.hasNumbers).toBe(true);
      expect(res.checks.hasSymbols).toBe(true);
    });

    it('evaluates random 16-character string as Excellent (Score 86 - 100)', () => {
      const res = service.evaluate('xK9#mQ2$vL8&pT4!');
      expect(res.level).toBe('excellent');
      expect(res.score).toBeGreaterThanOrEqual(86);
      expect(res.score).toBeLessThanOrEqual(100);
      expect(res.entropyBits).toBeGreaterThanOrEqual(80);
      expect(res.isDictionaryMatch).toBe(false);
      expect(res.checks.minLength).toBe(true);
      expect(res.checks.hasMixedCase).toBe(true);
      expect(res.checks.hasNumbers).toBe(true);
      expect(res.checks.hasSymbols).toBe(true);
    });
  });

  // =========================================================================
  // 2. ENTROPY SCORING & DICTIONARY MATCH PENALTIES
  // =========================================================================

  describe('Entropy Scoring & Heuristics', () => {
    it('accurately flags "password123" as Weak due to dictionary match and sequential run', () => {
      const result = service.evaluate('password123');

      expect(result.level).toBe('weak');
      expect(result.score).toBeLessThanOrEqual(40);
      expect(result.isDictionaryMatch).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it('flags common passwords with immediate dictionary penalty', () => {
      const commonList = ['123456', 'qwerty', 'letmein', 'admin', 'iloveyou'];
      for (const pwd of commonList) {
        const result = service.evaluate(pwd);
        expect(result.isDictionaryMatch).toBe(true);
        expect(result.score).toBeLessThanOrEqual(35);
        expect(['very-weak', 'weak']).toContain(result.level);
      }
    });

    it('handles empty input gracefully', () => {
      const result = service.evaluate('');
      expect(result.score).toBe(0);
      expect(result.level).toBe('very-weak');
      expect(result.entropyBits).toBe(0);
      expect(result.checks.minLength).toBe(false);
    });

    it('deducts penalties for sequential runs like "12345" and "abcdef"', () => {
      const seqNum = service.evaluate('ab123456cd');
      const randomSeq = service.evaluate('ab938164cd');

      expect(seqNum.score).toBeLessThan(randomSeq.score);
    });

    it('deducts penalties for keyboard patterns like "qwerty"', () => {
      const kbPass = service.evaluate('Myqwerty99#');
      const randPass = service.evaluate('Mykwtvrf99#');

      expect(kbPass.score).toBeLessThan(randPass.score);
    });
  });

  // =========================================================================
  // 3. CRYPTOGRAPHICALLY SECURE PASSPHRASE GENERATOR
  // =========================================================================

  describe('Passphrase Generator', () => {
    it('produces a unique 4-word hyphenated string using secure random values', () => {
      const pass1 = service.generatePassphrase(4, '-');
      const pass2 = service.generatePassphrase(4, '-');

      expect(pass1).toBeDefined();
      expect(pass2).toBeDefined();
      expect(pass1).not.toEqual(pass2);

      const words = pass1.split('-');
      expect(words.length).toBe(4);

      for (const word of words) {
        expect(PASSPHRASE_WORDLIST).toContain(word);
      }
    });

    it('supports custom word count and separators', () => {
      const pass3 = service.generatePassphrase(3, '.');
      expect(pass3.split('.').length).toBe(3);

      const pass5 = service.generatePassphrase(5, '_');
      expect(pass5.split('_').length).toBe(5);
    });
  });

  // =========================================================================
  // 4. OWNER PASSWORD MECHANICS WARNING
  // =========================================================================

  describe('Owner Password Mechanics Warning', () => {
    it('triggers fallback warning exactly when only User password is entered', () => {
      // Case 1: User password entered, Owner password empty -> TRUE
      expect(service.isOwnerPasswordFallback('UserSecret123!', '')).toBe(true);
      expect(service.isOwnerPasswordFallback('UserSecret123!', undefined)).toBe(true);
      expect(service.isOwnerPasswordFallback('UserSecret123!', '   ')).toBe(true);

      // Case 2: Both passwords entered -> FALSE
      expect(service.isOwnerPasswordFallback('UserSecret123!', 'OwnerMaster456!')).toBe(false);

      // Case 3: Neither password entered -> FALSE
      expect(service.isOwnerPasswordFallback('', '')).toBe(false);
      expect(service.isOwnerPasswordFallback(undefined, undefined)).toBe(false);

      // Case 4: Only Owner password entered -> FALSE
      expect(service.isOwnerPasswordFallback('', 'OwnerMaster456!')).toBe(false);
    });

    it('returns educational notice text', () => {
      const notice = service.getOwnerPasswordFallbackNotice();
      expect(notice).toContain('When only one password is set');
      expect(notice).toContain('anyone who can open the file can also change permissions');
    });
  });

  // =========================================================================
  // 5. CYBERSECURITY STRESS-TESTING (STEP 5 HARDENING)
  // =========================================================================

  describe('Cybersecurity Stress-Testing', () => {
    it('verifies PRNG predictability: Math.random is strictly NEVER called', () => {
      const mathRandomSpy = vi.spyOn(Math, 'random');

      for (let i = 0; i < 500; i++) {
        service.generatePassphrase(4, '-');
      }

      expect(mathRandomSpy).not.toHaveBeenCalled();
      mathRandomSpy.mockRestore();
    });

    it('verifies zero collision rate across 1,000 generated passphrases', () => {
      const set = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        set.add(service.generatePassphrase(4, '-'));
      }

      expect(set.size).toBe(iterations);
    });

    it('demonstrates ReDoS resilience on 50,000-character input (runs in < 10ms)', () => {
      const adversarialInput = 'a'.repeat(50000);
      const startTime = performance.now();
      const res = service.evaluate(adversarialInput);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(10);
      expect(res.level).toBeDefined();
    });

    it('demonstrates ReDoS resilience on alternating regex backtracking inputs', () => {
      const alternatingInput = 'a1!A'.repeat(12500); // 50,000 chars
      const startTime = performance.now();
      const res = service.evaluate(alternatingInput);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(10);
      expect(res.score).toBeGreaterThanOrEqual(85);
    });
  });
});
