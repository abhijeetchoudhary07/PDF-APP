import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HistoryService, HistoryItem } from '../../core/services/history.service';
import { ShareService } from '../../core/services/share.service';

import { RouterModule } from '@angular/router';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppSkeletonComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    AppSkeletonComponent,
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    TranslatePipe
  ],
  providers: [DatePipe, DecimalPipe]
})
export class HistoryPage implements OnInit {
  private historyService = inject(HistoryService);
  private shareService = inject(ShareService);
  private alertCtrl = inject(AlertController);

  history: HistoryItem[] = [];
  selectedFilter = 'ALL';

  filters = ['ALL', 'PHOTO', 'SIGNATURE', 'PDF', 'CONVERT', 'FORMS', 'SECURITY', 'OCR', 'SCAN', 'VALIDATE', 'COMPARE', 'QR', 'AI'];

  /*
   * `isLoading` exists so the empty state is not shown while storage is still
   * being read — otherwise the page flashed "No Processing History" on every
   * visit before the real list arrived.
   */
  isLoading = true;

  async ionViewWillEnter() {
    await this.loadHistory();
  }

  async ngOnInit() {
    await this.loadHistory();
  }

  private async loadHistory() {
    try {
      this.history = await this.historyService.getHistory();
    } finally {
      this.isLoading = false;
    }
  }

  get filteredHistory(): HistoryItem[] {
    if (this.selectedFilter === 'ALL') return this.history;

    return this.history.filter(item => {
      const op = (item.operation || '').toLowerCase();
      switch (this.selectedFilter) {
        case 'PHOTO':
          return op.includes('photo');
        case 'SIGNATURE':
          return op.includes('signature') && !op.includes('pdf');
        case 'PDF':
          return op.includes('pdf') && !op.includes('form') && !op.includes('sign') && !op.includes('protect') && !op.includes('unlock') && !op.includes('flatten') && !op.includes('compare') && !op.includes('repair') && !op.includes('ocr') && !op.includes('intelligence');
        case 'CONVERT':
          return op.includes('conversion') || op.includes('convert');
        case 'FORMS':
          return op.includes('form');
        case 'SECURITY':
          return op.includes('protect') || op.includes('unlock') || op.includes('flatten');
        case 'OCR':
          return op.includes('ocr');
        case 'SCAN':
          return op.includes('scan') && !op.includes('qr');
        case 'VALIDATE':
          return op.includes('validate') || op.includes('validator');
        case 'COMPARE':
          return op.includes('compare');
        case 'QR':
          return op.includes('qr') || op.includes('barcode');
        case 'AI':
          return op.includes('intelligence') || op.includes('summarize') || op.includes('translate');
        default:
          return true;
      }
    });
  }

  getOperationBadge(operation: string): { label: string; color: string } {
    const op = (operation || '').toLowerCase();
    if (op === 'pdf_form') return { label: 'FORM FILLED', color: 'primary' };
    if (op === 'pdf_sign') return { label: 'SIGNED PDF', color: 'success' };
    if (op === 'pdf_protect') return { label: 'PROTECTED', color: 'warning' };
    if (op === 'pdf_unlock') return { label: 'UNLOCKED', color: 'success' };
    if (op === 'pdf_flatten') return { label: 'FLATTENED', color: 'dark' };
    if (op.includes('photo')) return { label: 'PHOTO', color: 'primary' };
    if (op.includes('signature')) return { label: 'SIGNATURE', color: 'secondary' };
    if (op.includes('conversion')) return { label: 'CONVERTED', color: 'tertiary' };
    if (op.includes('ocr')) return { label: 'OCR', color: 'primary' };
    if (op.includes('scan') && !op.includes('qr')) return { label: 'SCANNER', color: 'success' };
    if (op.includes('validate')) return { label: 'VALIDATED', color: 'warning' };
    if (op.includes('compare')) return { label: 'COMPARE', color: 'secondary' };
    if (op.includes('sanitizer')) return { label: 'SANITIZED', color: 'dark' };
    if (op.includes('header-footer')) return { label: 'HEADER/FOOTER', color: 'tertiary' };
    if (op.includes('repair')) return { label: 'REPAIRED', color: 'warning' };
    if (op.includes('extract')) return { label: 'EXTRACTED', color: 'primary' };
    if (op.includes('qr') || op.includes('barcode')) return { label: 'QR / BARCODE', color: 'success' };
    if (op.includes('intelligence')) return { label: 'AI INTELLIGENCE', color: 'tertiary' };
    return { label: op.toUpperCase(), color: 'medium' };
  }

  async shareItem(item: HistoryItem) {
    if (item.outputPath && item.outputPath !== 'web-download') {
      await this.shareService.shareFile(item.outputPath, `Form File: ${item.outputFileName}`);
    } else {
      const alert = await this.alertCtrl.create({
        header: 'Download Notice',
        message: 'This file was saved via web download directly to your downloads folder. Please check your browser downloads.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  async deleteItem(item: HistoryItem) {
    await this.historyService.deleteItem(item.id);
    this.history = await this.historyService.getHistory();
  }

  async clearHistory() {
    const alert = await this.alertCtrl.create({
      header: 'Clear All History?',
      message: 'This will clear all processing records. Your downloaded and saved files will not be deleted.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: async () => {
            await this.historyService.clearHistory();
            this.history = [];
          }
        }
      ]
    });
    await alert.present();
  }
}
