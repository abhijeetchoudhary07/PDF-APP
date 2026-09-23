/**
 * Wire contract for the PDF App backend (`/api/v1/pdf-app`).
 *
 * A hand-maintained copy of the server's `shared/pdf-app-types.ts`. The server
 * lives in a different repository, so there is no package to import; this file
 * carries only the subset the app actually reads, and anything the client does
 * not use is deliberately left out rather than mirrored for completeness.
 *
 * If a field here stops matching the server, the app breaks at runtime and not
 * at compile time — so keep it narrow, and treat it as the place to look first
 * when a response "isn't what it should be".
 */

export type PdfAuthProvider = 'email' | 'google' | 'apple';

export type PdfSubscriptionStatus = 'active' | 'expired' | 'canceled' | 'trial';

export type PdfSubscriptionPlatform =
  | 'google_play'
  | 'app_store'
  | 'manual_admin'
  | 'promotional';

export interface PdfSafeUser {
  id: string;
  email: string;
  displayName: string | null;
  authProvider: PdfAuthProvider;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** What the app gates premium features on. */
export interface PdfEntitlement {
  isPremium: boolean;
  planId: string;
  status: PdfSubscriptionStatus;
  /** Null means the entitlement never expires. */
  validUntil: string | null;
  platform: PdfSubscriptionPlatform | null;
  daysRemaining: number | null;
}

export interface PdfPlan {
  planId: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number | null;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface PdfSubscription {
  id: string;
  userId: string;
  planId: string;
  status: PdfSubscriptionStatus;
  validUntil: string | null;
  originalTransactionId: string | null;
  platform: PdfSubscriptionPlatform;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PdfTokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface PdfAuthResponse extends PdfTokenPair {
  user: PdfSafeUser;
  entitlement: PdfEntitlement;
}

export interface PdfMeResponse {
  user: PdfSafeUser;
  entitlement: PdfEntitlement;
  subscription: PdfSubscription | null;
}

export interface PdfPlansResponse {
  plans: PdfPlan[];
}

export interface PdfVerifyPurchaseResponse {
  entitlement: PdfEntitlement;
  subscription: PdfSubscription;
  alreadyProcessed: boolean;
}

/** The shape the server's error handler returns for every non-2xx response. */
export interface PdfApiError {
  error: string;
  requestId?: string;
}

/** The entitlement a signed-out or never-subscribed user has. */
export const FREE_ENTITLEMENT: PdfEntitlement = {
  isPremium: false,
  planId: 'free',
  status: 'expired',
  validUntil: null,
  platform: null,
  daysRemaining: null,
};
