import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { ThemeService } from './core/services/theme.service';
import {
  AppToastContainerComponent,
  AppGlobalSearchModalComponent,
  AppOnboardingModalComponent
} from './shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    IonicModule,
    AppToastContainerComponent,
    AppGlobalSearchModalComponent,
    AppOnboardingModalComponent
  ],
})
export class AppComponent {
  private themeService = inject(ThemeService);
  constructor() {}
}
