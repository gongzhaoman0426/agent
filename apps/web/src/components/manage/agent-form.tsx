import { useEffect, useState } from 'react';
import { Dialog } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input, Textarea } from '@/ui/input';
import {
  useCreateAgent,
  useSkills,
  useToolkits,
  useUpdateAgent,
  useWorkflows,
  type AgentFormData,
} from '@/services/queries';
import type { Agent } from '@/types';

const SKILL_TOOLKIT_ID = 'skill-toolkit';

function CheckList({
  items,
  selected,
  onToggle,
}: {
  items: Array<{ id: string; label: string; description?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可选项</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <label
          key={item.id}
          className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted"
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.label}</span>
            {item.description && (
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

export function AgentFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Agent | null;
}) {
  const { data: toolkits } = useToolkits();
  const { data: workflows } = useWorkflows();
  const { data: skills } = useSkills();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const [form, setForm] = useState<AgentFormData>({
    name: '',
    description: '',
    prompt: '',
    model: '',
    toolkitIds: [],
    workflowIds: [],
    skillNames: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(
        editing
          ? {
              name: editing.name,
              description: editing.description ?? '',
              prompt: editing.prompt,
              model: editing.model ?? '',
              toolkitIds: editing.agentToolkits.map((m) => m.toolkitId),
              workflowIds: editing.agentWorkflows.map((m) => m.workflowId),
              skillNames: editing.agentSkills.map((m) => m.skillName),
            }
          : {
              name: '',
              description: '',
              prompt: '',
              model: '',
              toolkitIds: [],
              workflowIds: [],
              skillNames: [],
            },
      );
    }
  }, [open, editing]);

  const toggle = (key: 'toolkitIds' | 'workflowIds' | 'skillNames', id: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(id)
        ? prev[key].filter((item) => item !== id)
        : [...prev[key], id],
    }));
  };

  const handleSubmit = async () => {
    setError('');
    const payload: AgentFormData = {
      ...form,
      description: form.description || undefined,
      model: form.model || undefined,
    };
    try {
      if (editing) {
        await updateAgent.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createAgent.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const pending = createAgent.isPending || updateAgent.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? '编辑智能体' : '创建智能体'}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">名称 *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：日程助手"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              模型（可选）
            </label>
            <Input
              value={form.model ?? ''}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="openai/gpt-5.5（留空用默认）"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">描述</label>
          <Input
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="一句话说明这个智能体做什么"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">系统提示词 *</label>
          <Textarea
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            placeholder="你是一个..."
            rows={4}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">工具包</label>
          <CheckList
            items={(toolkits ?? [])
              .filter((toolkit) => toolkit.id !== SKILL_TOOLKIT_ID)
              .map((toolkit) => ({
                id: toolkit.id,
                label: toolkit.name,
                description: toolkit.description,
              }))}
            selected={form.toolkitIds}
            onToggle={(id) => toggle('toolkitIds', id)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            工作流（挂载后自动成为工具）
          </label>
          <CheckList
            items={(workflows ?? []).map((workflow) => ({
              id: workflow.id,
              label: workflow.name,
              description: workflow.description,
            }))}
            selected={form.workflowIds}
            onToggle={(id) => toggle('workflowIds', id)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            技能（挂载后自动附带 use_skill 工具）
          </label>
          <CheckList
            items={(skills ?? []).map((skill) => ({
              id: skill.name,
              label: skill.name,
              description: skill.description,
            }))}
            selected={form.skillNames}
            onToggle={(name) => toggle('skillNames', name)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={pending || !form.name.trim() || !form.prompt.trim()}
          >
            {pending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
