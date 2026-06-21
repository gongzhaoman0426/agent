import { cn } from '@/ui/lib/utils'
import { Sparkles } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../../types'
import { ToolCallIndicator } from './ToolCallIndicator'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const orderedParts = message.parts?.filter((part) =>
    part.type === 'tool_call' || part.content.length > 0,
  )

  return (
    <div
      className="group/message w-full animate-in fade-in duration-200"
      data-role={message.role}
    >
      <div
        className={cn('flex w-full items-start gap-3', {
          'justify-end': isUser,
          'justify-start': !isUser,
        })}
      >
        {!isUser && (
          <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
            <Sparkles size={14} />
          </div>
        )}
        <div
          className={cn({
            'max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]': isUser,
            'w-full': !isUser,
          })}
        >
          {isUser ? (
            <div
              className="w-fit rounded-2xl px-3 py-2 text-right text-white break-words"
              style={{ backgroundColor: '#006cff' }}
            >
              {message.content}
            </div>
          ) : (
            <>
              {orderedParts && orderedParts.length > 0 ? (
                <div className="space-y-2">
                  {orderedParts.map((part) => (
                    part.type === 'tool_call' ? (
                      <ToolCallIndicator key={part.id} toolCalls={[part.toolCall]} />
                    ) : (
                      <div key={part.id} className="bg-transparent px-0 py-0 text-left whitespace-pre-wrap break-words">
                        {part.content}
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <>
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <ToolCallIndicator toolCalls={message.toolCalls} />
                  )}
                  <div className="bg-transparent px-0 py-0 text-left whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
