import { useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Wrench,
} from 'lucide-react';
import type { MessagePart, ToolCallInfo, UiMessage } from '@/types';
import { cn } from '@/lib/utils';

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    (toolCall.toolKwargs && Object.keys(toolCall.toolKwargs).length > 0) ||
    (toolCall.done && toolCall.result !== undefined);

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-muted/50 text-xs">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left',
          hasDetail && 'cursor-pointer transition-colors hover:bg-muted',
        )}
      >
        {toolCall.done ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        )}
        <Wrench className="h-3.5 w-3.5 shrink-0 text-faint" />
        <span className="font-mono font-medium">{toolCall.toolName}</span>
        <span className="text-faint">
          {toolCall.done ? '调用完成' : '调用中...'}
        </span>
        {hasDetail && (
          <ChevronRight
            className={cn(
              'ml-auto h-3.5 w-3.5 shrink-0 text-faint transition-transform',
              expanded && 'rotate-90',
            )}
          />
        )}
      </button>

      {expanded && hasDetail && (
        <div className="space-y-2 border-t border-border px-3 py-2.5 animate-fade">
          {toolCall.toolKwargs &&
            Object.keys(toolCall.toolKwargs).length > 0 && (
              <div>
                <p className="mb-1 font-medium text-faint">入参</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-card p-2 font-mono text-muted-foreground">
                  {JSON.stringify(toolCall.toolKwargs, null, 2)}
                </pre>
              </div>
            )}
          {toolCall.done && toolCall.result !== undefined && (
            <div>
              <p className="mb-1 font-medium text-faint">结果</p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-card p-2 font-mono text-muted-foreground">
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Part({ part }: { part: MessagePart }) {
  if (part.type === 'tool_call') {
    return <ToolCallCard toolCall={part.toolCall} />;
  }
  return <span className="whitespace-pre-wrap break-words">{part.text}</span>;
}

export function MessageView({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-rise">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
          <span className="whitespace-pre-wrap break-words">
            {message.content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-rise">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_305)] text-white shadow-sm">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-card px-4 py-2.5 text-sm leading-relaxed shadow-[var(--shadow-card)]">
        {message.parts && message.parts.length > 0 ? (
          message.parts.map((part, index) => <Part key={index} part={part} />)
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {message.content}
          </span>
        )}
      </div>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="flex gap-3 animate-fade">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_305)] text-white shadow-sm">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
      </div>
    </div>
  );
}
