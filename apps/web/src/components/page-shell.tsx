import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 管理页统一骨架：页头 + 内容区 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8 animate-rise">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-card/50 py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

const AVATAR_GRADIENTS = [
  'from-[oklch(0.55_0.18_275)] to-[oklch(0.65_0.16_320)]',
  'from-[oklch(0.6_0.16_220)] to-[oklch(0.62_0.17_270)]',
  'from-[oklch(0.62_0.15_160)] to-[oklch(0.66_0.14_210)]',
  'from-[oklch(0.68_0.15_65)] to-[oklch(0.62_0.18_25)]',
  'from-[oklch(0.58_0.19_5)] to-[oklch(0.6_0.19_320)]',
  'from-[oklch(0.55_0.16_255)] to-[oklch(0.6_0.15_180)]',
] as const;

/** 按名称哈希取固定渐变，作为实体头像底色 */
export function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function EntityAvatar({
  seed,
  icon,
  className,
}: {
  seed: string;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
        gradientFor(seed),
        className,
      )}
    >
      {icon}
    </div>
  );
}
