import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ReadAloudSentence, ReadAloudState } from '../models/reader-features.types';

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
      voiceName,
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
    if (!this.isAvailable()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}

    this.currentUtterance = null;
    this.currentIdx = -1;
    this.sentences = [];

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

  setRate(rate: number): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, rate });
    if (currentState.isPlaying && !currentState.isPaused) {
      // Re-trigger current sentence with updated rate
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

  private speakCurrentSentence(): void {
    if (!this.isAvailable() || this.currentIdx < 0 || this.currentIdx >= this.sentences.length) {
      this.handlePageComplete();
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {}

    const sentence = this.sentences[this.currentIdx];
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.rate = this.stateSubject.value.rate || 1.0;

    const voices = this.getVoices();
    if (this.stateSubject.value.voiceName) {
      const selected = voices.find(v => v.name === this.stateSubject.value.voiceName);
      if (selected) utterance.voice = selected;
    }

    utterance.onend = () => {
      this.runInZone(() => {
        this.currentIdx++;
        if (this.currentIdx < this.sentences.length) {
          const nextSentence = this.sentences[this.currentIdx];
          this.stateSubject.next({
            ...this.stateSubject.value,
            currentSentence: nextSentence.text,
            currentSentenceIndex: this.currentIdx
          });
          this.sentenceChangeSubject.next(nextSentence);
          this.speakCurrentSentence();
        } else {
          this.handlePageComplete();
        }
      });
    };

    utterance.onerror = (e) => {
      this.runInZone(() => {
        console.warn('SpeechSynthesis error', e);
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
    if (this.onPageCompleteCallback) {
      this.onPageCompleteCallback(nextPage);
    } else {
      this.stop();
    }
  }
}
