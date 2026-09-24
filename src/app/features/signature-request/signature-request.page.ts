import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular/lazy';
import { Router } from '@angular/router';
import { FileService } from '../../core/services/file.service';
import { SignatureRequestService } from '../../core/services/signature-request.service';
import {
  SignatureRequest,
  SignatureRecipient,
  SignatureRequestField,
  RecipientRole
} from '../../core/models/signature-request.types';
import * as pdfjsLib from 'pdfjs-dist';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-signature-request',
  templateUrl: './signature-request.page.html',
  styleUrls: ['./signature-request.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppTabsComponent
  ],
  providers: [DecimalPipe]
})
export class SignatureRequestPage {
  activeTab: 'remote' | 'local' = 'remote';

  requestTabs = [
    { id: 'remote', label: 'Remote Request Workflow' },
    { id: 'local', label: 'Local Signing (Offline)' }
  ];

  onTabChange(tab: string) {
    this.activeTab = tab as any;
    if (tab === 'local') {
      this.switchToLocalSigning();
    }
  }

  request?: SignatureRequest;
  pdfFile?: File;
  pdfArrayBuffer?: ArrayBuffer;

  // New Recipient Form State
  showAddRecipientDialog = false;
  newRecipientName = '';
  newRecipientEmail = '';
  newRecipientRole: RecipientRole = 'signer';

  // Field Placement State
  selectedRecipientId?: string;
  selectedFieldType: 'signature' | 'date' | 'text' | 'checkbox' = 'signature';
  currentPage = 1;

  isProcessing = false;

  constructor(
    private fileService: FileService,
    private requestService: SignatureRequestService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  switchToLocalSigning(): void {
    this.router.navigate(['/features/pdf/sign']);
  }

  async selectDocument(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;

    this.isProcessing = true;
    try {
      this.pdfFile = file;
      this.pdfArrayBuffer = await file.arrayBuffer();

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(this.pdfArrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;

      this.request = this.requestService.createDraft(
        file.name.replace(/\.pdf$/i, ''),
        file.name,
        file.size,
        pdf.numPages
      );
      this.currentPage = 1;
    } catch (e: any) {
      alert('Error analyzing document: ' + e);
    } finally {
      this.isProcessing = false;
    }
  }

  // --- RECIPIENT MANAGEMENT ---
  openAddRecipient(): void {
    this.newRecipientName = '';
    this.newRecipientEmail = '';
    this.newRecipientRole = 'signer';
    this.showAddRecipientDialog = true;
  }

  closeAddRecipient(): void {
    this.showAddRecipientDialog = false;
  }

  addRecipient(): void {
    if (!this.request) return;
    if (!this.newRecipientName.trim() || !this.newRecipientEmail.trim()) {
      alert('Please enter a valid recipient name and email.');
      return;
    }

    const recipient = this.requestService.addRecipient(this.request, {
      name: this.newRecipientName.trim(),
      email: this.newRecipientEmail.trim(),
      role: this.newRecipientRole,
      signingOrder: this.request.recipients.length + 1
    });

    if (!this.selectedRecipientId) {
      this.selectedRecipientId = recipient.id;
    }

    this.closeAddRecipient();
  }

  removeRecipient(id: string): void {
    if (!this.request) return;
    this.request.recipients = this.request.recipients.filter(r => r.id !== id);
    this.request.fields = this.request.fields.filter(f => f.recipientId !== id);
    if (this.selectedRecipientId === id) {
      this.selectedRecipientId = this.request.recipients[0]?.id;
    }
  }

  // --- FIELD PLACEMENT ---
  addFieldToCurrentPage(): void {
    if (!this.request || !this.selectedRecipientId) return;

    const recipient = this.request.recipients.find(r => r.id === this.selectedRecipientId);
    if (!recipient) return;

    this.requestService.addField(this.request, {
      recipientId: this.selectedRecipientId,
      type: this.selectedFieldType,
      pageNumber: this.currentPage,
      x: 100,
      y: 150 + this.request.fields.filter(f => f.pageNumber === this.currentPage).length * 40,
      width: this.selectedFieldType === 'checkbox' ? 24 : 160,
      height: this.selectedFieldType === 'checkbox' ? 24 : 36,
      required: true,
      label: `${this.selectedFieldType.toUpperCase()} for ${recipient.name}`
    });
  }

  removeField(id: string): void {
    if (!this.request) return;
    this.request.fields = this.request.fields.filter(f => f.id !== id);
  }

  getRecipient(id: string): SignatureRecipient | undefined {
    return this.request?.recipients.find(r => r.id === id);
  }

  // --- MANIFEST EXPORT ---
  async exportRequestManifest(): Promise<void> {
    if (!this.request) return;

    const { fileName, content } = this.requestService.exportRequestManifest(this.request);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    const toast = await this.toastCtrl.create({
      message: 'Signature request specification manifest exported (JSON).',
      duration: 3000,
      color: 'success'
    });
    await toast.present();
  }

  async showBackendNotice(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Backend Service Required for Remote Delivery',
      subHeader: 'Offline-First Product Notice',
      message:
        'Remote signature requests require a secure cloud backend (e.g. DocuSign, Adobe Sign, or a self-hosted REST API) to send emails, verify identity, collect audit trails, and distribute copies.\n\nIn offline mode, you can draft, configure recipients/fields, and export the complete Request Package. You can also sign this document locally right now.',
      buttons: [
        {
          text: 'Sign Locally Now',
          handler: () => this.switchToLocalSigning()
        },
        { text: 'Understood', role: 'cancel' }
      ]
    });
    await alert.present();
  }
}
