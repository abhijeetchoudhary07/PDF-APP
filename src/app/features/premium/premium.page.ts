import { Component, ChangeDetectionStrategy } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { CommonModule } from '@angular/common';
import { MonetizationService } from '../../core/services/monetization.service';
import { Router } from '@angular/router';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-premium',
  templateUrl: './premium.page.html',
  styleUrls: ['./premium.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
    CommonModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent
  ]
})
export class PremiumPage {
  // Mock packages for the UI. In a real app, these come from RevenueCat.
  packages = [
    { id: 'monthly', title: 'Monthly', priceString: '₹99/mo' },
    { id: 'yearly', title: 'Yearly', priceString: '₹499/yr' },
    { id: 'lifetime', title: 'Lifetime', priceString: '₹1499' }
  ];

  constructor(
    private monetization: MonetizationService,
    private router: Router
  ) {}

  async buy(pkg: any) {
    const success = await this.monetization.purchasePackage(pkg);
    if (success) {
      alert('Welcome to Premium!');
      this.router.navigate(['/home']);
    }
  }
}
