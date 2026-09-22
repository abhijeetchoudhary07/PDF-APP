import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
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
    IonicModule,
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
