import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfLinkEditorService } from '../../../../core/services/pdf-link-editor.service';
import {
  LinkAuditReport,
  PdfHyperlink
} from '../../../../core/models/editor-features.types';
import { Rect } from '../../../../core/models/pdf-editor.types';

/**
 * K2 — the link sheet.
 *
 * It lists every link in the document, not only the ones added in this
 * session: the whole point of the panel is reviewing what a file already
 * contains, and the version this replaces showed an empty list for a
 * document full of links because it only ever read the editor's own model.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-link-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-link-modal.component.html',
  styleUrls: ['./pdf-link-modal.component.scss']
})
export class PdfLinkModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private linkEditor = inject(PdfLinkEditorService);
  private modalCtrl = inject(ModalController);

  linkType: 'url' | 'page' = 'url';
  url = '';
  targetPage = 1;
  errorKey: string | null = null;
  isLoading = false;

  /** A sensible default box, so adding without drawing still lands somewhere. */
  rect: Rect = { x: 48, y: 120, width: 180, height: 28 };

  report: LinkAuditReport = {
    totalLinks: 0,
    urlLinksCount: 0,
    pageLinksCount: 0,
    danglingLinksCount: 0,
    danglingLinks: [],
    links: []
  };

  get totalPages(): number {
    return this.state.document?.pageCount || 1;
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  /**
   * Reads the file's own links and merges in the ones added this session.
   *
   * Both halves are needed: links written into the file are only visible
   * through a read of it, and links added here are not in the file until
   * the document is exported.
   */
  async refresh(): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    this.isLoading = true;

    try {
      const fromFile = await this.linkEditor.extractLinks(doc);
      const fromSession = doc.pages
        .flatMap(page => page.links || [])
        .map(link => ({ ...link, origin: 'added' as const }));

      this.report = this.linkEditor.auditLinks(
        [...fromFile.links, ...fromSession],
        doc.pageCount
      );
    } catch (error) {
      console.error('Reading links failed', error);
    } finally {
      this.isLoading = false;
    }
  }

  labelFor(link: PdfHyperlink): string {
    if (link.type === 'url') return link.url || '';
    return link.targetPage ? `→ ${link.targetPage}` : link.label || '';
  }

  jumpTo(link: PdfHyperlink): void {
    this.state.setCurrentPage(link.pageNumber);
  }

  /** Validates the target and returns a link ready to be placed or added. */
  private buildDraft(): { type: 'url' | 'page'; url?: string; targetPage?: number; label: string } | null {
    this.errorKey = null;

    if (this.linkType === 'url') {
      const normalized = this.linkEditor.normalizeUrl(this.url);
      if (normalized.error === 'empty') {
        this.errorKey = 'editor.lnEmptyAddress';
        return null;
      }
      if (normalized.error === 'scheme') {
        this.errorKey = 'editor.lnBadScheme';
        return null;
      }
      /* Normalising back into the field shows what will actually be
       * written, rather than leaving someone to guess. */
      this.url = normalized.url;
      return { type: 'url', url: normalized.url, label: normalized.url };
    }

    const page = Math.round(Number(this.targetPage));
    if (!Number.isFinite(page) || page < 1 || page > this.totalPages) {
      this.errorKey = 'editor.lnBadTarget';
      return null;
    }

    return { type: 'page', targetPage: page, label: `→ ${page}` };
  }

  /** Adds the link at the rectangle in the number fields. */
  addLink(): void {
    const draft = this.buildDraft();
    if (!draft) return;

    this.state.addLink({
      pageNumber: this.state.currentPageNumber,
      rect: { ...this.rect },
      type: draft.type,
      url: draft.url,
      targetPage: draft.targetPage,
      label: draft.label,
      origin: 'added'
    });

    this.url = '';
    void this.refresh();
  }

  /** Hands the link to the canvas, where the rectangle is drawn by hand. */
  startDrawing(): void {
    const draft = this.buildDraft();
    if (!draft) return;

    this.state.startPlacement('link', draft);
    this.modalCtrl.dismiss({ placing: 'link' });
  }

  /**
   * Deletes a link.
   *
   * A session link is dropped from the model; one already in the file needs
   * the file rewritten, so the document's bytes are swapped. Both paths are
   * undoable.
   */
  async deleteLink(link: PdfHyperlink): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    if (link.origin === 'added') {
      this.state.setCurrentPage(link.pageNumber);
      this.state.deleteLink(link.id);
      await this.refresh();
      return;
    }

    this.isLoading = true;

    try {
      const result = await this.linkEditor.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [],
        remove: [link]
      });

      if (result.removed > 0) {
        await this.state.replaceSourceBytes(result.pdfBytes, 'Delete link');
      }
    } catch (error) {
      console.error('Deleting a link failed', error);
    } finally {
      this.isLoading = false;
    }

    await this.refresh();
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
