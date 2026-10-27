import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfImageToolsService } from '../../../../core/services/pdf-image-tools.service';
import { FileService } from '../../../../core/services/file.service';
import {
  ImageToolAction,
  PageImageRef
} from '../../../../core/models/editor-features.types';

/**
 * K4 — tools for the pictures already on the page.
 *
 * Inserting an image was already possible. This is the other half: finding
 * what the document already has, and replacing, cropping or covering it.
 *
 * Replace is the only one of the three that is not a cover, and the UI does
 * not pretend otherwise — the sheet opens with the notice, and "Cover over"
 * is called that rather than "Delete", because the image data stays in the
 * file either way.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-image-tools-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-image-tools-modal.component.html',
  styleUrls: ['./pdf-image-tools-modal.component.scss']
})
export class PdfImageToolsModalComponent implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  private imageTools = inject(PdfImageToolsService);
  private fileService = inject(FileService);
  private modalCtrl = inject(ModalController);

  images: PageImageRef[] = [];
  selected: PageImageRef | null = null;
  action: ImageToolAction = 'replace';
  coverColor = '#FFFFFF';

  /** Percentages trimmed off each edge; the middle is what is kept. */
  crop = { left: 10, top: 10, right: 10, bottom: 10 };

  isScanning = false;
  isBusy = false;
  notice: { text: string; variant: 'ok' | 'warn' | 'danger' } | null = null;

  private subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(this.state.currentPage$.subscribe(() => void this.scanPage()));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  async scanPage(): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    this.isScanning = true;
    this.selected = null;

    try {
      this.images = await this.imageTools.findPageImages(
        new Uint8Array(doc.arrayBuffer),
        this.state.currentPageNumber
      );
    } catch (error) {
      console.error('Looking for page pictures failed', error);
      this.images = [];
    } finally {
      this.isScanning = false;
    }
  }

  select(image: PageImageRef): void {
    this.selected = image;
    this.notice = null;
  }

  round(value: number): number {
    return Math.round(value);
  }

  async apply(): Promise<void> {
    const target = this.selected;
    const doc = this.state.document;
    if (!target || !doc) return;

    this.isBusy = true;
    this.notice = null;

    try {
      const replacementBytes =
        this.action === 'replace' ? await this.pickReplacement() : undefined;

      /* A cancelled picker is not a failure; nothing has happened yet. */
      if (this.action === 'replace' && !replacementBytes) return;

      const result = await this.imageTools.applyImageEdit(new Uint8Array(doc.arrayBuffer), {
        action: this.action,
        target,
        replacementBytes,
        region: this.action === 'crop' ? this.cropRegion() : undefined,
        coverColor: this.coverColor
      });

      await this.state.replaceSourceBytes(result.pdfBytes, `Picture: ${this.action}`);

      this.notice = {
        text: result.message,
        variant: result.coveredRatherThanRemoved ? 'warn' : 'ok'
      };

      await this.scanPage();
    } catch (error) {
      console.error('The picture edit failed', error);
      this.notice = {
        text: error instanceof Error ? error.message : String(error),
        variant: 'danger'
      };
    } finally {
      this.isBusy = false;
    }
  }

  /** The kept area, as fractions of the picture's own rectangle. */
  private cropRegion(): { left: number; top: number; right: number; bottom: number } {
    const clamp = (value: number) => Math.min(45, Math.max(0, Number(value) || 0)) / 100;
    return {
      left: clamp(this.crop.left),
      top: clamp(this.crop.top),
      right: 1 - clamp(this.crop.right),
      bottom: 1 - clamp(this.crop.bottom)
    };
  }

  private async pickReplacement(): Promise<Uint8Array | undefined> {
    const file = await this.fileService.pickImageFile();
    if (!file) return undefined;
    return new Uint8Array(await file.arrayBuffer());
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
