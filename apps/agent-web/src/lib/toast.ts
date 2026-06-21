export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function addToast(message: string, variant: ToastVariant, duration: number) {
  // 去重：相同内容的提示已存在时不重复弹出（避免多个请求同时失败刷屏）
  const existing = toasts.find((t) => t.message === message && t.variant === variant);
  if (existing) return existing.id;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toasts = [...toasts, { id, message, variant }];
  emit();
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export const toast = {
  success: (message: string, duration = 4000) => addToast(message, 'success', duration),
  error: (message: string, duration = 6000) => addToast(message, 'error', duration),
  info: (message: string, duration = 4000) => addToast(message, 'info', duration),
};
