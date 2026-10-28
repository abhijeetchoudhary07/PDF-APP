import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfFindReplaceService } from '../../../../core/services/pdf-find-replace.service';
import {
  FindMatch,
  FindReplaceOptions,
  FindReplaceResult
} from '../../../../core/models/editor-features.types';

/** How much of the surrounding run is shown either side of a hit. */
const CONTEXT_CHARS = 28;

/**
 * K1 — the find & replace sheet.
 *
 * The thing this screen has to get right is telling the truth about what a
 * replacement did. Three kinds of text live in a PDF and only two of them
 * can be edited cleanly; the third is covered over and redrawn. So the
 * result panel reports four separate numbers — replaced, left alone,
 * redrawn, and still reachable by a search — rather than one cheerful
 * "done". The version this replaces counted every hit as replaced and
 * changed nothing in the file at all.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-find-replace-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-find-replace-modal.component.html',
  styleUrls: ['./pdf-find-replace-modal.component.scss']
})
export class PdfFindReplaceModalComponent {
  state = inject(PdfEditorStateService);
  private findReplace = inject(PdfFindReplaceService);
  private modalCtrl = inject(ModalController);

  searchQuery = '';
  replacement = '';

  options: FindReplaceOptions = {
    caseSensitive: false,
    wholeWord: false,
    includeFormFields: true,
    replaceExistingPageText: false
  };

  matches: FindMatch[] = [];
  activeMatchId: string | null = null;
  isSearching = false;
  isReplacing = false;
  searchPerformed = false;
  report: FindReplaceResult | null = null;

  // ── Searching ──────────────────────────────────────────────────────

  async runSearch(): Promise<void> {
    const doc = this.state.document;
    if (!doc || !this.searchQuery.trim()) return;

    this.isSearching = true;
    this.searchPerformed = true;
    this.matches = [];

    try {
      this.matches = await this.findReplace.findMatches(doc, this.searchQuery, this.options);
      if (this.matches.length > 0) this.jumpTo(this.matches[0]);
    } catch (error) {
      console.error('Find failed', error);
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * A changed option invalidates the hits on screen.
   *
   * Turning on "match case" with the old list still showing would leave
   * someone replacing matches the current options would not have found.
   */
  optionsChanged(): void {
    if (!this.searchPerformed) return;
    this.matches = [];
    this.activeMatchId = null;
    this.report = null;
    this.searchPerformed = false;
  }

  jumpTo(match: FindMatch): void {
    this.activeMatchId = match.id;
    this.state.setCurrentPage(match.pageNumber);
  }

  // ── Replacing ──────────────────────────────────────────────────────

  async replaceAll(): Promise<void> {
    await this.applyReplacement(this.matches);
  }

  async replaceOne(match: FindMatch): Promise<void> {
    await this.applyReplacement([match]);
  }

  /**
   * Runs the replacement and puts the rewritten file back into the editor.
   *
   * Putting the bytes back is the step that was missing: form field values
   * and page text live in the file, not in the overlay model, so a result
   * whose `updatedPdfBytes` is dropped on the floor is a replacement that
   * never happened.
   */
  private async applyReplacement(targets: FindMatch[]): Promise<void> {
    const doc = this.state.document;
    if (!doc || targets.length === 0) return;

    this.isReplacing = true;

    try {
      const result = await this.findReplace.replaceAll(
        doc,
        targets,
        this.replacement,
        this.options
      );

      this.report = result;

      if (result.updatedPdfBytes && result.matchesReplaced > 0) {
        await this.state.replaceSourceBytes(
          result.updatedPdfBytes,
          `Replace ${result.matchesReplaced} match${result.matchesReplaced === 1 ? '' : 'es'}`
        );
      }

      /* Re-run the search against the new bytes, so the list on screen is
       * what the document now contains rather than what it used to. */
      if (this.searchQuery.trim()) {
        this.matches = await this.findReplace.findMatches(
          this.state.document ?? doc,
          this.searchQuery,
          this.options
        );
        this.activeMatchId = null;
      }
    } catch (error) {
      console.error('Replace failed', error);
    } finally {
      this.isReplacing = false;
    }
  }

  // ── Match list presentation ────────────────────────────────────────

  sourceLabel(match: FindMatch): string {
    switch (match.source) {
      case 'form-field':
        return 'editor.frSourceField';
      case 'editor-element':
        return 'editor.frSourceOverlay';
      default:
        return 'editor.frSourcePageText';
    }
  }

  /** The run's text just before the hit, trimmed to a readable length. */
  beforeHit(match: FindMatch): string {
    const start = Math.max(0, match.offset - CONTEXT_CHARS);
    const prefix = start > 0 ? '…' : '';
    return prefix + match.text.slice(start, match.offset);
  }

  /** The run's text just after the hit. */
  afterHit(match: FindMatch): string {
    const end = match.offset + match.matchedText.length;
    const stop = Math.min(match.text.length, end + CONTEXT_CHARS);
    const suffix = stop < match.text.length ? '…' : '';
    return match.text.slice(end, stop) + suffix;
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
