import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HomePage } from './home.page';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppBadgeComponent,
  AppButtonComponent,
  AppEmptyStateComponent,
  AppIconComponent,
  TranslatePipe
} from '../shared/components/ui';

import { HomePageRoutingModule } from './home-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    HomePageRoutingModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppBadgeComponent,
    AppButtonComponent,
    AppEmptyStateComponent,
    AppIconComponent,
    TranslatePipe
  ],
  declarations: [HomePage]
})
export class HomePageModule {}
