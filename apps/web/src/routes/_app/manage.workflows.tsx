import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Play, Workflow as WorkflowIcon } from 'lucide-react';
import { useExecuteWorkflow, useWorkflows } from '@/services/queries';
import type { Workflow } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Input, Textarea } from '@/ui/input';
import {
  CardGrid,
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/workflows')({
  component: WorkflowsPage,
});

/** 从 JSON Schema 抽出可渲染为字符串输入框的字段（与 toolkit settings 同体验） */
interface InputField {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'json';
}

function schemaType(prop: Record<string, unknown>): InputField['type'] {
  const raw = prop.type;
  const types = Array.isArray(raw) ? raw.filter((t) => t !== 'null') : [raw];
  if (types.length === 1 && types[0] === 'string') return 'string';
  if (types.length === 1 && types[0] === 'number') return 'number';
  if (types.length === 1 && types[0] === 'integer') return 'number';
  if (types.length === 1 && types[0] === 'boolean') return 'boolean';
  return 'json';
}

function fieldsFromInputSchema(
  inputSchema: Record<string, unknown> | null | undefined,
): InputField[] {
  if (!inputSchema || typeof inputSchema !== 'object') return [];
  const properties = inputSchema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return [];
  }
  const required = new Set(
    Array.isArray(inputSchema.required)
      ? inputSchema.required.filter((k): k is string => typeof k === 'string')
      : [],
  );

  return Object.entries(properties as Record<string, unknown>).map(
    ([key, value]) => {
      const prop =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const type = schemaType(prop);
      const description =
        typeof prop.description === 'string' ? prop.description : undefined;
      const title = typeof prop.title === 'string' ? prop.title : undefined;
      return {
        key,
        label: title ?? key,
        description,
        placeholder: description,
        required: required.has(key),
        type,
      };
    },
  );
}

function buildInputPayload(
  fields: InputField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) {
      if (field.required) {
        throw new Error(`请填写 ${field.label}`);
      }
      continue;
    }
    if (field.type === 'number') {
      const n = Number(trimmed);
      if (Number.isNaN(n)) {
        throw new Error(`${field.label} 必须是数字`);
      }
      payload[field.key] = n;
      continue;
    }
    if (field.type === 'boolean') {
      if (trimmed === 'true' || trimmed === 'false') {
        payload[field.key] = trimmed === 'true';
      } else {
        throw new Error(`${field.label} 请输入 true 或 false`);
      }
      continue;
    }
    if (field.type === 'json') {
      try {
        payload[field.key] = JSON.parse(trimmed) as unknown;
      } catch {
        throw new Error(`${field.label} JSON 格式错误`);
      }
      continue;
    }
    payload[field.key] = trimmed;
  }
  return payload;
}

function RunDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const executeWorkflow = useExecuteWorkflow();
  const fields = useMemo(
    () => fieldsFromInputSchema(workflow.inputSchema),
    [workflow.inputSchema],
  );
  const useForm = fields.length > 0;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, ''])),
  );
  const [jsonInput, setJsonInput] = useState('{}');
  const [error, setError] = useState('');

  const missing = fields.filter(
    (field) => field.required && !values[field.key]?.trim(),
  );

  const handleRun = () => {
    setError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = useForm
        ? buildInputPayload(fields, values)
        : (JSON.parse(jsonInput) as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : '输入格式错误');
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
        {useForm ? (
          fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-[13px] font-medium">
                {field.label}
                {field.required && (
                  <span className="ml-0.5 text-destructive">*</span>
                )}
              </label>
              {field.type === 'json' ? (
                <Textarea
                  value={values[field.key] ?? ''}
                  placeholder={field.placeholder ?? '{}'}
                  rows={3}
                  className="font-mono text-xs"
                  onChange={(e) =>
                    setValues({ ...values, [field.key]: e.target.value })
                  }
                />
              ) : (
                <Input
                  type="text"
                  value={values[field.key] ?? ''}
                  placeholder={
                    field.placeholder ??
                    (field.type === 'boolean' ? 'true / false' : undefined)
                  }
                  autoComplete="off"
                  onChange={(e) =>
                    setValues({ ...values, [field.key]: e.target.value })
                  }
                />
              )}
              {field.description && (
                <p className="mt-1 text-xs text-faint">{field.description}</p>
              )}
            </div>
          ))
        ) : (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">输入（JSON）</p>
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        )}

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
          <Button
            onClick={handleRun}
            disabled={executeWorkflow.isPending || missing.length > 0}
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
