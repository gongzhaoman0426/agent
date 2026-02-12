import { useState } from 'react'
import { Loader2, CheckCircle2, ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ToolCallInfo } from '../../types'

interface ToolCallIndicatorProps {
  toolCalls: ToolCallInfo[]
}

export function ToolCallIndicator({ toolCalls }: ToolCallIndicatorProps) {
  if (!toolCalls.length) return null

  return (
    <div className="mb-2 space-y-1">
      {toolCalls.map((tc) => (
        <ToolCallItem key={tc.toolId} toolCall={tc} />
      ))}
    </div>
  )
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false)
  const isCalling = toolCall.status === 'calling'

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {isCalling ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-blue-500" />
        ) : (
          <CheckCircle2 size={14} className="shrink-0 text-green-500" />
        )}
        <Wrench size={12} className="shrink-0" />
        <span className="font-medium text-foreground/80">{toolCall.toolName}</span>
        <span className="text-xs text-muted-foreground">
          {isCalling ? '调用中...' : '完成'}
        </span>
        <span className="ml-auto">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {toolCall.toolKwargs && Object.keys(toolCall.toolKwargs).length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-0.5">参数</div>
              <pre className="text-xs bg-muted/50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(toolCall.toolKwargs, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-0.5">结果</div>
              <pre className="text-xs bg-muted/50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
