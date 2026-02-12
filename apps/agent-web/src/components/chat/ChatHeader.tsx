import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip'
import { ChatSidebarToggle } from './ChatSidebarToggle'

export function ChatHeader() {
  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <ChatSidebarToggle />
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/chat">
            <Button variant="outline" className="h-8 px-2 md:h-fit md:px-2">
              <Plus size={16} />
              <span className="md:sr-only">新建聊天</span>
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent>新建聊天</TooltipContent>
      </Tooltip>
    </header>
  )
}
