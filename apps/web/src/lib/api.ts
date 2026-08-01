import { setStoredUser } from './auth';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (response.status === 401) {
    setStoredUser(null);
    window.location.href = '/login';
    throw new ApiError(401, '未登录');
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function requestUpload<T>(path: string, formData: FormData): Promise<T> {
  // 不设置 Content-Type，浏览器会自动带 multipart boundary
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (response.status === 401) {
    setStoredUser(null);
    window.location.href = '/login';
    throw new ApiError(401, '未登录');
  }
  if (!response.ok) {
    let message = `上传失败 (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    requestUpload<T>(path, formData),
};

// ============ SSE 流式对话 ============

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onToolCall: (data: {
    toolId: string;
    toolName: string;
    toolKwargs?: Record<string, unknown>;
  }) => void;
  onToolResult: (data: {
    toolId: string;
    toolName: string;
    result?: unknown;
  }) => void;
  onDone: (data: {
    response: string;
    sessionId: string;
    /** 技能助手专用：本轮是否改动了文件 */
    filesChanged?: boolean;
  }) => void;
  /** 标题由后端异步生成，在 done 之后才会到达 */
  onTitle?: (data: { sessionId: string; title: string }) => void;
  onError: (message: string) => void;
}

export function streamChat(
  agentId: string,
  payload: { message: string; sessionId: string; channel?: 'web' | 'wechat' },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamSse(
    `/agents/${agentId}/chat/stream`,
    { channel: 'web', ...payload },
    callbacks,
    signal,
  );
}

/** 技能编辑助手：同一套事件协议，工具调用即为文件读写 */
export function streamSkillAssistant(
  skillName: string,
  payload: { message: string },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamSse(
    `/skills/${encodeURIComponent(skillName)}/assistant/stream`,
    payload,
    callbacks,
    signal,
  );
}

async function streamSse(
  path: string,
  payload: unknown,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `请求失败 (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore
    }
    callbacks.onError(message);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (eventName: string, dataRaw: string) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataRaw) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (eventName) {
      case 'delta':
        callbacks.onDelta(String(data.delta ?? ''));
        break;
      case 'tool_call':
        callbacks.onToolCall({
          toolId: String(data.toolId ?? ''),
          toolName: String(data.toolName ?? ''),
          toolKwargs: data.toolKwargs as Record<string, unknown> | undefined,
        });
        break;
      case 'tool_result':
        callbacks.onToolResult({
          toolId: String(data.toolId ?? ''),
          toolName: String(data.toolName ?? ''),
          result: data.result,
        });
        break;
      case 'done':
        callbacks.onDone({
          response: String(data.response ?? ''),
          sessionId: String(data.sessionId ?? ''),
          filesChanged: Boolean(data.filesChanged),
        });
        break;
      case 'title':
        callbacks.onTitle?.({
          sessionId: String(data.sessionId ?? ''),
          title: String(data.title ?? ''),
        });
        break;
      case 'error':
        callbacks.onError(String(data.message ?? '未知错误'));
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE 块以空行分隔
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      let eventName = '';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // 心跳
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (eventName && dataLines.length > 0) {
        handleEvent(eventName, dataLines.join('\n'));
      }
    }
  }
}
