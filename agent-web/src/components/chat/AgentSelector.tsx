import { useAgents } from '../../services/agent.service'

interface AgentSelectorProps {
  value: string
  onChange: (agentId: string) => void
  disabled?: boolean
}

export function AgentSelector({ value, onChange, disabled }: AgentSelectorProps) {
  const { data: agents = [], isLoading } = useAgents()

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading || disabled}
      className="h-8 w-[200px] cursor-pointer rounded-md border-0 bg-transparent px-2 text-sm outline-none hover:bg-muted focus:ring-0 disabled:cursor-default disabled:opacity-50"
    >
      <option value="" disabled>
        {isLoading ? '加载中...' : '选择智能体'}
      </option>
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  )
}
