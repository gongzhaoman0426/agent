import { Sparkles } from 'lucide-react'

export function ThinkingIndicator() {
  return (
    <div className="group/message w-full animate-in fade-in duration-300">
      <div className="flex w-full items-start gap-3 justify-start">
        <div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <Sparkles size={14} className="animate-pulse" />
        </div>
        <div className="flex items-center gap-1">
          <span className="animate-pulse text-muted-foreground text-sm">Thinking</span>
          <span className="flex gap-1 ml-1">
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
          </span>
        </div>
      </div>
    </div>
  )
}
