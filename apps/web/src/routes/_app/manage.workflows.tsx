import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Play, Workflow as WorkflowIcon } from 'lucide-react';
import { useExecuteWorkflow, useWorkflows } from '@/services/queries';
import type { Workflow } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Textarea } from '@/ui/input';
import {
  CardGrid,
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/workflows')({
  component: WorkflowsPage,
});

function RunDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const executeWorkflow = useExecuteWorkflow();
  const [input, setInput] = useState('{}');
  const [error, setError] = useState('');

  const handleRun = () => {
    setError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch {
      setError('JSON 格式错误');
      return;
    }
    executeWorkflow.mutate(
      { id: workflow.id, input: parsed },
      { onError: (err) => setError(err.message) },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`试跑 · ${workflow.name}`}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {workflow.inputSchema && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">输入 Schema</p>
            <pre className="max-h-32 overflow-y-auto rounded-xl bg-muted p-3 font-mono text-xs">
              {JSON.stringify(workflow.inputSchema, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-[13px] font-medium">输入（JSON）</p>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        {executeWorkflow.data !== undefined && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">执行结果</p>
            <pre className="max-h-64 overflow-y-auto rounded-xl bg-muted p-3 font-mono text-xs">
              {JSON.stringify(executeWorkflow.data, null, 2)}
            </pre>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={handleRun} disabled={executeWorkflow.isPending}>
            <Play className="h-3.5 w-3.5" />
            {executeWorkflow.isPending ? '执行中...' : '执行'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function WorkflowsPage() {
  const { data: workflows, isLoading } = useWorkflows();
  const [running, setRunning] = useState<Workflow | null>(null);

  return (
    <PageShell
      title="工作流"
      subtitle="代码定义（Mastra createWorkflow），挂载到智能体后自动注册为 workflow-* 工具"
    >
      {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

      {workflows && workflows.length === 0 ? (
        <EmptyState
          icon={<WorkflowIcon className="h-6 w-6" />}
          title="暂无工作流"
          description="在 apps/api/src/workflow/workflows/ 下新增代码工作流后重启服务"
        />
      ) : (
        <CardGrid>
          {(workflows ?? []).map((workflow) => (
            <div key={workflow.id} className="entity-card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <EntityAvatar
                  seed={workflow.id}
                  icon={<WorkflowIcon className="h-5 w-5" />}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">
                    {workflow.name}
                  </h3>
                  <p className="truncate font-mono text-[11px] text-faint">
                    workflow-{workflow.id}
                  </p>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 min-h-[2.6em] flex-1 text-[13px] leading-relaxed text-muted-foreground">
                {workflow.description}
              </p>

              <div className="mt-4 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="soft"
                  className="w-full"
                  onClick={() => setRunning(workflow)}
                >
                  <Play className="h-3.5 w-3.5" />
                  试跑
                </Button>
              </div>
            </div>
          ))}
        </CardGrid>
      )}

      {running && (
        <RunDialog workflow={running} onClose={() => setRunning(null)} />
      )}
    </PageShell>
  );
}
