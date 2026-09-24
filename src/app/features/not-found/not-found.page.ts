import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import {
  AppHeaderComponent,
  AppFooterComponent,
  AppIconComponent
} from '../../shared/components/ui';

/**
 * The destination for anything the router cannot match.
 *
 * It keeps the shell (header, drawer, footer) so a wrong URL is a dead end for
 * one screen rather than for the session — the two primary actions and the
 * shortcut chips below them cover where people actually meant to go.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-not-found',
  standalone: true,
  templateUrl: './not-found.page.html',
  styleUrls: ['./not-found.page.scss'],
  imports: [
    CommonModule,
    RouterModule,
    IonicModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppIconComponent
  ]
})
export class NotFoundPage {
  /** The tools a mistyped or stale link was most likely aiming at. */
  readonly shortcuts: { route: string; label: string }[] = [
    { route: '/features/photo', label: 'Photo Tools' },
    { route: '/features/signature', label: 'Signature Tools' },
    { route: '/features/pdf-compress', label: 'Compress PDF' },
    { route: '/features/pdf/merge', label: 'Merge PDF' },
    { route: '/features/presets', label: 'Exam Presets' },
    { route: '/features/settings', label: 'Settings' }
  ];
}
