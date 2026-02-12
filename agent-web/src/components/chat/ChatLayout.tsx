import { ChatSidebar } from './ChatSidebar'
import { ChatPage } from './ChatPage'

export function ChatLayout() {
  return (
    <div className="flex min-h-svh w-full">
      <ChatSidebar />
      <main className="relative flex w-full flex-1 flex-col bg-background">
        <ChatPage />
      </main>
    </div>
  )
}
