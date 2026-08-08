import type { PadDto } from './types.js';
import { getPadBaseUrl } from './config.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export class PadApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'PadApiError';
  }
}

export async function padRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    key?: string;
    body?: unknown;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  },
): Promise<T> {
  const base = getPadBaseUrl();
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  if (options?.key) {
    url.searchParams.set('key', options.key);
  }

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:
      method === 'POST' && options?.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    signal:
      options?.abortSignal ??
      AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new PadApiError(
      `v875 HTTP ${response.status}: ${path}`,
      response.status,
    );
  }

  const dto = (await response.json()) as PadDto<T>;
  if (dto.Code !== 200) {
    throw new PadApiError(
      dto.Text?.trim() || `v875 业务错误 Code=${dto.Code}`,
      dto.Code,
      dto.Data,
    );
  }
  return dto.Data;
}
