import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../services/translation.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  /*
   * `TranslationService` is `providedIn: 'root'`, so this always resolves.
   *
   * This used to be an `@Optional()` constructor parameter with a
   * `|| new TranslationService()` fallback, which existed only so that
   * `i18n.spec.ts` could do `new TranslatePipe(service)` outside DI. That
   * fallback was a second, unshared instance of a service whose whole job is
   * to hold one piece of shared state — the selected language — so a pipe that
   * ever took it would have rendered the wrong language and never updated.
   * The spec goes through TestBed now and the fallback is gone.
   */
  private readonly translationService = inject(TranslationService);

  transform(key: string, params?: Record<string, any>): string {
    return this.translationService.translate(key, params);
  }
}
