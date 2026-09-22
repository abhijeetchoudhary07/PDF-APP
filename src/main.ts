import { enableProdMode, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
} from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular/lazy';

import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
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
    importProvidersFrom(IonicModule.forRoot()),
    provideRouter(APP_ROUTES, withPreloading(PreloadAllModules)),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
}).catch(err => console.error(err));
