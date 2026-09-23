// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  /*
   * Backend for accounts and premium entitlements, shared with the ContentFlow
   * platform. Empty means "same origin", which is what `ionic serve` wants with
   * a dev proxy; a Capacitor build has no origin of its own, so this must be an
   * absolute URL there.
   *
   * Everything else in this app stays on the device: no document, image or PDF
   * is ever sent to this server.
   */
  apiBaseUrl: 'http://localhost:3001'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
