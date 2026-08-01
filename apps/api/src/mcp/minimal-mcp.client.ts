const DEFAULT_TIMEOUT_MS = 15_000;

export interface MinimalMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class MinimalMcpError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'MinimalMcpError';
  }
}

/**
 * 兼容 minimal HTTP MCP：POST JSON-RPC
 * methods: initialize | tools/list | tools/call
 */
export class MinimalMcpClient {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agent-next', version: '0.1.0' },
    });
  }

  async listTools(): Promise<MinimalMcpTool[]> {
    const result = (await this.request('tools/list', {})) as {
      tools?: MinimalMcpTool[];
    };
    const tools = result?.tools;
    if (!Array.isArray(tools)) {
      throw new MinimalMcpError('tools/list 未返回 tools 数组', 'E_PROTOCOL');
    }
    return tools.filter(
      (tool): tool is MinimalMcpTool =>
        !!tool && typeof tool.name === 'string' && tool.name.length > 0,
    );
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const result = (await this.request('tools/call', {
      name,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };

    const textParts = (result?.content ?? [])
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string);

    let payload: unknown = textParts.length === 1 ? textParts[0] : textParts;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // 非 JSON 文本原样返回
      }
    }

    if (result?.isError) {
      const message =
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof (payload as { message: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);
      throw new MinimalMcpError(message || `工具 ${name} 执行失败`, 'E_TOOL');
    }

    return payload;
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new MinimalMcpError(
        `无法连接 MCP：${error instanceof Error ? error.message : String(error)}`,
        'E_CONNECT',
      );
    }

    if (!response.ok) {
      throw new MinimalMcpError(
        `MCP HTTP ${response.status} ${response.statusText}`,
        'E_HTTP',
      );
    }

    let body: JsonRpcSuccess;
    try {
      body = (await response.json()) as JsonRpcSuccess;
    } catch {
      throw new MinimalMcpError('MCP 响应不是合法 JSON', 'E_PROTOCOL');
    }

    if (body.error) {
      throw new MinimalMcpError(
        body.error.message || `JSON-RPC error ${body.error.code ?? ''}`,
        'E_RPC',
      );
    }

    return body.result;
  }
}
