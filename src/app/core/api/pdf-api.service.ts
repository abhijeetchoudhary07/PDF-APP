import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ROOT, toAuthError } from './auth.service';
import type {
  PdfManualPayment,
  PdfManualPaymentResponse,
  PdfMyManualPaymentsResponse,
  PdfPaymentSettings,
  PdfPaymentSettingsResponse,
  PdfPlan,
  PdfPlansResponse,
  PdfSubmitManualPaymentRequest,
  PdfVerifyPurchaseResponse,
} from './pdf-api.types';

/**
 * Everything the app asks the backend for beyond signing in.
 *
 * Auth lives in `AuthService` because it owns the tokens; this is the rest of
 * the surface, and it is deliberately small — the backend knows about accounts
 * and entitlements, and nothing about documents.
 */
@Injectable({ providedIn: 'root' })
export class PdfApiService {
  private readonly http = inject(HttpClient);

  /** The paywall's source of truth. Public: pricing is shown before sign-in. */
  async plans(): Promise<PdfPlan[]> {
    const response = await firstValueFrom(
      this.http.get<PdfPlansResponse>(`${API_ROOT}/subscription/plans`),
    );
    return response.plans;
  }

  /**
   * Hands a store purchase to the server for verification.
   *
   * The server checks it with Google Play / RevenueCat before recording
   * anything, so this is what turns a purchase on *this* device into an
   * entitlement that survives a reinstall or a new phone. Safe to call again
   * on every launch or restore: the server keys on the transaction id.
   */
  async verifyPurchase(input: {
    purchaseToken: string;
    productId: string;
    originalTransactionId?: string;
  }): Promise<PdfVerifyPurchaseResponse> {
    try {
      return await firstValueFrom(
        this.http.post<PdfVerifyPurchaseResponse>(`${API_ROOT}/subscription/verify`, input),
      );
    } catch (error) {
      throw toAuthError(error);
    }
  }

  /**
   * The payee details for a manual (UPI) payment.
   *
   * Public, like the plan list: the app shows *how* to pay before anyone signs
   * in, and only the submission afterwards needs an account.
   */
  async paymentSettings(): Promise<PdfPaymentSettings> {
    const response = await firstValueFrom(
      this.http.get<PdfPaymentSettingsResponse>(`${API_ROOT}/subscription/payment-settings`),
    );
    return response.settings;
  }

  /**
   * Submits a payment reference for review.
   *
   * This grants nothing. It records that someone says they have paid; premium
   * arrives when an admin confirms the transfer, which is why the app has to
   * show a pending state rather than an unlock.
   */
  async submitManualPayment(
    input: PdfSubmitManualPaymentRequest,
  ): Promise<PdfManualPayment> {
    try {
      const response = await firstValueFrom(
        this.http.post<PdfManualPaymentResponse>(
          `${API_ROOT}/subscription/manual-payment`,
          input,
        ),
      );
      return response.request;
    } catch (error) {
      throw toAuthError(error);
    }
  }

  /** This account's payment claims, newest first, plus its live entitlement. */
  async myManualPayments(): Promise<PdfMyManualPaymentsResponse> {
    try {
      return await firstValueFrom(
        this.http.get<PdfMyManualPaymentsResponse>(`${API_ROOT}/subscription/manual-payment`),
      );
    } catch (error) {
      throw toAuthError(error);
    }
  }
}
