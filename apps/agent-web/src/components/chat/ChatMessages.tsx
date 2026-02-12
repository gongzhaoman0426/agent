import { ArrowDown } from 'lucide-react'
import { cn } from '@/ui/lib/utils'
import { useScrollToBottom } from '../../hooks/use-scroll-to-bottom'
import { ChatMessage } from './ChatMessage'
import { ChatGreeting } from './ChatGreeting'
import { ThinkingIndicator } from './ThinkingIndicator'
import type { ChatMessage as ChatMessageType } from '../../types'

interface ChatMessagesProps {
  messages: ChatMessageType[]
  isLoading?: boolean
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const { containerRef, isAtBottom, scrollToBottom } = useScrollToBottom<HTMLDivElement>()

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1">
        <ChatGreeting />
      </div>
    )
  }

  return (
    <div className="relative flex-1">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto"
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isLoading && <ThinkingIndicator />}
        </div>
      </div>

      <button
        onClick={scrollToBottom}
        className={cn(
          'absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all duration-300',
          isAtBottom
            ? 'pointer-events-none scale-0 opacity-0'
            : 'pointer-events-auto scale-100 opacity-100'
        )}
      >
        <ArrowDown size={14} />
      </button>
    </div>
  )
}
