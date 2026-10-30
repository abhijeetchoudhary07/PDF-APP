import { Injectable } from '@angular/core';
import { PASSPHRASE_WORDLIST } from '../data/passphrase-wordlist.data';
import { COMMON_PASSWORDS } from '../data/common-passwords.data';

export type PasswordStrengthLevel = 'very-weak' | 'weak' | 'fair' | 'strong' | 'excellent';

export interface PasswordCriteriaChecks {
  minLength: boolean; // >= 8 characters
  hasMixedCase: boolean; // Both uppercase and lowercase
  hasNumbers: boolean; // At least one digit (0-9)
  hasSymbols: boolean; // At least one special character
}

export interface PasswordEvaluationResult {
  score: number; // 0 to 100
  level: PasswordStrengthLevel;
  label: string; // "Very Weak", "Weak", "Fair", "Strong", "Excellent"
  labelKey: string;
  entropyBits: number;
  checks: PasswordCriteriaChecks;
  suggestions: string[];
  warning?: string;
  isDictionaryMatch: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PasswordEvaluationService {
  private static readonly SUBSTRING_ROOTS = Array.from(COMMON_PASSWORDS).filter(
    (w) => w.length >= 5
  );

  private readonly keyboardPatterns = [
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    '1234567890',
    'qazwsxedc',
    '1qaz2wsx'
  ];

  constructor() {}

  /**
   * Evaluates the cryptographic entropy, structure, patterns, and dictionary vulnerability
   * of a candidate password, returning real-time score (0-100) and actionable suggestions.
   */
  evaluate(password: string): PasswordEvaluationResult {
    const fullPwd = password || '';
    // Bound evaluation to first 128 characters to eliminate ReDoS and computational lag
    const pwd = fullPwd.slice(0, 128);
    const length = fullPwd.length;

    // 1. Structural Checks
    const checks: PasswordCriteriaChecks = {
      minLength: length >= 8,
      hasMixedCase: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd),
      hasNumbers: /[0-9]/.test(pwd),
      hasSymbols: /[^a-zA-Z0-9]/.test(pwd)
    };

    if (length === 0) {
      return {
        score: 0,
        level: 'very-weak',
        label: 'Very Weak',
        labelKey: 'securityProtect.strengthVeryWeak',
        entropyBits: 0,
        checks,
        suggestions: ['Enter a password to evaluate strength.'],
        isDictionaryMatch: false
      };
    }

    // 2. Character Pool Size (R)
    let poolSize = 0;
    if (/[a-z]/.test(pwd)) poolSize += 26;
    if (/[A-Z]/.test(pwd)) poolSize += 26;
    if (/[0-9]/.test(pwd)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(pwd)) poolSize += 33;

    // 3. Information Entropy: E = L * log2(R)
    const rawEntropy = length * (Math.log(poolSize || 1) / Math.LN2);

    // 4. Calculate Deductions & Penalties
    let penalty = 0;
    const suggestions: string[] = [];
    let warning: string | undefined;

    // A. Repeated characters penalty
    let repeatedCharsPenalty = 0;
    const repeatMatches = pwd.match(/(.)\1{2,}/g);
    if (repeatMatches) {
      for (const m of repeatMatches) {
        repeatedCharsPenalty += (m.length - 2) * 6;
      }
    }
    const uniqueChars = new Set(pwd).size;
    const uniquenessRatio = uniqueChars / pwd.length;
    if (pwd.length > 4 && uniquenessRatio < 0.6) {
      repeatedCharsPenalty += Math.round((0.6 - uniquenessRatio) * 30);
    }
    if (repeatedCharsPenalty > 0) {
      penalty += Math.min(25, repeatedCharsPenalty);
      suggestions.push('Avoid repeating identical characters consecutively.');
    }

    // B. Sequential runs penalty ("12345", "54321", "abcdef", "fedcba")
    const sequentialPenalty = this.calculateSequentialRunPenalty(pwd);
    if (sequentialPenalty > 0) {
      penalty += sequentialPenalty;
      suggestions.push('Avoid sequential letters or numbers (e.g. "12345", "abcdef").');
    }

    // C. Common keyboard patterns ("qwerty", "asdfgh", "zxcvbn")
    const keyboardPenalty = this.calculateKeyboardPatternPenalty(pwd);
    if (keyboardPenalty > 0) {
      penalty += keyboardPenalty;
      suggestions.push('Avoid common keyboard rows or zigzag patterns (e.g. "qwerty").');
    }

    // D. Dictionary match against embedded top 1,000 common passwords
    const lower = pwd.toLowerCase().trim();
    let isDictionaryMatch = false;
    let isExactMatch = false;

    if (COMMON_PASSWORDS.has(lower)) {
      isDictionaryMatch = true;
      isExactMatch = true;
      penalty += 45;
      warning = 'This is a commonly used password that can be easily guessed.';
      suggestions.unshift('Choose a unique password not found in standard wordlists.');
    } else {
      // Check if password starts with or contains common dictionary word of length >= 5
      for (const common of PasswordEvaluationService.SUBSTRING_ROOTS) {
        if (lower.includes(common)) {
          isDictionaryMatch = true;
          penalty += 18;
          warning = `Contains commonly used word "${common}".`;
          suggestions.unshift('Avoid predictable root words or names.');
          break;
        }
      }
    }

    // 5. Effective Entropy
    const effectiveEntropy = Math.max(0, Math.round(rawEntropy - penalty));

    // 6. Map to Score (0-100) & Level
    let score = 0;
    if (effectiveEntropy <= 20) {
      score = Math.round((effectiveEntropy / 20) * 20);
    } else if (effectiveEntropy <= 40) {
      score = 20 + Math.round(((effectiveEntropy - 20) / 20) * 20);
    } else if (effectiveEntropy <= 60) {
      score = 40 + Math.round(((effectiveEntropy - 40) / 20) * 25);
    } else if (effectiveEntropy <= 85) {
      score = 65 + Math.round(((effectiveEntropy - 60) / 25) * 20);
    } else {
      score = 85 + Math.min(15, Math.round(((effectiveEntropy - 85) / 25) * 15));
    }

    // Criteria diversity bonus: reward passwords meeting diverse character types
    // (applicable to fair/intermediate passwords without pushing them past Strong)
    const criteriaCount = [
      checks.minLength,
      checks.hasMixedCase,
      checks.hasNumbers,
      checks.hasSymbols
    ].filter(Boolean).length;

    if (criteriaCount >= 3 && !isExactMatch) {
      const bonus = criteriaCount === 4 ? 15 : 8;
      if (score < 65) {
        score = Math.min(65, score + bonus);
      }
    }

    // Exact dictionary matches are capped to Weak (>=8 chars) or Very Weak (<8 chars)
    if (isExactMatch) {
      if (length >= 8) {
        score = Math.max(25, Math.min(35, score));
      } else {
        score = Math.min(20, score);
      }
    } else if (isDictionaryMatch) {
      // Passwords containing a common substring are capped at Fair (<= 65)
      score = Math.min(65, score);
    }

    // Ensure score bounds
    score = Math.max(5, Math.min(100, score));

    // Determine Level
    let level: PasswordStrengthLevel = 'weak';
    let label = 'Weak';
    let labelKey = 'securityProtect.strengthWeak';

    if (score <= 20) {
      level = 'very-weak';
      label = 'Very Weak';
      labelKey = 'securityProtect.strengthVeryWeak';
    } else if (score <= 40) {
      level = 'weak';
      label = 'Weak';
      labelKey = 'securityProtect.strengthWeak';
    } else if (score <= 65) {
      level = 'fair';
      label = 'Fair';
      labelKey = 'securityProtect.strengthFair';
    } else if (score <= 85) {
      level = 'strong';
      label = 'Strong';
      labelKey = 'securityProtect.strengthStrong';
    } else {
      level = 'excellent';
      label = 'Excellent';
      labelKey = 'securityProtect.strengthExcellent';
    }

    // Add criteria suggestions if missing
    if (!checks.minLength) suggestions.push('Use at least 8 characters (12+ recommended).');
    if (!checks.hasMixedCase) suggestions.push('Include both uppercase and lowercase letters.');
    if (!checks.hasNumbers) suggestions.push('Include at least one number (0-9).');
    if (!checks.hasSymbols) suggestions.push('Include at least one special symbol (!@#$%^&*).');

    return {
      score,
      level,
      label,
      labelKey,
      entropyBits: effectiveEntropy,
      checks,
      suggestions: Array.from(new Set(suggestions)),
      warning,
      isDictionaryMatch
    };
  }

  /**
   * Generates a cryptographically secure, high-entropy memorable passphrase
   * composed of randomly selected words from a built-in curated 1,500-word dictionary.
   *
   * Uses crypto.getRandomValues with rejection sampling to eliminate modulo bias.
   */
  generatePassphrase(wordCount = 4, separator = '-'): string {
    const count = Math.max(3, Math.min(8, wordCount));
    const totalWords = PASSPHRASE_WORDLIST.length;
    // Rejection sampling bound to eliminate modulo bias: largest multiple of totalWords <= 2^32
    // 2^32 = 4294967296; 4294967296 % 1500 = 796; maxValid = 4294966500
    const maxValid = Math.floor(0x100000000 / totalWords) * totalWords;
    const selectedWords: string[] = [];

    const buffer = new Uint32Array(count * 2);
    let bufIndex = buffer.length;

    while (selectedWords.length < count) {
      if (bufIndex >= buffer.length) {
        crypto.getRandomValues(buffer);
        bufIndex = 0;
      }
      const val = buffer[bufIndex++];
      if (val < maxValid) {
        selectedWords.push(PASSPHRASE_WORDLIST[val % totalWords]);
      }
    }

    return selectedWords.join(separator);
  }

  /**
   * Detects whether an entered password configuration triggers the PDF ISO standard
   * Owner-to-User password fallback mechanism.
   *
   * In ISO 32000 specifications, when no Owner Password is set, the document defaults
   * the Owner password to the User password, meaning anyone who can view the document
   * can also unlock and edit permissions.
   */
  isOwnerPasswordFallback(userPassword?: string, ownerPassword?: string): boolean {
    const hasUser = Boolean(userPassword && userPassword.trim().length > 0);
    const hasOwner = Boolean(ownerPassword && ownerPassword.trim().length > 0);
    return hasUser && !hasOwner;
  }

  /**
   * Educational notice explaining the Owner vs User password relationship.
   */
  getOwnerPasswordFallbackNotice(): string {
    return 'When only one password is set, anyone who can open the file can also change permissions.';
  }

  // --- Internal Pattern Evaluators ---

  private calculateSequentialRunPenalty(pwd: string): number {
    const lower = pwd.toLowerCase();
    let penalty = 0;
    let runLength = 1;

    for (let i = 1; i < lower.length; i++) {
      const prevCode = lower.charCodeAt(i - 1);
      const currCode = lower.charCodeAt(i);

      if (currCode === prevCode + 1 || currCode === prevCode - 1) {
        runLength++;
      } else {
        if (runLength >= 3) {
          penalty += (runLength - 2) * 8;
        }
        runLength = 1;
      }
    }

    if (runLength >= 3) {
      penalty += (runLength - 2) * 8;
    }

    return Math.min(30, penalty);
  }

  private calculateKeyboardPatternPenalty(pwd: string): number {
    const lower = pwd.toLowerCase();
    let penalty = 0;

    for (const pattern of this.keyboardPatterns) {
      const revPattern = pattern.split('').reverse().join('');
      for (let len = 4; len <= 6; len++) {
        for (let i = 0; i <= pattern.length - len; i++) {
          const sub = pattern.substring(i, i + len);
          const revSub = revPattern.substring(i, i + len);
          if (lower.includes(sub) || lower.includes(revSub)) {
            penalty += 15;
            break;
          }
        }
      }
    }

    return Math.min(25, penalty);
  }
}
