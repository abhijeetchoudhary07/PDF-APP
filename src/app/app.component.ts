import { Component, ChangeDetectionStrategy, OnDestroy, inject } from '@angular/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { ThemeService } from './core/services/theme.service';
import { MonetizationService } from './core/services/monetization.service';
import { ToastService } from './core/services/toast.service';
import {
  AppToastContainerComponent,
  AppGlobalSearchModalComponent,
  AppOnboardingModalComponent,
  AppSecurityLockOverlayComponent
} from './shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    IonApp,
    IonRouterOutlet,
    AppToastContainerComponent,
    AppGlobalSearchModalComponent,
    AppOnboardingModalComponent,
    AppSecurityLockOverlayComponent
  ],
})
export class AppComponent implements OnDestroy {
  private themeService = inject(ThemeService);
  private monetization = inject(MonetizationService);
  public toastService = inject(ToastService);

  private resumeListener?: PluginListenerHandle;

  constructor() {
    if (typeof window !== 'undefined') {
      (window as any).__toastService = this.toastService;
    }
    void this.watchForResume();
  }

  /**
   * Re-checks the account's entitlement whenever the app comes back to the
   * foreground.
   *
   * This is the path a support grant takes to the device: an admin marks the
   * account premium, the person switches back to the app, and the features
   * unlock. Without it they would have to reinstall to notice.
   */
  private async watchForResume(): Promise<void> {
    try {
      this.resumeListener = await App.addListener('resume', () => {
        void this.monetization.refreshFromServer();
      });
    } catch {
      // No Capacitor runtime (browser / `ionic serve`): the sync on startup is
      // enough there, and a missing listener must not stop the app booting.
    }
  }

  ngOnDestroy(): void {
    void this.resumeListener?.remove();
  }
}
