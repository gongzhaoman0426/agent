import { Bot, CheckCircle2, Loader2, User, Wrench } from 'lucide-react';
import type { MessagePart, ToolCallInfo, UiMessage } from '@/types';
import { cn } from '@/lib/utils';

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  return (
    <div className="my-1.5 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        {toolCall.done ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        <Wrench className="h-3.5 w-3.5" />
        <span>{toolCall.toolName}</span>
      </div>
      {toolCall.toolKwargs && Object.keys(toolCall.toolKwargs).length > 0 && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
          {JSON.stringify(toolCall.toolKwargs)}
        </pre>
      )}
      {toolCall.done && toolCall.result !== undefined && (
        <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-muted-foreground">
          {typeof toolCall.result === 'string'
            ? toolCall.result
            : JSON.stringify(toolCall.result, null, 2)}
        </pre>
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

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card',
        )}
      >
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
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        思考中...
      </div>
    </div>
  );
}
