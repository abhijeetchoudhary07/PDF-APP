/**
 * The email and password rules the account screen enforces before it calls the
 * server.
 *
 * These are a deliberate mirror of `server/pdf-app/validation.ts` in the
 * backend repository, not an independent opinion. Client-side validation here
 * exists to save a round trip and to put the message next to the field that is
 * wrong — the server re-checks everything and is the only thing standing
 * between the database and a malformed account. If the two ever disagree, the
 * server wins and the user sees a confusing "that looked fine to me" failure,
 * so the constants and the pattern are copied verbatim rather than rewritten.
 *
 * Note what is *not* here: composition requirements. The server's own comment
 * explains why — "one symbol, one digit" pushes people toward `Password1!` and
 * buys nothing, so length is the whole rule. Adding a stricter client rule
 * would lock people out of accounts the server is perfectly happy to create.
 */

/** Verbatim from the server. Permissive on purpose: delivery proves an address, a regex does not. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** Matches the server's `requireEmail`: trimmed, lowercased, pattern-checked. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * The message to show under the email field, or null when it is acceptable.
 *
 * Returning the message rather than a boolean keeps the caller from having to
 * decide which of several failures happened.
 */
export function emailProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter your email address.';
  }
  if (!isValidEmail(trimmed)) {
    return 'Enter a valid email address, like you@example.com.';
  }
  return null;
}

/** The message to show under the password field, or null when it is acceptable. */
export function passwordProblem(value: string): string | null {
  if (!value) {
    return 'Enter a password.';
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    // The ceiling is not arbitrary: it stops a megabyte of text reaching scrypt.
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
