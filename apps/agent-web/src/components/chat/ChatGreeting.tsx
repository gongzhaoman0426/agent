export function ChatGreeting() {
  return (
    <div className="mx-auto mt-4 flex size-full max-w-3xl flex-col justify-center px-4 md:mt-16 md:px-8">
      <div className="font-semibold text-xl md:text-2xl animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both" style={{ animationDelay: '500ms' }}>
        你好！
      </div>
      <div className="text-xl text-zinc-500 md:text-2xl animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both" style={{ animationDelay: '600ms' }}>
        有什么可以帮助你的？
      </div>
    </div>
  )
}
