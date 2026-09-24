import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Production Capacitor configuration for the Google Play release.
 *
 * `appId` is the Android package name. Google Play binds it to the listing the
 * first time a build is uploaded and it can never be changed afterwards, so it
 * is set here rather than left on the Ionic starter default.
 */
const config: CapacitorConfig = {
  appId: 'com.pdfhelper.indianformhelper',
  appName: 'Indian Form Helper',
  webDir: 'www',

  android: {
    /*
     * The app is a document tool, not a browser: nothing it loads is remote, so
     * cleartext stays off and mixed content is refused. Play's pre-launch
     * report flags both when they are left on.
     */
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    /*
     * Edge-to-edge. index.html already asks for viewport-fit=cover, and the
     * header and footer pad themselves with env(safe-area-inset-*), so the app
     * paints under the status and gesture bars without anything being hidden.
     */
    backgroundColor: '#ffffff'
  },

  plugins: {
    /*
     * The splash is dismissed from code once the first route has rendered, so
     * the brand screen is never followed by a flash of an empty shell.
     * Requires @capacitor/splash-screen; the keys are inert until it is added.
     */
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 3000,
      backgroundColor: '#4f46e5',
      androidScaleType: 'CENTER_CROP',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    },

    StatusBar: {
      /*
       * Dark glyphs on the light brand surface the header paints. The theme
       * service flips this at runtime when the app is in dark mode.
       */
      style: 'LIGHT',
      backgroundColor: '#ffffff',
      overlaysWebView: true
    },

    Keyboard: {
      // The tool pages scroll themselves; letting the OS resize the webview as
      // well double-scrolls the focused field out of view.
      resize: 'none',
      resizeOnFullScreen: true
    }
  }
};

export default config;
