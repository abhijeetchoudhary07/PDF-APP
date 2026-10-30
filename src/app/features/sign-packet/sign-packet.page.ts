import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PDFDocument } from 'pdf-lib';

import { PdfSigningPacketService } from '../../core/services/pdf-signing-packet.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import { StorageService } from '../../core/services/storage.service';
import {
  PacketSigner,
  SigningWorkflowMode,
  SigningPacketStatusReport,
  SignFieldExecutionData
} from '../../core/models/signing-packet.types';
import {
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-sign-packet',
  templateUrl: './sign-packet.page.html',
  styleUrls: ['./sign-packet.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppIconComponent,
    TranslatePipe
  ]
})
export class SignPacketPage implements OnInit, AfterViewInit {
  private packetService = inject(PdfSigningPacketService);
  private documentBridge = inject(DocumentBridgeService);
  private shareService = inject(ShareService);
  private storageService = inject(StorageService, { optional: true });
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('sigCanvas') sigCanvasRef?: ElementRef<HTMLCanvasElement>;

  // Workflow Mode
  activeMode: 'designer' | 'signer' = 'designer';

  // Loaded Document State
  pdfBytes: Uint8Array | null = null;
  fileName = 'document.pdf';
  isLoadingDoc = false;
  detectedFieldIds: string[] = [];

  // Packet Designer State
  packetTitle = 'Multi-Party Agreement';
  workflowMode: SigningWorkflowMode = 'sequential';
  signers: PacketSigner[] = [];

  // Signer Edit Modal / Sheet State
  showSignerModal = false;
  editingSignerIndex = -1;
  signerForm = {
    name: '',
    emailOrPhone: '',
    role: '',
    orderIndex: 1,
    assignedFields: new Set<string>()
  };

  // Signer Execution State
  statusReport: SigningPacketStatusReport | null = null;
  activeSignerId: string | null = null;
  fieldData: Record<string, SignFieldExecutionData> = {};
  isExecutingSign = false;

  // Signature Pad Modal State
  showSignaturePad = false;
  activeSigningFieldId: string | null = null;
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  async ngOnInit(): Promise<void> {
    const bridged = this.documentBridge.consumeDocument();
    if (bridged?.file) {
      await this.loadPdfFile(bridged.file);
    } else {
      // Create a default initial template if none bridged
      await this.initSampleDocument();
    }
  }

  ngAfterViewInit(): void {
    if (this.showSignaturePad) {
      this.initSignatureCanvas();
    }
  }

  // ==========================================
  // Document Ingestion & Inspection
  // ==========================================

  async triggerFileInput(inputEl: HTMLInputElement): Promise<void> {
    inputEl.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.loadPdfFile(input.files[0]);
    }
    input.value = '';
  }

  async loadPdfFile(file: File): Promise<void> {
    this.isLoadingDoc = true;
    this.fileName = file.name;
    this.cdr.markForCheck();

    try {
      const buffer = await file.arrayBuffer();
      this.pdfBytes = new Uint8Array(buffer);
      await this.analyzeLoadedDocument();
    } catch (err) {
      console.error('Error loading PDF file:', err);
      await this.showToast('Could not load the selected PDF document', 'danger');
    } finally {
      this.isLoadingDoc = false;
      this.cdr.markForCheck();
    }
  }

  async initSampleDocument(): Promise<void> {
    try {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]); // A4
      const form = doc.getForm();

      // Sample agreement title text & fields
      const tf1 = form.createTextField('party1_name');
      tf1.addToPage(page, { x: 50, y: 700, width: 220, height: 28 });

      const tf2 = form.createTextField('party2_name');
      tf2.addToPage(page, { x: 50, y: 550, width: 220, height: 28 });

      const cb = form.createCheckBox('terms_agreement');
      cb.addToPage(page, { x: 50, y: 450, width: 20, height: 20 });

      this.pdfBytes = await doc.save();
      this.fileName = 'Sample_Agreement.pdf';
      await this.analyzeLoadedDocument();
    } catch (e) {
      console.warn('Could not initialize sample document:', e);
    }
  }

  private async analyzeLoadedDocument(): Promise<void> {
    if (!this.pdfBytes) return;

    // Detect form fields
    try {
      const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
      const form = doc.getForm();
      this.detectedFieldIds = form.getFields().map(f => f.getName());
    } catch {
      this.detectedFieldIds = [];
    }

    // Inspect if document is an active signing packet
    this.statusReport = await this.packetService.inspectPacket(this.pdfBytes);

    if (this.statusReport.isPacket) {
      this.activeMode = 'signer';
      this.workflowMode = this.statusReport.manifest?.workflowMode || 'sequential';
      this.signers = this.statusReport.manifest?.signers || [];
      this.packetTitle = this.statusReport.manifest?.title || 'Signing Packet';

      // Pick default active signer to execute
      if (this.statusReport.currentSigner) {
        this.activeSignerId = this.statusReport.currentSigner.id;
      } else {
        const firstPending = this.signers.find(s => s.status === 'pending');
        this.activeSignerId = firstPending ? firstPending.id : (this.signers[0]?.id || null);
      }
      this.initSignerFieldData();
    } else {
      this.activeMode = 'designer';
      // Setup default designer signers if empty
      if (this.signers.length === 0) {
        this.signers = [
          {
            id: 'signer-1',
            name: 'Primary Signer',
            emailOrPhone: 'signer1@example.com',
            role: 'Reviewer / Initiator',
            orderIndex: 1,
            assignedFieldIds: this.detectedFieldIds.length > 0 ? [this.detectedFieldIds[0]] : [],
            status: 'pending'
          },
          {
            id: 'signer-2',
            name: 'Secondary Approver',
            emailOrPhone: 'signer2@example.com',
            role: 'Approver / Counterparty',
            orderIndex: 2,
            assignedFieldIds: this.detectedFieldIds.length > 1 ? [this.detectedFieldIds[1]] : [],
            status: 'pending'
          }
        ];
      }
    }

    this.cdr.markForCheck();
  }

  private initSignerFieldData(): void {
    this.fieldData = {};
    const signer = this.getActiveSigner();
    if (signer) {
      for (const fid of signer.assignedFieldIds) {
        this.fieldData[fid] = {
          fieldId: fid,
          value: '',
          signatureDataUrl: undefined
        };
      }
    }
  }

  // ==========================================
  // Designer Operations
  // ==========================================

  setWorkflowMode(mode: SigningWorkflowMode): void {
    this.workflowMode = mode;
    this.cdr.markForCheck();
  }

  openAddSignerModal(): void {
    this.editingSignerIndex = -1;
    this.signerForm = {
      name: '',
      emailOrPhone: '',
      role: '',
      orderIndex: this.signers.length + 1,
      assignedFields: new Set<string>()
    };
    this.showSignerModal = true;
    this.cdr.markForCheck();
  }

  openEditSignerModal(index: number): void {
    const s = this.signers[index];
    if (!s) return;

    this.editingSignerIndex = index;
    this.signerForm = {
      name: s.name,
      emailOrPhone: s.emailOrPhone,
      role: s.role,
      orderIndex: s.orderIndex,
      assignedFields: new Set(s.assignedFieldIds)
    };
    this.showSignerModal = true;
    this.cdr.markForCheck();
  }

  toggleAssignedField(fieldId: string): void {
    if (this.signerForm.assignedFields.has(fieldId)) {
      this.signerForm.assignedFields.delete(fieldId);
    } else {
      this.signerForm.assignedFields.add(fieldId);
    }
    this.cdr.markForCheck();
  }

  saveSigner(): void {
    if (!this.signerForm.name.trim()) {
      this.showToast('Signer name is required', 'warning');
      return;
    }

    const assigned = Array.from(this.signerForm.assignedFields);

    if (this.editingSignerIndex >= 0) {
      const existing = this.signers[this.editingSignerIndex];
      this.signers[this.editingSignerIndex] = {
        ...existing,
        name: this.signerForm.name.trim(),
        emailOrPhone: this.signerForm.emailOrPhone.trim(),
        role: this.signerForm.role.trim(),
        orderIndex: this.signerForm.orderIndex,
        assignedFieldIds: assigned
      };
    } else {
      const newSigner: PacketSigner = {
        id: `signer-${Date.now()}`,
        name: this.signerForm.name.trim(),
        emailOrPhone: this.signerForm.emailOrPhone.trim(),
        role: this.signerForm.role.trim(),
        orderIndex: this.signerForm.orderIndex,
        assignedFieldIds: assigned,
        status: 'pending'
      };
      this.signers.push(newSigner);
    }

    this.reindexSigners();
    this.showSignerModal = false;
    this.cdr.markForCheck();
  }

  deleteSigner(index: number): void {
    this.signers.splice(index, 1);
    this.reindexSigners();
    this.cdr.markForCheck();
  }

  moveSigner(index: number, direction: 'up' | 'down'): void {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.signers.length) return;

    const temp = this.signers[index];
    this.signers[index] = this.signers[target];
    this.signers[target] = temp;

    this.reindexSigners();
    this.cdr.markForCheck();
  }

  private reindexSigners(): void {
    this.signers.forEach((s, idx) => {
      s.orderIndex = idx + 1;
    });
  }

  async generatePacket(): Promise<void> {
    if (!this.pdfBytes) {
      await this.showToast('Please select or create a PDF first', 'warning');
      return;
    }

    if (this.signers.length === 0) {
      await this.showToast('Add at least one signer to create the packet', 'warning');
      return;
    }

    this.isLoadingDoc = true;
    this.cdr.markForCheck();

    try {
      await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      const { packetBytes } = await this.packetService.createPacket(
        this.pdfBytes,
        this.packetTitle,
        this.signers,
        this.workflowMode
      );

      this.pdfBytes = packetBytes;
      this.statusReport = await this.packetService.inspectPacket(packetBytes);
      this.activeMode = 'signer';
      this.activeSignerId = this.statusReport.currentSigner?.id || this.signers[0]?.id || null;
      this.initSignerFieldData();

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.showToast('Signing packet generated successfully!', 'success');
    } catch (err: any) {
      console.error('Error generating packet:', err);
      await this.showToast(err?.message || 'Failed to generate packet', 'danger');
    } finally {
      this.isLoadingDoc = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Signer Execution Operations
  // ==========================================

  getActiveSigner(): PacketSigner | null {
    if (!this.statusReport?.manifest) return null;
    return this.statusReport.manifest.signers.find(s => s.id === this.activeSignerId) || null;
  }

  selectActiveSigner(signerId: string): void {
    this.activeSignerId = signerId;
    this.initSignerFieldData();
    this.cdr.markForCheck();
  }

  canCurrentSignerSign(): boolean {
    if (!this.statusReport || this.statusReport.isTampered) return false;
    const signer = this.getActiveSigner();
    if (!signer || signer.status === 'signed') return false;

    if (this.workflowMode === 'sequential') {
      return this.statusReport.currentSigner?.id === signer.id;
    }
    return true;
  }

  openSignaturePad(fieldId: string): void {
    this.activeSigningFieldId = fieldId;
    this.showSignaturePad = true;
    this.cdr.markForCheck();
    setTimeout(() => this.initSignatureCanvas(), 50);
  }

  private initSignatureCanvas(): void {
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth || 340;
    canvas.height = canvas.offsetHeight || 160;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  startDrawing(event: TouchEvent | MouseEvent): void {
    this.isDrawing = true;
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in event ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
    const y = 'touches' in event ? event.touches[0].clientY - rect.top : event.clientY - rect.top;

    this.lastPoint = { x, y };
  }

  drawMove(event: TouchEvent | MouseEvent): void {
    if (!this.isDrawing || !this.lastPoint) return;
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in event ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
    const y = 'touches' in event ? event.touches[0].clientY - rect.top : event.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    this.lastPoint = { x, y };
    event.preventDefault();
  }

  endDrawing(): void {
    this.isDrawing = false;
    this.lastPoint = null;
  }

  clearSignatureCanvas(): void {
    this.initSignatureCanvas();
  }

  saveSignaturePad(): void {
    const canvas = this.sigCanvasRef?.nativeElement;
    if (!canvas || !this.activeSigningFieldId) return;

    const dataUrl = canvas.toDataURL('image/png');
    if (!this.fieldData[this.activeSigningFieldId]) {
      this.fieldData[this.activeSigningFieldId] = {
        fieldId: this.activeSigningFieldId
      };
    }

    const signer = this.getActiveSigner();
    this.fieldData[this.activeSigningFieldId].signatureDataUrl = dataUrl;
    this.fieldData[this.activeSigningFieldId].value = signer ? signer.name : 'Signed';

    this.showSignaturePad = false;
    this.activeSigningFieldId = null;
    this.cdr.markForCheck();
  }

  closeSignaturePad(): void {
    this.showSignaturePad = false;
    this.activeSigningFieldId = null;
    this.cdr.markForCheck();
  }

  async executeSignPass(): Promise<void> {
    if (!this.pdfBytes || !this.activeSignerId) return;

    const signer = this.getActiveSigner();
    if (!signer) return;

    this.isExecutingSign = true;
    this.cdr.markForCheck();

    try {
      await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});

      const { updatedPacketBytes } = await this.packetService.signAsSigner(
        this.pdfBytes,
        this.activeSignerId,
        this.fieldData
      );

      this.pdfBytes = updatedPacketBytes;
      this.statusReport = await this.packetService.inspectPacket(updatedPacketBytes);

      // Transition to next eligible signer or completed
      if (this.statusReport.currentSigner) {
        this.activeSignerId = this.statusReport.currentSigner.id;
        this.initSignerFieldData();
      }

      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.showToast(`Successfully signed by ${signer.name}!`, 'success');

      // Auto-trigger share sheet so user can send packet to next signer
      await this.shareCurrentPacket();
    } catch (err: any) {
      console.error('Error signing packet:', err);
      await this.showToast(err?.message || 'Failed to sign document', 'danger');
    } finally {
      this.isExecutingSign = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Distribution & Sharing
  // ==========================================

  async shareCurrentPacket(): Promise<void> {
    if (!this.pdfBytes) return;

    const file = new File([this.pdfBytes as any], this.fileName, {
      type: 'application/pdf'
    });

    try {
      const shared = await this.shareService.shareFile(file, `Signing Packet: ${this.packetTitle}`);
      if (!shared) {
        console.info('Share sheet dismissed by user');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message?.includes('canceled') || e?.message?.includes('dismissed')) {
        console.info('Share dismissed gracefully');
        return;
      }
      console.warn('Share dismissed or unavailable:', e);
    }
  }

  async downloadCurrentPacket(): Promise<void> {
    if (!this.pdfBytes) return;

    try {
      const blob = new Blob([this.pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName.endsWith('.pdf') ? this.fileName : `${this.fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await this.showToast('Downloaded signing packet', 'success');
    } catch {
      await this.showToast('Download failed', 'danger');
    }
  }

  navigateBack(): void {
    this.router.navigate(['/features/pdf']);
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
