import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Play, Workflow as WorkflowIcon } from 'lucide-react';
import { useExecuteWorkflow, useWorkflows } from '@/services/queries';
import type { Workflow } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Textarea } from '@/ui/input';

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
      <div className="space-y-3">
        {workflow.inputSchema && (
          <div>
            <p className="mb-1 text-sm font-medium">输入 Schema</p>
            <pre className="max-h-32 overflow-y-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(workflow.inputSchema, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-medium">输入（JSON）</p>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {executeWorkflow.data !== undefined && (
          <div>
            <p className="mb-1 text-sm font-medium">执行结果</p>
            <pre className="max-h-64 overflow-y-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(executeWorkflow.data, null, 2)}
            </pre>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button
            onClick={handleRun}
            disabled={executeWorkflow.isPending}
          >
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
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">工作流</h1>
          <p className="text-sm text-muted-foreground">
            代码定义（Mastra createWorkflow），挂载到智能体后自动注册为
            workflow-* 工具
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

        <div className="space-y-3">
          {(workflows ?? []).map((workflow) => (
            <div
              key={workflow.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <WorkflowIcon className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">{workflow.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    workflow-{workflow.id}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {workflow.description}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRunning(workflow)}
              >
                <Play className="h-3.5 w-3.5" />
                试跑
              </Button>
            </div>
          ))}
        </div>

        {workflows && workflows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            暂无工作流。在 apps/api/src/workflow/workflows/ 下新增代码工作流后重启服务。
          </div>
        )}
      </div>

      {running && (
        <RunDialog workflow={running} onClose={() => setRunning(null)} />
      )}
    </div>
  );
}
