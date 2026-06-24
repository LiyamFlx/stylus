// Minimal toast system — no external dependencies
// Usage: toast.success('message') | toast.error('message') | toast.info('message')

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

type ToastListener = (toasts: Toast[]) => void;

class ToastManager {
  private toasts: Toast[] = [];
  private listeners: Set<ToastListener> = new Set();
  private idCounter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = [...this.toasts];
    this.listeners.forEach((l) => l(snapshot));
  }

  show(message: string, type: ToastType = 'info', duration = 3500): string {
    const id = `toast-${++this.idCounter}`;
    const toast: Toast = { id, message, type, duration };
    this.toasts = [...this.toasts, toast];
    this.notify();
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  success(message: string, duration?: number): string {
    return this.show(message, 'success', duration);
  }
  error(message: string, duration?: number): string {
    return this.show(message, 'error', duration ?? 5000);
  }
  info(message: string, duration?: number): string {
    return this.show(message, 'info', duration);
  }
  warning(message: string, duration?: number): string {
    return this.show(message, 'warning', duration);
  }
}

export const toast = new ToastManager();
