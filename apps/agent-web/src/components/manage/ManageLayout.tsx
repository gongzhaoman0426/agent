import { Outlet, useLocation } from 'react-router-dom'
import { ChatSidebar } from '../chat/ChatSidebar'
import { ChatSidebarToggle } from '../chat/ChatSidebarToggle'

const pageTitles: Record<string, string> = {
  '/manage/agents': '智能体',
  '/manage/toolkits': '工具包',
  '/manage/workflows': '工作流',
  '/manage/knowledge-bases': '知识库',
}

export function ManageLayout() {
  const location = useLocation()
  const title = pageTitles[location.pathname] || '管理'

  return (
    <div className="flex min-h-svh w-full">
      <ChatSidebar />
      <div className="relative flex w-full flex-1 flex-col bg-background">
        <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
          <ChatSidebarToggle />
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
