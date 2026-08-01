import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Eraser,
  ListPlus,
  Plus,
  Puzzle,
  Save,
  Sparkles,
  Square,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react';
import { useScheduleSessionSync } from '@/hooks/use-schedule-session-sync';
import { streamChat } from '@/lib/api';
import { isSubmitEnter } from '@/lib/keyboard';
import { cn, generateUUID } from '@/lib/utils';
import {
  useAgent,
  useAgents,
  useSkills,
  useToolkits,
  useUpdateAgent,
  useWorkflows,
  type AgentFormData,
} from '@/services/queries';
import type { MessagePart, UiMessage } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { EntityAvatar } from '@/components/page-shell';
import {
  MessageView,
  ThinkingIndicator,
} from '@/components/chat/message-view';

export const Route = createFileRoute('/_app/agents/$agentId')({
  component: OrchestratePage,
});

const SKILL_TOOLKIT_ID = 'skill-toolkit';

const PROMPT_TEMPLATE = `# 角色
角色概述和主要职责的一句话描述

## 目标
角色的工作目标，如果有多目标可以分点列出，建议聚焦 1-2 个目标

## 技能和流程说明
1. 为了实现目标，角色需要具备的技能 1
2. 为了实现目标，角色需要具备的技能 2
3. 描述角色工作流程的第一步
4. 描述角色工作流程的第二步

## 输出格式
如果对角色的输出格式有特定要求，可以在这里强调并举例说明想要的输出格式

## 限制
- 描述角色在互动过程中需要遵循的限制条件 1
- 描述角色在互动过程中需要遵循的限制条件 2`;

interface FormState {
  name: string;
  description: string;
  prompt: string;
  model: string;
  toolkitIds: string[];
  workflowIds: string[];
  skillNames: string[];
  subAgentIds: string[];
}

interface PickOption {
  id: string;
  label: string;
  description?: string;
}

// ---- 挂载多选弹窗 ----

function MountPicker({
  title,
  options,
  selected,
  emptyText,
  onConfirm,
  onClose,
}: {
  title: string;
  options: PickOption[];
  selected: string[];
  emptyText: string;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<string[]>(selected);

  const toggle = (id: string) => {
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      <div className="space-y-4">
        {options.length === 0 ? (
          <p className="rounded-lg bg-muted/70 px-3 py-6 text-center text-[13px] text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {options.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                  checked.includes(option.id)
                    ? 'border-primary/40 bg-primary-soft'
                    : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--color-primary)]"
                  checked={checked.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              onConfirm(checked);
              onClose();
            }}
          >
            确定
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- 能力面板 section ----

function CapabilitySection({
  icon,
  title,
  hint,
  mounted,
  onAdd,
  onRemove,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  mounted: PickOption[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          {icon}
          {title}
        </div>
        <button
          onClick={onAdd}
          title={`添加${title}`}
          className="rounded-md p-1 text-primary transition-colors hover:bg-primary-soft"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {mounted.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-faint">{hint}</p>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {mounted.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg bg-muted/70 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {item.label}
              </span>
              <button
                onClick={() => onRemove(item.id)}
                title="移除"
                className="rounded p-0.5 text-faint opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- 调试对话面板 ----

function DebugPanel({
  agentId,
  agentName,
  dirty,
  onSaveBeforeSend,
}: {
  agentId: string;
  agentName: string;
  dirty: boolean;
  onSaveBeforeSend: () => Promise<void>;
}) {
  const [sessionId, setSessionId] = useState(() => generateUUID());
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  useScheduleSessionSync(sessionId, {
    streaming,
    onMessages: setMessages,
  });

  const appendAssistantPart = (part: MessagePart) => {
    setThinking(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== 'assistant' || !last.parts) {
        next.push({
          id: generateUUID(),
          role: 'assistant',
          content: '',
          parts: [part],
        });
        return next;
      }
      const parts = [...last.parts];
      const lastPart = parts[parts.length - 1];
      if (part.type === 'text' && lastPart?.type === 'text') {
        parts[parts.length - 1] = {
          type: 'text',
          text: lastPart.text + part.text,
        };
      } else {
        parts.push(part);
      }
      next[next.length - 1] = { ...last, parts };
      return next;
    });
  };

  const markToolDone = (toolId: string, result: unknown) => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.role !== 'assistant' || !message.parts) return message;
        return {
          ...message,
          parts: message.parts.map((part) =>
            part.type === 'tool_call' && part.toolCall.toolId === toolId
              ? { ...part, toolCall: { ...part.toolCall, result, done: true } }
              : part,
          ),
        };
      }),
    );
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || streaming) return;

    // 调试前自动保存未落库的编排修改
    if (dirty) {
      try {
        await onSaveBeforeSend();
      } catch {
        return;
      }
    }

    setInput('');
    setStreaming(true);
    setThinking(true);
    setMessages((prev) => [
      ...prev,
      { id: generateUUID(), role: 'user', content: message },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        agentId,
        { message, sessionId },
        {
          onDelta: (delta) => appendAssistantPart({ type: 'text', text: delta }),
          onToolCall: (data) =>
            appendAssistantPart({
              type: 'tool_call',
              toolCall: { ...data, done: false },
            }),
          onToolResult: (data) => markToolDone(data.toolId, data.result),
          onDone: () => {
            // 后端仍在补发标题，但对话已完成，立刻解除输入锁定
            setStreaming(false);
            setThinking(false);
          },
          onError: (errorMessage) =>
            appendAssistantPart({
              type: 'text',
              text: `\n[错误] ${errorMessage}`,
            }),
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        appendAssistantPart({
          type: 'text',
          text: `\n[错误] ${(error as Error).message}`,
        });
      }
    } finally {
      // 标题事件会让流比对话本身晚结束，期间用户可能已发起新一轮
      if (abortRef.current === controller) {
        setStreaming(false);
        setThinking(false);
        abortRef.current = null;
      }
    }
  };

  const handleClear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(generateUUID());
  };

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <p className="text-[13px] font-semibold">预览与调试</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClear}
          disabled={messages.length === 0}
        >
          <Eraser className="h-3.5 w-3.5" />
          清空
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !thinking && (
          <div className="flex flex-col items-center pt-20 text-center">
            <EntityAvatar
              seed={agentName}
              icon={<Bot className="h-6 w-6" />}
              className="h-14 w-14 rounded-2xl"
            />
            <p className="mt-3 text-sm font-semibold">{agentName}</p>
            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-faint">
              在这里试运行你的编排配置，发送消息前会自动保存修改
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {thinking && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40">
          <textarea
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-faint focus:outline-none"
            placeholder={dirty ? '发送将自动保存修改…' : '输入消息调试智能体'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
          />
          {streaming ? (
            <Button
              size="iconSm"
              variant="outline"
              className="rounded-lg"
              onClick={() => abortRef.current?.abort()}
              title="停止"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="iconSm"
              className="rounded-lg"
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              title="发送"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- 编排页 ----

function OrchestratePage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(agentId);
  const { data: agents } = useAgents();
  const { data: toolkits } = useToolkits();
  const { data: workflows } = useWorkflows();
  const { data: skills } = useSkills();
  const updateAgent = useUpdateAgent();

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<
    'toolkits' | 'skills' | 'workflows' | 'agents' | null
  >(null);
  const [error, setError] = useState('');

  // 首次加载初始化表单（不覆盖用户已编辑内容）
  useEffect(() => {
    if (agent && !form) {
      setForm({
        name: agent.name,
        description: agent.description ?? '',
        prompt: agent.prompt,
        model: agent.model ?? '',
        toolkitIds: agent.agentToolkits
          .map((mount) => mount.toolkitId)
          .filter((id) => id !== SKILL_TOOLKIT_ID),
        workflowIds: agent.agentWorkflows.map((mount) => mount.workflowId),
        skillNames: agent.agentSkills.map((mount) => mount.skillName),
        subAgentIds: agent.subAgents.map((mount) => mount.childId),
      });
    }
  }, [agent, form]);

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!form) return;
    setError('');
    const payload: AgentFormData = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      prompt: form.prompt.trim() || undefined,
      model: form.model.trim() || undefined,
      toolkitIds: form.toolkitIds,
      workflowIds: form.workflowIds,
      skillNames: form.skillNames,
      subAgentIds: form.subAgentIds,
    };
    try {
      await updateAgent.mutateAsync({ id: agentId, data: payload });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      throw err;
    }
  };

  // 能力面板数据
  const toolkitOptions = useMemo<PickOption[]>(
    () =>
      (toolkits ?? [])
        .filter((toolkit) => toolkit.id !== SKILL_TOOLKIT_ID)
        .map((toolkit) => ({
          id: toolkit.id,
          label: toolkit.name,
          description: toolkit.description,
        })),
    [toolkits],
  );
  const workflowOptions = useMemo<PickOption[]>(
    () =>
      (workflows ?? []).map((workflow) => ({
        id: workflow.id,
        label: workflow.name,
        description: workflow.description,
      })),
    [workflows],
  );
  const skillOptions = useMemo<PickOption[]>(
    () =>
      (skills ?? []).map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
      })),
    [skills],
  );
  const subAgentOptions = useMemo<PickOption[]>(
    () =>
      (agents ?? [])
        .filter((item) => item.id !== agentId)
        .map((item) => ({
          id: item.id,
          label: item.name,
          description: item.description ?? undefined,
        })),
    [agents, agentId],
  );

  if (isLoading || !form) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  const pickLabel = (options: PickOption[], id: string) =>
    options.find((option) => option.id === id)?.label ?? id;

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button
          size="iconSm"
          variant="ghost"
          title="返回列表"
          onClick={() => navigate({ to: '/manage/agents' })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <EntityAvatar
          seed={form.name || 'agent'}
          icon={<Bot className="h-4 w-4" />}
          className="h-8 w-8 rounded-lg"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="w-56 rounded-md bg-transparent px-1 text-[15px] font-semibold outline-none transition-colors hover:bg-muted focus:bg-muted"
            placeholder="智能体名称"
          />
          <input
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            className="w-72 rounded-md bg-transparent px-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted focus:bg-muted"
            placeholder="一句话介绍（作为子智能体时的工具描述）"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="max-w-72 truncate text-xs text-destructive">
              {error}
            </span>
          )}
          <Input
            value={form.model}
            onChange={(e) => patch({ model: e.target.value })}
            placeholder="模型（留空用默认）"
            className="h-8 w-48 font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={() => void save().catch(() => undefined)}
            disabled={updateAgent.isPending || !dirty || !form.name.trim()}
          >
            <Save className="h-3.5 w-3.5" />
            {updateAgent.isPending ? '保存中...' : dirty ? '保存' : '已保存'}
          </Button>
        </div>
      </header>

      {/* 三栏主体 */}
      <div className="flex min-h-0 flex-1">
        {/* 提示词 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-5">
            <p className="text-[13px] font-semibold">提示词</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-primary"
              onClick={() =>
                patch({
                  prompt: form.prompt.trim()
                    ? `${form.prompt}\n\n${PROMPT_TEMPLATE}`
                    : PROMPT_TEMPLATE,
                })
              }
            >
              <ListPlus className="h-3.5 w-3.5" />
              插入结构模板
            </Button>
          </div>
          <textarea
            value={form.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="输入系统提示词，定义智能体的角色、目标与限制…"
            className="min-h-0 flex-1 resize-none bg-card/40 px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-faint"
          />
        </div>

        {/* 能力挂载 */}
        <div className="w-[300px] shrink-0 overflow-y-auto border-l border-border bg-card">
          <CapabilitySection
            icon={<Puzzle className="h-4 w-4 text-primary" />}
            title="插件"
            hint="插件允许智能体调用外部工具，例如查询时间、检索信息等，以此扩展智能体的功能。"
            mounted={form.toolkitIds.map((id) => ({
              id,
              label: pickLabel(toolkitOptions, id),
            }))}
            onAdd={() => setPicker('toolkits')}
            onRemove={(id) =>
              patch({
                toolkitIds: form.toolkitIds.filter((item) => item !== id),
              })
            }
          />
          <CapabilitySection
            icon={<Sparkles className="h-4 w-4 text-warning" />}
            title="技能"
            hint="技能是预构建的指令包（SKILL.md + 脚本），挂载后智能体可按需激活使用。"
            mounted={form.skillNames.map((name) => ({
              id: name,
              label: name,
            }))}
            onAdd={() => setPicker('skills')}
            onRemove={(name) =>
              patch({
                skillNames: form.skillNames.filter((item) => item !== name),
              })
            }
          />
          <CapabilitySection
            icon={<WorkflowIcon className="h-4 w-4 text-success" />}
            title="工作流"
            hint="工作流把多个步骤组合为稳定的业务流程，挂载后自动注册为智能体的工具。"
            mounted={form.workflowIds.map((id) => ({
              id,
              label: pickLabel(workflowOptions, id),
            }))}
            onAdd={() => setPicker('workflows')}
            onRemove={(id) =>
              patch({
                workflowIds: form.workflowIds.filter((item) => item !== id),
              })
            }
          />
          <CapabilitySection
            icon={<Bot className="h-4 w-4 text-primary" />}
            title="智能体"
            hint="把其他智能体挂载为本智能体的工具，复杂任务可以委派给更专业的子智能体完成。"
            mounted={form.subAgentIds.map((id) => ({
              id,
              label: pickLabel(subAgentOptions, id),
            }))}
            onAdd={() => setPicker('agents')}
            onRemove={(id) =>
              patch({
                subAgentIds: form.subAgentIds.filter((item) => item !== id),
              })
            }
          />
        </div>

        {/* 调试对话 */}
        <DebugPanel
          agentId={agentId}
          agentName={form.name || '智能体'}
          dirty={dirty}
          onSaveBeforeSend={save}
        />
      </div>

      {/* 挂载选择弹窗 */}
      {picker === 'toolkits' && (
        <MountPicker
          title="添加插件"
          options={toolkitOptions}
          selected={form.toolkitIds}
          emptyText="暂无可用插件"
          onConfirm={(ids) => patch({ toolkitIds: ids })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'skills' && (
        <MountPicker
          title="添加技能"
          options={skillOptions}
          selected={form.skillNames}
          emptyText="暂无技能，请先在「技能」页上传技能压缩包"
          onConfirm={(names) => patch({ skillNames: names })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'workflows' && (
        <MountPicker
          title="添加工作流"
          options={workflowOptions}
          selected={form.workflowIds}
          emptyText="暂无可用工作流"
          onConfirm={(ids) => patch({ workflowIds: ids })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'agents' && (
        <MountPicker
          title="添加子智能体"
          options={subAgentOptions}
          selected={form.subAgentIds}
          emptyText="暂无其他智能体可挂载"
          onConfirm={(ids) => patch({ subAgentIds: ids })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
