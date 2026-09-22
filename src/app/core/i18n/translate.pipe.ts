import { Pipe, PipeTransform, Inject, Optional } from '@angular/core';
import { TranslationService } from '../services/translation.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  private translationService: TranslationService;

  constructor(@Optional() @Inject(TranslationService) translationService?: TranslationService) {
    this.translationService = translationService || new TranslationService();
  }

  transform(key: string, params?: Record<string, any>): string {
    return this.translationService.translate(key, params);
  }
}


