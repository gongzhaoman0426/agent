import vm from 'node:vm';

const MAX_TIMEOUT_MS = 30_000;

export interface SandboxResult {
  result?: unknown;
  logs: string[];
  error?: string;
}

/**
 * 在受限 vm 上下文中执行技能脚本。
 * 脚本通过全局 `input` 读取入参，把结果赋值给全局 `result`。
 * 不暴露 require / process / fs 等能力。
 */
export function executeInSandbox(
  code: string,
  input: Record<string, unknown> = {},
  timeoutMs = 10_000,
): SandboxResult {
  const logs: string[] = [];
  const format = (args: unknown[]) =>
    args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
      )
      .join(' ');

  const sandbox: Record<string, unknown> = {
    input,
    result: undefined,
    console: {
      log: (...args: unknown[]) => logs.push(format(args)),
      error: (...args: unknown[]) => logs.push(`[error] ${format(args)}`),
      warn: (...args: unknown[]) => logs.push(`[warn] ${format(args)}`),
    },
    JSON,
    Math,
    Date,
    Intl,
    String,
    Number,
    Boolean,
    Array,
    Object,
  };

  try {
    vm.runInNewContext(code, sandbox, {
      timeout: Math.min(timeoutMs, MAX_TIMEOUT_MS),
    });
    return { result: sandbox.result, logs };
  } catch (error) {
    return {
      logs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
