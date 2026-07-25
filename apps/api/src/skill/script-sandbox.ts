import vm from 'node:vm';

const MAX_TIMEOUT_MS = 30_000;

export interface SandboxResult {
  result?: unknown;
  logs: string[];
  error?: string;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * 在受限 vm 上下文中执行技能脚本，不暴露 require / process / fs 等能力。
 *
 * 入参通过全局 `input` 提供，返回值支持三种写法（按优先级）：
 * 1. `module.exports = fn` —— 用 input 调用该函数，取其返回值（Node 习惯写法）
 * 2. 给全局 `result` 赋值
 * 3. 脚本最后一个表达式的值
 */
export async function executeInSandbox(
  code: string,
  input: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<SandboxResult> {
  const logs: string[] = [];
  const format = (args: unknown[]) =>
    args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
      )
      .join(' ');

  const moduleShim: { exports: unknown } = { exports: {} };
  const sandbox: Record<string, unknown> = {
    input,
    result: undefined,
    module: moduleShim,
    exports: moduleShim.exports,
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

  const timeout = Math.min(timeoutMs, MAX_TIMEOUT_MS);

  try {
    const completion: unknown = vm.runInNewContext(code, sandbox, { timeout });

    const exported = moduleShim.exports;
    let output: unknown;
    if (typeof exported === 'function') {
      output = (exported as (arg: Record<string, unknown>) => unknown)(input);
    } else if (sandbox.result !== undefined) {
      output = sandbox.result;
    } else {
      output = completion;
    }

    // vm 的 timeout 只覆盖同步执行，异步结果单独兜底，避免请求被挂死
    if (isThenable(output)) {
      output = await Promise.race([
        output,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('脚本执行超时')), timeout),
        ),
      ]);
    }

    return { result: output, logs };
  } catch (error) {
    return {
      logs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
