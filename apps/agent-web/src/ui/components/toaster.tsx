import { useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type ToastVariant,
} from '../../lib/toast';

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-50 text-emerald-900',
  error: 'border-red-500/30 bg-red-50 text-red-900',
  info: 'border-border bg-background text-foreground',
};

const variantIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-100 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((item) => {
        const Icon = variantIcon[item.variant];
        return (
          <div
            key={item.id}
            role="alert"
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg',
              variantStyles[item.variant],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 wrap-break-word text-sm">{item.message}</span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismissToast(item.id)}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
