import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { cn } from '@/ui/lib/utils'
import type { ChatSessionSummary } from '../../types'
import { useSidebar } from '../../hooks/use-sidebar'

interface ChatSidebarHistoryItemProps {
  session: ChatSessionSummary
  onDelete: (agentId: string, sessionId: string) => void
}

export function ChatSidebarHistoryItem({ session, onDelete }: ChatSidebarHistoryItemProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { closeMobile } = useSidebar()
  const isActive = location.pathname === `/chat/${session.id}`

  const handleDelete = () => {
    onDelete(session.agentId, session.id)
    if (isActive) {
      navigate('/chat')
    }
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md',
        isActive
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Link
        to={`/chat/${session.id}?agent=${session.agentId}`}
        onClick={closeMobile}
        className="flex-1 truncate px-2 py-1.5 text-sm"
      >
        <span>{session.title}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'mr-0.5 size-7 shrink-0',
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <MoreHorizontal size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            className="text-destructive-foreground cursor-pointer"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
            <span>删除</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
