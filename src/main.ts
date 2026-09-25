import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { authInterceptor } from './app/core/api/auth.interceptor';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    /*
     * Opt in to zone-based change detection.
     *
     * Angular 22 defaults to zoneless, and `bootstrapModule` gave no way to
     * override that from the module's own providers — which is why this app
     * bootstraps standalone. Nearly all of its work (pdf-lib, pdf.js, image
     * compression, Capacitor storage) happens in async continuations; with no
     * zone, Angular was never notified when those resolved, so file pickers,
     * progress bars and result cards stayed frozen until an unrelated click
     * happened to trigger a change-detection pass. Coalescing collapses bursts
     * of events and microtasks into a single pass to keep the cost down.
     */
    provideZoneChangeDetection({ eventCoalescing: true, runCoalescing: true }),

    /*
     * Ionic, in standalone mode.
     *
     * This used to be `importProvidersFrom(IonicModule.forRoot())`.
     * `IonicModule` is deprecated and slated for removal in a future Ionic
     * major, and the two builds cannot coexist — `@ionic/angular/lazy` registers
     * every custom element through a lazy loader, while `@ionic/angular`
     * defines each one eagerly as it is imported, so a single import from the
     * wrong entry point redefines elements that are already defined. The app
     * was already half over the line — `MonetizationService` took `Platform`
     * from the standalone entry — so the whole of it now uses that one.
     *
     * The practical difference is that components are no longer ambient.
     * `ion-app` and `ion-router-outlet` in `app.component.html` are the only
     * Ionic elements this app renders; `AppComponent` imports those two by
     * name, and the overlay controllers (`AlertController`, `ToastController`,
     * `ModalController`, ...) define their own elements when injected.
     */
    provideIonicAngular(),

    /*
     * HttpClient reaches exactly two things: bundled JSON under `assets/`
     * (PresetService, which until now had no provider at all and would have
     * thrown on first use) and the accounts/entitlements backend. The
     * interceptor only touches the latter — it attaches the access token and
     * renews it once on a 401. No document ever goes over this client.
     */
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(APP_ROUTES, withPreloading(PreloadAllModules)),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
}).catch(err => console.error(err));
