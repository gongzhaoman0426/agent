import { useSidebar } from '../../hooks/use-sidebar'
import { Button } from '@/ui/components/button'
import { PanelLeft } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip'

export function ChatSidebarToggle() {
  const { toggle } = useSidebar()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" className="h-8 px-2 md:h-fit md:px-2" onClick={toggle}>
          <PanelLeft size={16} />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Toggle sidebar</TooltipContent>
    </Tooltip>
  )
}
