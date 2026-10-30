import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { DocumentClassifierService } from '../../core/services/document-classifier.service';
import { ToastService } from '../../core/services/toast.service';
import {
  DocumentOrganizationProposal,
  GenericDocumentCategory,
  OrganizationAppliedResult
} from '../../core/models/document-classifier.types';

@Component({
  selector: 'app-auto-organize',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './auto-organize.page.html',
  styleUrls: ['./auto-organize.page.scss']
})
export class AutoOrganizePage implements OnInit {
  classifierService = inject(DocumentClassifierService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  proposals: DocumentOrganizationProposal[] = [];
  isLoading = false;
  isApplying = false;
  appliedResults: OrganizationAppliedResult[] = [];

  // Swipe gesture tracking
  private touchStartX = 0;
  private touchStartY = 0;

  // Inline new tag inputs
  newTagInputs: Record<string, string> = {};

  trackById(_index: number, proposal: DocumentOrganizationProposal): string {
    return proposal.id;
  }

  get approvedCount(): number {
    return this.proposals.filter(p => p.approvalStatus === 'approved').length;
  }

  get pendingCount(): number {
    return this.proposals.filter(p => p.approvalStatus === 'pending').length;
  }

  async ngOnInit(): Promise<void> {
    await this.scanVault();
  }

  async scanVault(): Promise<void> {
    this.isLoading = true;
    try {
      this.proposals = await this.classifierService.scanHistoryVault();
    } catch (err: any) {
      this.toast.error('Failed to scan vault: ' + (err?.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    this.isLoading = true;
    try {
      const files = Array.from(input.files);
      const newProposals = await this.classifierService.proposeBatchFromFiles(files);
      this.proposals = [...newProposals, ...this.proposals];
    } catch (err: any) {
      this.toast.error('Failed to ingest files: ' + (err?.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  approve(proposal: DocumentOrganizationProposal): void {
    proposal.approvalStatus = 'approved';
    this.cdr.markForCheck();
  }

  reject(proposal: DocumentOrganizationProposal): void {
    proposal.approvalStatus = 'rejected';
    this.cdr.markForCheck();
  }

  approveAll(): void {
    for (const p of this.proposals) {
      p.approvalStatus = 'approved';
    }
    this.cdr.markForCheck();
  }

  rejectAll(): void {
    for (const p of this.proposals) {
      p.approvalStatus = 'rejected';
    }
    this.cdr.markForCheck();
  }

  removeTag(proposal: DocumentOrganizationProposal, tagIndex: number): void {
    proposal.tags.splice(tagIndex, 1);
    this.cdr.markForCheck();
  }

  addTag(proposal: DocumentOrganizationProposal): void {
    const text = (this.newTagInputs[proposal.id] || '').trim().replace(/[<>]/g, '');
    if (!text) return;
    if (!proposal.tags.includes(text)) {
      proposal.tags.push(text);
    }
    this.newTagInputs[proposal.id] = '';
    this.cdr.markForCheck();
  }

  onTouchStart(event: TouchEvent): void {
    const target = event.target as HTMLElement;
    if (target?.closest('input, button, label')) {
      this.touchStartX = 0;
      this.touchStartY = 0;
      return;
    }
    if (event.touches.length > 0) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  }

  onTouchEnd(event: TouchEvent, proposal: DocumentOrganizationProposal): void {
    if (this.touchStartX === 0 || event.changedTouches.length === 0) return;
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const deltaY = event.changedTouches[0].clientY - this.touchStartY;

    // Check if horizontal swipe is dominant (minimum 50px delta)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        this.approve(proposal);
      } else {
        this.reject(proposal);
      }
    }
    this.touchStartX = 0;
    this.touchStartY = 0;
  }

  async applyOrganization(): Promise<void> {
    if (this.approvedCount === 0) {
      this.toast.warning('Please approve at least one proposal before applying changes');
      return;
    }

    this.isApplying = true;
    try {
      this.appliedResults = await this.classifierService.applyBatchOrganization(this.proposals);
      const renamedCount = this.appliedResults.filter(r => r.status === 'renamed').length;

      for (const res of this.appliedResults) {
        const match = this.proposals.find(p => p.id === res.id);
        if (match && res.status === 'renamed') {
          (match as any).isApplied = true;
        }
      }

      this.toast.success(`Successfully organized ${renamedCount} document(s)`);
    } catch (err: any) {
      this.toast.error('Failed to apply organization: ' + (err?.message || 'Unknown error'));
    } finally {
      this.isApplying = false;
      this.cdr.markForCheck();
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return Math.round(bytes / 1024) + ' KB';
  }

  getCategoryColor(category: GenericDocumentCategory): string {
    switch (category) {
      case 'Receipt': return '#10b981';
      case 'Invoice': return '#3b82f6';
      case 'Utility Bill': return '#f59e0b';
      case 'ID Document': return '#8b5cf6';
      case 'Certificate': return '#ec4899';
      case 'Official Letter': return '#6366f1';
      case 'Financial Statement': return '#06b6d4';
      case 'Contract': return '#e11d48';
      case 'Notes': return '#84cc16';
      default: return '#64748b';
    }
  }
}
