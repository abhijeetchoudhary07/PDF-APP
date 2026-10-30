import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  PasswordEvaluationService,
  PasswordEvaluationResult
} from '../../../core/services/password-evaluation.service';
import { AppIconComponent } from '../ui/icon/icon.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-password-strength-meter',
  standalone: true,
  imports: [CommonModule, AppIconComponent, TranslatePipe],
  templateUrl: './password-strength-meter.component.html',
  styleUrls: ['./password-strength-meter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordStrengthMeterComponent implements OnChanges, OnDestroy {
  private evaluationService = inject(PasswordEvaluationService);
  private cdr = inject(ChangeDetectorRef);

  @Input() password = '';
  @Input() ownerPassword = '';
  @Input() showPassphraseGenerator = true;
  @Input() showEducationalTips = true;
  @Input() showCriteriaChecklist = true;
  @Input() showFallbackWarning = true;

  @Output() passphraseGenerated = new EventEmitter<string>();
  @Output() passwordChange = new EventEmitter<string>();

  evaluation: PasswordEvaluationResult = this.evaluationService.evaluate('');
  isOwnerFallback = false;
  isEducationalExpanded = false;
  lastCopiedPassphrase = '';
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['password']) {
      this.evaluation = this.evaluationService.evaluate(this.password || '');
    }

    if (changes['password'] || changes['ownerPassword']) {
      this.isOwnerFallback = this.evaluationService.isOwnerPasswordFallback(
        this.password,
        this.ownerPassword
      );
    }
  }

  ngOnDestroy(): void {
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
    this.lastCopiedPassphrase = '';
    this.password = '';
  }

  getSegmentClass(minScore: number): string {
    if (this.evaluation && this.evaluation.score >= minScore) {
      return `active fill-${this.evaluation.level}`;
    }
    return '';
  }

  /**
   * Generates a 4-word secure memorable passphrase, triggers haptic feedback,
   * copies to the user's clipboard, and emits the generated value.
   */
  async generateStrongPassphrase(): Promise<void> {
    const passphrase = this.evaluationService.generatePassphrase(4, '-');

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics unavailable on web browsers without crashing
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(passphrase);
      } catch {
        // Fallback or permission blocked
      }
    }

    this.password = passphrase;
    this.evaluation = this.evaluationService.evaluate(passphrase);
    this.isOwnerFallback = this.evaluationService.isOwnerPasswordFallback(
      this.password,
      this.ownerPassword
    );

    this.passwordChange.emit(passphrase);
    this.passphraseGenerated.emit(passphrase);

    this.lastCopiedPassphrase = passphrase;
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.lastCopiedPassphrase = '';
      this.cdr.markForCheck();
    }, 3500);

    this.cdr.markForCheck();
  }
}
