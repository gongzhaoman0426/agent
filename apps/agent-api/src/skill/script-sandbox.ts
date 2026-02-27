import { createContext, runInNewContext } from 'vm';

export interface SandboxResult {
  result: any;
  logs: string[];
  error?: string;
}

export function executeInSandbox(
  code: string,
  input: string = '',
  timeout: number = 5000,
): SandboxResult {
  const logs: string[] = [];

  const sandbox = {
    input,
    result: undefined,
    console: {
      log: (...args: any[]) => {
        logs.push(args.map(a => String(a)).join(' '));
      },
    },
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    String,
    Number,
    Array,
    Object,
    Boolean,
  };

  try {
    const context = createContext(sandbox);
    runInNewContext(code, context, {
      timeout: Math.min(timeout, 30000), // 最大 30 秒
      displayErrors: true,
    });

    return {
      result: sandbox.result,
      logs,
    };
  } catch (error) {
    return {
      result: undefined,
      logs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
