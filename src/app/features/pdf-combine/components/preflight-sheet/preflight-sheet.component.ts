import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FieldCollisionResolution,
  MergePreflightReport,
  MergeResolution,
  SignatureResolution
} from '../../../../core/models/pdf-combine.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppModalComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

/**
 * The pre-merge report — C5.
 *
 * Shown only when there is something to say. A document with no form fields
 * and no signatures gives `clean: true` and the merge goes straight through
 * without this ever appearing.
 *
 * Both choices are deliberately explicit, with no default that quietly does
 * something destructive: field collisions offer rename (keeps every value),
 * flatten (keeps the look, drops the editing) or cancel, and a signature
 * offers strip-then-merge or cancel. There is no "merge anyway" that leaves
 * two fields sharing a name or a signature that no longer verifies, because
 * both of those produce a document that looks right and is not.
 */
@Component({
  selector: 'app-preflight-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AppIconComponent, AppButtonComponent, AppModalComponent, TranslatePipe],
  templateUrl: './preflight-sheet.component.html',
  styleUrls: ['./preflight-sheet.component.scss']
})
export class PreflightSheetComponent {
  @Input() isOpen = false;
  @Input() report: MergePreflightReport | null = null;
  @Input({ required: true }) resolution!: MergeResolution;
  @Input() busy = false;

  @Output() resolutionChange = new EventEmitter<MergeResolution>();
  @Output() proceed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  readonly fieldChoices: Array<{
    value: FieldCollisionResolution;
    labelKey: string;
    descKey: string;
    icon: string;
  }> = [
    {
      value: 'rename',
      labelKey: 'combine.fieldsRename',
      descKey: 'combine.fieldsRenameDesc',
      icon: 'create'
    },
    {
      value: 'flatten',
      labelKey: 'combine.fieldsFlatten',
      descKey: 'combine.fieldsFlattenDesc',
      icon: 'layers'
    }
  ];

  readonly signatureChoices: Array<{
    value: SignatureResolution;
    labelKey: string;
    descKey: string;
    icon: string;
  }> = [
    {
      value: 'strip',
      labelKey: 'combine.signaturesStrip',
      descKey: 'combine.signaturesStripDesc',
      icon: 'trash'
    }
  ];

  get hasCollisions(): boolean {
    return (this.report?.collisions.length ?? 0) > 0;
  }

  get hasSignatures(): boolean {
    return (this.report?.signatures.length ?? 0) > 0;
  }

  setFields(value: FieldCollisionResolution): void {
    this.resolutionChange.emit({ ...this.resolution, fields: value });
  }

  setSignatures(value: SignatureResolution): void {
    this.resolutionChange.emit({ ...this.resolution, signatures: value });
  }

  /** The first few source names a collision spans, for the row summary. */
  collisionSources(index: number): string {
    const collision = this.report?.collisions[index];
    if (!collision) return '';
    return collision.sourceNames.slice(0, 3).join(', ');
  }
}
