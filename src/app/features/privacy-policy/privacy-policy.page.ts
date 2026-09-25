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
  selector: 'app-privacy-policy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './privacy-policy.page.html',
  styleUrls: ['./privacy-policy.page.scss'],
  imports: [
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    PrivacySupportNavComponent,
    AppButtonComponent
]
})
export class PrivacyPolicyPage {
  lastUpdated = 'September 2026';

  printPage(): void {
    window.print();
  }
}
