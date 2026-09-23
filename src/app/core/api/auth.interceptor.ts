import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, from, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_ROOT, AuthService, isUnauthenticatedEndpoint } from './auth.service';

/**
 * Attaches the account's access token, and renews it once when the server says
 * it has expired.
 *
 * Scoped to `API_ROOT` on purpose: this app also fetches local assets
 * (`assets/presets/*.json`) over the same HttpClient, and those must never
 * carry a bearer token.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_ROOT)) {
    return next(request);
  }

  const auth = inject(AuthService);

  if (isUnauthenticatedEndpoint(request.url)) {
    return next(request);
  }

  return next(withToken(request, auth.getAccessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // One attempt only. `refreshSession` single-flights, so parallel 401s
      // share a single rotation instead of racing each other into a logout.
      return from(auth.refreshSession()).pipe(
        switchMap((token): Observable<HttpEvent<unknown>> => {
          if (!token) {
            // Refresh failed; the service has already signed the user out.
            return throwError(() => error);
          }
          return next(withToken(request, token));
        }),
      );
    }),
  );
};

function withToken(
  request: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> {
  if (!token) {
    return request;
  }
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
