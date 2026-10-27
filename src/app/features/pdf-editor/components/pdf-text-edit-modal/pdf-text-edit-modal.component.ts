import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfTextEditorService } from '../../../../core/services/pdf-text-editor.service';
import { ExistingTextRun } from '../../../../core/models/editor-features.types';

interface ResultNotice {
  key: string;
  variant: 'ok' | 'warn' | 'danger';
  params: Record<string, string | number>;
}

/**
 * K6 — the edit-existing-text sheet.
 *
 * This screen's job is as much explaining as editing. The edit itself is a
 * cover-and-redraw, because pdf-lib cannot add a glyph to the subset font a
 * document embedded — so the header says that plainly, each line says which
 * font it will be redrawn in, and the result afterwards says whether the
 * font was swapped, whether any characters could not be drawn, and whether
 * the original wording is still reachable by a search.
 *
 * The version this replaces reported `usedFallbackWhiteout: false` while
 * covering and redrawing every time.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-text-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-text-edit-modal.component.html',
  styleUrls: ['./pdf-text-edit-modal.component.scss']
})
export class PdfTextEditModalComponent implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  private textEditor = inject(PdfTextEditorService);
  private modalCtrl = inject(ModalController);

  textRuns: ExistingTextRun[] = [];
  selectedRun: ExistingTextRun | null = null;
  editedText = '';
  isScanning = false;
  isApplying = false;
  resultNotices: ResultNotice[] = [];

  private subs = new Subscription();

  async ngOnInit(): Promise<void> {
    /* Turning the page while the sheet is open rescans it, so the list is
     * always the page behind the sheet rather than whichever page was
     * showing when it opened. */
    this.subs.add(this.state.currentPage$.subscribe(() => void this.scanPage()));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  async scanPage(): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    this.isScanning = true;
    this.clearSelection();

    try {
      this.textRuns = await this.textEditor.extractTextRuns(
        doc.arrayBuffer,
        this.state.currentPageNumber
      );
    } catch (error) {
      console.error('Reading the page text failed', error);
      this.textRuns = [];
    } finally {
      this.isScanning = false;
    }
  }

  selectRun(run: ExistingTextRun): void {
    this.selectedRun = run;
    this.editedText = run.text;
    this.resultNotices = [];
  }

  clearSelection(): void {
    this.selectedRun = null;
    this.editedText = '';
  }

  /** Whether the redraw will use a stand-in rather than the run's own face. */
  get willSubstituteFont(): boolean {
    if (!this.selectedRun) return false;
    return !this.textEditor.canEmbedDirectly(this.selectedRun.fontName, this.editedText);
  }

  /**
   * Applies the edit to the file and swaps the editor's bytes for the result.
   *
   * The command is also recorded on the page model, so the export pipeline
   * knows this page carries an in-place edit, and so undo has something to
   * describe.
   */
  async applyEdit(): Promise<void> {
    const run = this.selectedRun;
    const doc = this.state.document;
    if (!run || !doc) return;

    this.isApplying = true;
    this.resultNotices = [];

    try {
      const result = await this.textEditor.applyTextEdit(new Uint8Array(doc.arrayBuffer), {
        runId: run.id,
        pageNumber: run.pageNumber,
        originalText: run.text,
        newText: this.editedText,
        bounds: { x: run.x, y: run.y, width: run.width, height: run.height },
        baselineY: run.baselineY,
        fontSize: run.fontSize,
        fontFamily: run.fontFamily,
        colorHex: run.colorHex,
        fallbackWhiteoutApplied: true
      });

      if (!result.success || !result.updatedPdfBytes) return;

      await this.state.replaceSourceBytes(result.updatedPdfBytes, 'Edit page text');

      const notices: ResultNotice[] = [
        { key: 'editor.etApplied', variant: 'ok', params: {} }
      ];

      if (this.willSubstituteFont) {
        notices.push({
          key: 'editor.etSubstituted',
          variant: 'warn',
          params: { font: run.fontFamily }
        });
      }

      if (result.droppedCharacters > 0) {
        notices.push({
          key: 'editor.frDroppedChars',
          variant: 'warn',
          params: { count: result.droppedCharacters, sample: result.droppedSample }
        });
      }

      if (!result.originalTextRemoved) {
        notices.push({
          key: 'editor.frStillSearchable',
          variant: 'danger',
          params: { count: 1 }
        });
      }

      this.resultNotices = notices;
      await this.scanPage();
    } catch (error) {
      console.error('Applying the text edit failed', error);
      this.resultNotices = [
        {
          key: 'editor.kFailed',
          variant: 'danger',
          params: { reason: error instanceof Error ? error.message : String(error) }
        }
      ];
    } finally {
      this.isApplying = false;
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
