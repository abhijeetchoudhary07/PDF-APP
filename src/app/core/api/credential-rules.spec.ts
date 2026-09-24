import { describe, it, expect } from 'vitest';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  emailProblem,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
} from './credential-rules';

/**
 * These rules are a copy of the server's, and a copy is only useful while it
 * still matches. The cases below are written against
 * `server/pdf-app/validation.ts` in the backend repository — if one of them
 * starts failing after a server change, the fix is to bring this file back in
 * line, not to loosen the test.
 */
describe('credential rules', () => {
  describe('email', () => {
    const ACCEPTED = [
      'someone@example.com',
      'first.last@example.co.in',
      'user+tag@example.org',
      'UPPER@EXAMPLE.COM',
      '  padded@example.com  ',
      "o'brien@example.com",
    ];

    for (const value of ACCEPTED) {
      it(`accepts ${JSON.stringify(value)}`, () => {
        expect(isValidEmail(value)).toBe(true);
        expect(emailProblem(value)).toBeNull();
      });
    }

    const REJECTED = [
      '',
      '   ',
      'not-an-email',
      'missing@domain',
      '@example.com',
      'nobody@',
      'spaces in@example.com',
      'two@@example.com',
      'short@example.c',
    ];

    for (const value of REJECTED) {
      it(`rejects ${JSON.stringify(value)}`, () => {
        expect(isValidEmail(value)).toBe(false);
        expect(emailProblem(value)).toBeTruthy();
      });
    }

    it('distinguishes an empty field from a malformed one', () => {
      // Two different mistakes deserve two different messages.
      expect(emailProblem('')).not.toBe(emailProblem('not-an-email'));
    });

    it('normalises the way the server does: trimmed and lowercased', () => {
      expect(normalizeEmail('  Someone@Example.COM ')).toBe('someone@example.com');
    });
  });

  describe('password', () => {
    it('accepts the shortest allowed password', () => {
      expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    });

    it('accepts the longest allowed password', () => {
      expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    });

    it('rejects one character short of the minimum', () => {
      expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 8/);
    });

    it('rejects one character past the maximum', () => {
      // The ceiling stops a megabyte of text reaching scrypt on the server.
      expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/at most 200/);
    });

    it('reports an empty password as missing, not as too short', () => {
      expect(passwordProblem('')).toMatch(/Enter a password/);
    });

    /**
     * The server documents this as a deliberate choice: composition rules push
     * people toward `Password1!` and buy nothing. A client rule the server does
     * not share would lock people out of accounts the server would happily
     * create, so this test pins the absence of one.
     */
    it('imposes no composition requirement beyond length', () => {
      expect(passwordProblem('aaaaaaaa')).toBeNull();
      expect(passwordProblem('12345678')).toBeNull();
      expect(passwordProblem('        ')).toBeNull();
      expect(passwordProblem('एकदोतीनचार')).toBeNull();
    });
  });
});
