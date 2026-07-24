import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Bot, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAgents, useDeleteAgent } from '@/services/queries';
import type { Agent } from '@/types';
import { Button } from '@/ui/button';
import { AgentFormDialog } from '@/components/manage/agent-form';

export const Route = createFileRoute('/_app/manage/agents')({
  component: AgentsPage,
});

function AgentsPage() {
  const navigate = useNavigate();
  const { data: agents, isLoading } = useAgents();
  const deleteAgent = useDeleteAgent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">智能体</h1>
            <p className="text-sm text-muted-foreground">
              创建智能体并挂载工具包、工作流和技能
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            创建智能体
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {(agents ?? []).map((agent) => (
            <div
              key={agent.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {agent.model || '默认模型'}
                    </p>
                  </div>
                </div>
              </div>

              {agent.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {agent.description}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                {agent.agentToolkits.map((mount) => (
                  <span
                    key={mount.toolkitId}
                    className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                  >
                    {mount.toolkit?.name ?? mount.toolkitId}
                  </span>
                ))}
                {agent.agentWorkflows.map((mount) => (
                  <span
                    key={mount.workflowId}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                  >
                    {mount.workflow?.name ?? mount.workflowId}
                  </span>
                ))}
                {agent.agentSkills.map((mount) => (
                  <span
                    key={mount.skillName}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700"
                  >
                    {mount.skillName}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
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
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(agent);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`确定删除智能体「${agent.name}」？`)) {
                      deleteAgent.mutate(agent.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>

        {agents && agents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            还没有智能体，点击右上角创建第一个
          </div>
        )}
      </div>

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
