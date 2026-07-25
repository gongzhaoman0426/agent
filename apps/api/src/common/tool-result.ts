const TOOL_RESULT_MAX_LENGTH = 1000;

/**
 * 工具结果可能很大（如技能全文），发给前端只用于展示，超长截断。
 * 流式与历史回放共用，保证同一次调用刷新前后看到的内容一致。
 */
export function truncateToolResult(result: unknown): unknown {
  const serialized =
    typeof result === 'string' ? result : JSON.stringify(result ?? null);
  if (serialized.length <= TOOL_RESULT_MAX_LENGTH) {
    return result;
  }
  return `${serialized.slice(0, TOOL_RESULT_MAX_LENGTH)}...[已截断]`;
}
