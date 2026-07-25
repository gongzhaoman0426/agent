import type { Logger } from '@nestjs/common';
import type { Response } from 'express';

/** 前端约定的 SSE 事件协议，智能体对话与技能助手共用 */
export interface SseChunk {
  event: 'delta' | 'tool_call' | 'tool_result' | 'done' | 'title' | 'error';
  data: Record<string, unknown>;
}

interface StreamChunk {
  type: string;
  payload?: unknown;
}

const TOOL_RESULT_MAX_LENGTH = 1000;
const HEARTBEAT_INTERVAL_MS = 15_000;

/** Mastra fullStream 分片 → 前端事件；不关心的分片返回 null */
export function mapStreamChunk(
  chunk: StreamChunk,
  logger?: Logger,
): SseChunk | null {
  const payload = (chunk.payload ?? {}) as Record<string, unknown>;

  switch (chunk.type) {
    case 'text-delta': {
      const delta = String(payload.text ?? payload.textDelta ?? '');
      return delta ? { event: 'delta', data: { delta } } : null;
    }
    case 'tool-call':
      return {
        event: 'tool_call',
        data: {
          toolId: String(payload.toolCallId ?? ''),
          toolName: String(payload.toolName ?? ''),
          toolKwargs: payload.args ?? payload.input ?? {},
        },
      };
    case 'tool-result': {
      let result = payload.result ?? payload.output;
      const serialized =
        typeof result === 'string' ? result : JSON.stringify(result ?? null);
      if (serialized.length > TOOL_RESULT_MAX_LENGTH) {
        result = `${serialized.slice(0, TOOL_RESULT_MAX_LENGTH)}...[已截断]`;
      }
      return {
        event: 'tool_result',
        data: {
          toolId: String(payload.toolCallId ?? ''),
          toolName: String(payload.toolName ?? ''),
          result,
        },
      };
    }
    case 'error': {
      logger?.error(`流式响应错误: ${JSON.stringify(payload)}`);
      return {
        event: 'error',
        data: {
          message: String(payload.error ?? payload.message ?? '未知错误'),
        },
      };
    }
    default:
      return null;
  }
}

/** 把事件生成器写入 SSE 响应：带心跳、断连中止与错误兜底 */
export async function writeSseStream(
  res: Response,
  generator: AsyncGenerator<SseChunk>,
  logger: Logger,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(': ping\n\n');
    }
  }, HEARTBEAT_INTERVAL_MS);

  try {
    for await (const chunk of generator) {
      if (closed) break;
      res.write(
        `event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`,
      );
    }
  } catch (error) {
    logger.error(`流式响应异常: ${String(error)}`);
    if (!closed) {
      const message = error instanceof Error ? error.message : '执行失败';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    if (!closed) {
      res.end();
    }
  }
}
