import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
  Wrench,
} from 'lucide-react';
import { useAgents, useDeleteAgent } from '@/services/queries';
import type { Agent } from '@/types';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { CreateAgentDialog } from '@/components/manage/agent-form';
import {
  CardGrid,
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/agents')({
  component: AgentsPage,
});

function CapabilityChips({ agent }: { agent: Agent }) {
  const chips = [
    {
      icon: Wrench,
      count: agent.agentToolkits.length,
      label: '工具',
      className: 'bg-muted text-muted-foreground',
    },
    {
      icon: WorkflowIcon,
      count: agent.agentWorkflows.length,
      label: '工作流',
      className: 'bg-primary-soft text-primary',
    },
    {
      icon: Sparkles,
      count: agent.agentSkills.length,
      label: '技能',
      className: 'bg-warning-soft text-warning',
    },
    {
      icon: Bot,
      count: agent.subAgents.length,
      label: '子智能体',
      className: 'bg-success-soft text-success',
    },
  ].filter((chip) => chip.count > 0);

  if (chips.length === 0) {
    return (
      <span className="text-xs text-faint">未挂载能力</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ icon: Icon, count, label, className }) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${className}`}
        >
          <Icon className="h-3 w-3" />
          {count} 个{label}
        </span>
      ))}
    </div>
  );
}

function AgentsPage() {
  const navigate = useNavigate();
  const { data: agents, isLoading } = useAgents();
  const deleteAgent = useDeleteAgent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const list = agents ?? [];
    const query = keyword.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        (agent.description ?? '').toLowerCase().includes(query),
    );
  }, [agents, keyword]);

  const openCreate = () => {
    setDialogOpen(true);
  };

  return (
    <PageShell
      title="智能体"
      subtitle="创建智能体并挂载插件工具、工作流与技能"
      actions={
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索智能体"
              className="h-9 w-52 pl-8"
            />
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            创建智能体
          </Button>
        </>
      }
    >
      {isLoading && (
        <p className="text-sm text-muted-foreground">加载中...</p>
      )}

      {agents && agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-6 w-6" />}
          title="还没有智能体"
          description="创建你的第一个智能体，为它挂载工具、工作流和技能"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              创建智能体
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {filtered.map((agent) => (
            <div key={agent.id} className="entity-card group flex flex-col p-5">
              <div
                className="flex cursor-pointer items-start gap-3"
                onClick={() =>
                  navigate({
                    to: '/agents/$agentId',
                    params: { agentId: agent.id },
                  })
                }
              >
                <EntityAvatar seed={agent.name} icon={<Bot className="h-5 w-5" />} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold transition-colors hover:text-primary">
                    {agent.name}
                  </h3>
                  <p className="truncate font-mono text-[11px] text-faint">
                    {agent.model || '默认模型'}
                  </p>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed text-muted-foreground">
                {agent.description || agent.prompt}
              </p>

              <div className="mt-3">
                <CapabilityChips agent={agent} />
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="soft"
                  className="flex-1"
                  onClick={() =>
                    navigate({
                      to: '/chat',
                      search: { session: undefined, agent: agent.id },
                    })
                  }
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  对话
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  title="编排"
                  onClick={() =>
                    navigate({
                      to: '/agents/$agentId',
                      params: { agentId: agent.id },
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  title="删除"
                  className="text-faint hover:text-destructive"
                  onClick={() => {
                    if (confirm(`确定删除智能体「${agent.name}」？`)) {
                      deleteAgent.mutate(agent.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardGrid>
      )}

      {agents && agents.length > 0 && filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          没有匹配「{keyword}」的智能体
        </p>
      )}

      <CreateAgentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageShell>
  );
}
