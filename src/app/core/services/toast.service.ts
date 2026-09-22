import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts: ToastMessage[] = [];
  public toasts$ = new BehaviorSubject<ToastMessage[]>([]);

  show(type: ToastType, message: string, title?: string, duration: number = 3500): string {
    // Avoid spamming exact same message within 2 seconds
    const existing = this.toasts.find(t => t.message === message && Date.now() - t.timestamp < 2000);
    if (existing) {
      return existing.id;
    }

    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      duration,
      timestamp: Date.now()
    };

    // Keep at most 4 toasts visible at once
    this.toasts = [...this.toasts.slice(-3), newToast];
    this.toasts$.next(this.toasts);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  success(message: string, title?: string, duration?: number): string {
    return this.show('success', message, title || 'Success', duration);
  }

  warning(message: string, title?: string, duration?: number): string {
    return this.show('warning', message, title || 'Warning', duration);
  }

  error(message: string, title?: string, duration?: number): string {
    return this.show('error', message, title || 'Error', duration || 4500);
  }

  info(message: string, title?: string, duration?: number): string {
    return this.show('info', message, title || 'Info', duration);
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.toasts$.next(this.toasts);
  }

  clear(): void {
    this.toasts = [];
    this.toasts$.next([]);
  }
}
