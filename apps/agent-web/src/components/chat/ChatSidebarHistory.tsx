import { useMemo } from 'react'
import { useChatSessions } from '../../hooks/use-chat-sessions'
import { ChatSidebarHistoryItem } from './ChatSidebarHistoryItem'
import type { ChatSessionSummary } from '../../types'

function groupByDate(sessions: ChatSessionSummary[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: { label: string; items: ChatSessionSummary[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '最近 7 天', items: [] },
    { label: '最近 30 天', items: [] },
    { label: '更早', items: [] },
  ]

  for (const s of sessions) {
    const d = new Date(s.updatedAt)
    if (d >= today) groups[0]!.items.push(s)
    else if (d >= yesterday) groups[1]!.items.push(s)
    else if (d >= weekAgo) groups[2]!.items.push(s)
    else if (d >= monthAgo) groups[3]!.items.push(s)
    else groups[4]!.items.push(s)
  }

  return groups.filter((g) => g.items.length > 0)
}

export function ChatSidebarHistory() {
  const { sessions, deleteSession } = useChatSessions()

  const groups = useMemo(() => groupByDate(sessions), [sessions])

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-sidebar-foreground/50">
        暂无聊天记录
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 px-2">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
            {group.label}
          </div>
          <div className="flex flex-col">
            {group.items.map((session) => (
              <ChatSidebarHistoryItem
                key={session.id}
                session={session}
                onDelete={deleteSession}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
