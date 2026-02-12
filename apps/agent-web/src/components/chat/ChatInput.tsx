import { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { AgentSelector } from './AgentSelector'

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  disabled?: boolean
  isLoading?: boolean
  agentId: string
  onAgentChange: (agentId: string) => void
  agentLocked?: boolean
}

export function ChatInput({ onSend, onStop, disabled, isLoading, agentId, onAgentChange, agentLocked }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="sticky bottom-0 z-[1] mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
      <div className="flex w-full flex-col rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={agentId ? '发送消息...' : '请先选择智能体'}
          disabled={disabled}
          rows={1}
          className="grow resize-none border-0 bg-transparent p-2 text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ minHeight: '44px', maxHeight: '200px' }}
        />
        <div className="flex items-center justify-between p-0">
          <div className="flex items-center gap-0 sm:gap-0.5">
            <AgentSelector value={agentId} onChange={onAgentChange} disabled={agentLocked} />
          </div>
          <div>
            {isLoading ? (
              <button
                onClick={onStop}
                className="flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-colors duration-200 hover:bg-foreground/90"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!value.trim() || disabled}
                className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
