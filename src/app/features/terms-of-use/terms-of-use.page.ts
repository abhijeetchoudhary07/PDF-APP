import { Component, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule } from '@angular/router';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  PrivacySupportNavComponent,
  AppButtonComponent
} from '../../shared/components/ui';

@Component({
  selector: 'app-terms-of-use',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './terms-of-use.page.html',
  styleUrls: ['./terms-of-use.page.scss'],
  imports: [
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    PrivacySupportNavComponent,
    AppButtonComponent
]
})
export class TermsOfUsePage {
  lastUpdated = 'September 2026';

  printPage(): void {
    window.print();
  }
}
