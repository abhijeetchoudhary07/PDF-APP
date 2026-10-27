import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  ReadAloudSentence,
  ReadAloudState,
  ReadAloudVoice
} from '../models/reader-features.types';

@Injectable({
  providedIn: 'root'
})
export class PdfReadAloudService {
  private ngZone: NgZone | null = null;

  constructor() {
    try {
      this.ngZone = inject(NgZone);
    } catch {
      this.ngZone = null;
    }
    this.watchVoices();
  }

  private runInZone(fn: () => void): void {
    if (this.ngZone) {
      this.ngZone.run(fn);
    } else {
      fn();
    }
  }

  private stateSubject = new BehaviorSubject<ReadAloudState>({
    isPlaying: false,
    isPaused: false,
    currentSentence: '',
    currentSentenceIndex: -1,
    currentPageNumber: 1,
    voiceName: undefined,
    rate: 1.0
  });

  public readonly state$: Observable<ReadAloudState> = this.stateSubject.asObservable();
  private sentenceChangeSubject = new Subject<ReadAloudSentence>();
  public readonly sentenceChange$: Observable<ReadAloudSentence> = this.sentenceChangeSubject.asObservable();

  /*
   * Platform voices arrive asynchronously on Chrome and on Android WebView:
   * `getVoices()` returns [] on the first call and fills in later, announced
   * by `voiceschanged`. The reader hides read-aloud when there are no voices,
   * so without this subject the control would be hidden on every cold start
   * and only appear if something else happened to re-render.
   */
  private voicesSubject = new BehaviorSubject<ReadAloudVoice[]>([]);
  public readonly voices$: Observable<ReadAloudVoice[]> = this.voicesSubject.asObservable();

  private sentences: ReadAloudSentence[] = [];
  private currentIdx = -1;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private onPageCompleteCallback?: (nextPageNumber: number) => void;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  getVoices(): SpeechSynthesisVoice[] {
    if (!this.isAvailable()) return [];
    try {
      return window.speechSynthesis.getVoices() || [];
    } catch {
      return [];
    }
  }

  hasVoices(): boolean {
    if (!this.isAvailable()) return false;
    return this.getVoices().length > 0;
  }

  /** L5 — the platform's voices, flattened for the picker. */
  listVoices(): ReadAloudVoice[] {
    return this.getVoices().map(v => ({
      name: v.name,
      lang: v.lang,
      isDefault: !!v.default,
      isLocal: !!v.localService
    }));
  }

  /**
   * Publishes the voice list now and again whenever the platform revises it.
   *
   * Polled as well as event-driven: some Android WebView builds fill the list
   * without ever firing `voiceschanged`, and a few fire it before the list is
   * populated. The poll stops as soon as voices appear, or after ~5s, so an
   * engine with genuinely no voices does not leave a timer running.
   */
  private watchVoices(): void {
    if (!this.isAvailable()) return;

    const publish = () => {
      const voices = this.listVoices();
      if (voices.length !== this.voicesSubject.value.length) {
        this.runInZone(() => this.voicesSubject.next(voices));
      }
      return voices.length > 0;
    };

    publish();

    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => publish());
    } catch {
      // Older engines expose only the onvoiceschanged property.
      try {
        (window.speechSynthesis as any).onvoiceschanged = () => publish();
      } catch {
        // Nothing more to try; the poll below is the remaining path.
      }
    }

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (publish() || attempts >= 10) {
        clearInterval(poll);
      }
    }, 500);
  }

  playPage(
    pageNumber: number,
    sentences: ReadAloudSentence[],
    onPageComplete?: (nextPageNumber: number) => void,
    voiceName?: string,
    rate: number = 1.0
  ): void {
    if (!this.isAvailable() || !sentences || sentences.length === 0) {
      this.stop();
      return;
    }

    this.stop();
    this.sentences = sentences;
    this.currentIdx = 0;
    this.onPageCompleteCallback = onPageComplete;

    this.stateSubject.next({
      isPlaying: true,
      isPaused: false,
      currentSentence: sentences[0].text,
      currentSentenceIndex: 0,
      currentPageNumber: pageNumber,
      voiceName: voiceName ?? this.stateSubject.value.voiceName,
      rate
    });

    this.speakCurrentSentence();
  }

  pause(): void {
    if (!this.isAvailable()) return;
    try {
      window.speechSynthesis.pause();
      this.stateSubject.next({
        ...this.stateSubject.value,
        isPaused: true,
        isPlaying: false
      });
    } catch {}
  }

  resume(): void {
    if (!this.isAvailable()) return;
    try {
      window.speechSynthesis.resume();
      this.stateSubject.next({
        ...this.stateSubject.value,
        isPaused: false,
        isPlaying: true
      });
    } catch {}
  }

  stop(): void {
    this.cancelSpeech();

    this.currentIdx = -1;
    this.sentences = [];
    this.onPageCompleteCallback = undefined;

    this.stateSubject.next({
      isPlaying: false,
      isPaused: false,
      currentSentence: '',
      currentSentenceIndex: -1,
      currentPageNumber: this.stateSubject.value.currentPageNumber,
      voiceName: this.stateSubject.value.voiceName,
      rate: this.stateSubject.value.rate
    });
  }

  /**
   * Silences the engine without touching playback state.
   *
   * The handlers come off the utterance BEFORE `cancel()`. `cancel()` fires
   * `onend` (and on some engines `onerror`) for the utterance it kills, and
   * the old code cancelled with handlers still attached: the dead utterance's
   * `onend` then ran the "advance to the next sentence" branch, so every rate
   * or voice change skipped a sentence, and a stop could re-enter the speak
   * loop it was trying to end.
   */
  private cancelSpeech(): void {
    if (this.currentUtterance) {
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }
    if (!this.isAvailable()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }

  setRate(rate: number): void {
    const currentState = this.stateSubject.value;
    const clamped = Math.max(0.5, Math.min(2.5, rate));
    this.stateSubject.next({ ...currentState, rate: clamped });
    if (currentState.isPlaying && !currentState.isPaused) {
      // Re-speak the current sentence at the new rate; the engine cannot
      // change the rate of an utterance already in flight.
      this.speakCurrentSentence();
    }
  }

  setVoice(voiceName: string): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, voiceName });
    if (currentState.isPlaying && !currentState.isPaused) {
      this.speakCurrentSentence();
    }
  }

  /** L5 — jump to the next sentence on this page without waiting it out. */
  nextSentence(): void {
    if (this.currentIdx < 0 || this.currentIdx >= this.sentences.length - 1) return;
    this.currentIdx++;
    this.announceCurrent();
    this.speakCurrentSentence();
  }

  /** L5 — step back one sentence. */
  previousSentence(): void {
    if (this.currentIdx <= 0) return;
    this.currentIdx--;
    this.announceCurrent();
    this.speakCurrentSentence();
  }

  private announceCurrent(): void {
    const sentence = this.sentences[this.currentIdx];
    if (!sentence) return;
    this.stateSubject.next({
      ...this.stateSubject.value,
      isPlaying: true,
      isPaused: false,
      currentSentence: sentence.text,
      currentSentenceIndex: this.currentIdx
    });
    this.sentenceChangeSubject.next(sentence);
  }

  private speakCurrentSentence(): void {
    if (!this.isAvailable() || this.currentIdx < 0 || this.currentIdx >= this.sentences.length) {
      this.handlePageComplete();
      return;
    }

    // Detaches handlers first, so the utterance being replaced cannot run the
    // advance branch below as it dies.
    this.cancelSpeech();

    const sentence = this.sentences[this.currentIdx];
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.rate = this.stateSubject.value.rate || 1.0;

    const voices = this.getVoices();
    if (this.stateSubject.value.voiceName) {
      const selected = voices.find(v => v.name === this.stateSubject.value.voiceName);
      if (selected) {
        utterance.voice = selected;
        utterance.lang = selected.lang;
      }
    }

    utterance.onend = () => {
      this.runInZone(() => {
        // A cancelled utterance has had its handlers removed, so reaching
        // here means this utterance really finished speaking.
        this.currentIdx++;
        if (this.currentIdx < this.sentences.length) {
          this.announceCurrent();
          this.speakCurrentSentence();
        } else {
          this.handlePageComplete();
        }
      });
    };

    utterance.onerror = (e) => {
      this.runInZone(() => {
        /*
         * `interrupted` and `canceled` are what the engine reports for a
         * deliberate stop, not a failure, and tearing playback down on them
         * would undo the pause the reader just asked for.
         */
        const reason = (e as any)?.error;
        if (reason === 'interrupted' || reason === 'canceled') return;
        console.warn('SpeechSynthesis error', reason || e);
        this.stop();
      });
    };

    this.currentUtterance = utterance;
    this.sentenceChangeSubject.next(sentence);

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('SpeechSynthesis speak failed', e);
      this.stop();
    }
  }

  private handlePageComplete(): void {
    const nextPage = this.stateSubject.value.currentPageNumber + 1;
    const callback = this.onPageCompleteCallback;
    if (callback) {
      callback(nextPage);
    } else {
      this.stop();
    }
  }
}
