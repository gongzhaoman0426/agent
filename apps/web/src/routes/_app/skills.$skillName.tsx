import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUp,
  Eraser,
  FileCode2,
  FilePlus2,
  FileText,
  PencilLine,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from 'lucide-react';
import { streamSkillAssistant } from '@/lib/api';
import { isSubmitEnter } from '@/lib/keyboard';
import { cn, generateUUID } from '@/lib/utils';
import {
  queryKeys,
  useDeleteSkillFile,
  useRenameSkill,
  useResetSkillAssistant,
  useSaveSkillFile,
  useSkillAssistantHistory,
  useSkillDetail,
  useSkillFile,
  useSkillFiles,
} from '@/services/queries';
import type { SkillFileNode } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { EntityAvatar } from '@/components/page-shell';
import {
  MessageView,
  ThinkingIndicator,
} from '@/components/chat/message-view';
import { useStreamMessages } from '@/components/chat/use-stream-messages';

export const Route = createFileRoute('/_app/skills/$skillName')({
  component: SkillEditorPage,
});

const QUICK_PROMPTS = [
  '帮我把 SKILL.md 的指令写得更清晰、更可执行',
  '给这个技能补一个 references 速查表',
  '检查脚本有没有边界情况没处理',
];

// ---- 文件树 ----

function FileTree({
  files,
  active,
  onSelect,
  onCreate,
  onDelete,
}: {
  files: SkillFileNode[];
  active: string | null;
  onSelect: (path: string) => void;
  onCreate: () => void;
  onDelete: (path: string) => void;
}) {
  // 按顶层目录分组：根文件在前，其余按目录归拢
  const groups = useMemo(() => {
    const root: SkillFileNode[] = [];
    const dirs = new Map<string, SkillFileNode[]>();
    for (const file of files) {
      const slash = file.path.indexOf('/');
      if (slash === -1) {
        root.push(file);
        continue;
      }
      const dir = file.path.slice(0, slash);
      const list = dirs.get(dir) ?? [];
      list.push(file);
      dirs.set(dir, list);
    }
    return { root, dirs: [...dirs.entries()] };
  }, [files]);

  const renderFile = (file: SkillFileNode, label: string) => (
    <div
      key={file.path}
      className={cn(
        'group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
        active === file.path
          ? 'bg-primary-soft font-medium text-primary'
          : 'hover:bg-muted',
      )}
    >
      <button
        onClick={() => onSelect(file.path)}
        disabled={!file.editable}
        title={file.editable ? file.path : `${file.path}（不支持在线编辑）`}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        {file.path.endsWith('.js') ? (
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-faint" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
        )}
        <span className="truncate font-mono text-xs">{label}</span>
      </button>
      {file.path !== 'SKILL.md' && (
        <button
          onClick={() => onDelete(file.path)}
          title="删除文件"
          className="rounded p-0.5 text-faint opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <p className="text-[13px] font-semibold">文件</p>
        <button
          onClick={onCreate}
          title="新建文件"
          className="rounded-md p-1 text-primary transition-colors hover:bg-primary-soft"
        >
          <FilePlus2 className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {groups.root.map((file) => renderFile(file, file.path))}
        </div>
        {groups.dirs.map(([dir, items]) => (
          <div key={dir}>
            <p className="px-2 pb-1 font-mono text-[11px] uppercase tracking-wide text-faint">
              {dir}/
            </p>
            <div className="space-y-0.5">
              {items.map((file) =>
                renderFile(file, file.path.slice(dir.length + 1)),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- 新建文件弹窗 ----

function CreateFileDialog({
  existing,
  onClose,
  onCreate,
}: {
  existing: string[];
  onClose: () => void;
  onCreate: (path: string) => void;
}) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const value = path.trim().replace(/^\/+/, '');
    if (!value) {
      setError('请输入文件路径');
      return;
    }
    if (value.includes('..')) {
      setError('路径不能包含 ..');
      return;
    }
    if (existing.includes(value)) {
      setError('该文件已存在');
      return;
    }
    onCreate(value);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="新建文件">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            文件路径
          </label>
          <Input
            autoFocus
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => isSubmitEnter(e) && submit()}
            placeholder="references/faq.md 或 scripts/run.js"
            className="font-mono text-xs"
          />
          <p className="mt-1.5 text-xs text-faint">
            支持 .md / .js / .json / .txt / .yaml 等文本格式
          </p>
        </div>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit}>创建</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- 重命名 / 改简介 ----

function RenameDialog({
  skillName,
  description,
  onClose,
  onRenamed,
}: {
  skillName: string;
  description: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const renameSkill = useRenameSkill();
  const [name, setName] = useState(skillName);
  const [desc, setDesc] = useState(description);
  const [error, setError] = useState('');

  const changed = name.trim() !== skillName || desc.trim() !== description;

  const submit = async () => {
    setError('');
    try {
      const updated = await renameSkill.mutateAsync({
        name: skillName,
        updates: { name: name.trim(), description: desc.trim() },
      });
      onClose();
      onRenamed(updated.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="技能信息">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            技能名称
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-xs"
          />
          <p className="mt-1.5 text-xs text-faint">
            改名会同步重命名存储目录、SKILL.md 里的 name，以及已挂载该技能的智能体
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            技能简介
          </label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm placeholder:text-faint focus:border-primary/40 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!changed || !name.trim() || !desc.trim() || renameSkill.isPending}
          >
            {renameSkill.isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- AI 编辑助手 ----

function AssistantPanel({
  skillName,
  onFilesChanged,
}: {
  skillName: string;
  onFilesChanged: () => void;
}) {
  const { data: history } = useSkillAssistantHistory(skillName);
  const resetAssistant = useResetSkillAssistant(skillName);
  const { messages, setMessages, streaming, thinking, send, abort, clear } =
    useStreamMessages();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 首次加载把服务端保存的对话历史铺进来
  useEffect(() => {
    if (history) {
      setMessages(
        history.map((message) => ({
          id: message.id || generateUUID(),
          role: message.role,
          content: message.content,
        })),
      );
    }
  }, [history, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    setInput('');

    await send(
      message,
      (callbacks, signal) =>
        streamSkillAssistant(skillName, { message }, callbacks, signal),
      (data) => {
        if (data.filesChanged) {
          onFilesChanged();
        }
      },
    );
  };

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Wand2 className="h-4 w-4 text-primary" />
          AI 编辑助手
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={messages.length === 0}
          onClick={() => {
            clear();
            resetAssistant.mutate();
          }}
        >
          <Eraser className="h-3.5 w-3.5" />
          清空
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !thinking && (
          <div className="flex flex-col items-center pt-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Wand2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold">用对话来改技能</p>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-faint">
              助手能直接读写这个技能的文件，改完左侧编辑器会自动刷新
            </p>
            <div className="mt-5 w-full space-y-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void handleSend(prompt)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
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
            placeholder="描述你想怎么改这个技能"
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
              onClick={abort}
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

// ---- 编辑页 ----

function SkillEditorPage() {
  const { skillName } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: skill } = useSkillDetail(skillName);
  const { data: files } = useSkillFiles(skillName);
  const [activePath, setActivePath] = useState<string | null>(null);
  const { data: file } = useSkillFile(skillName, activePath);
  const saveFile = useSaveSkillFile(skillName);
  const deleteFile = useDeleteSkillFile(skillName);

  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState('');
  /** AI 改了当前文件但本地有未保存修改时，提示用户手动重载 */
  const [staleWarning, setStaleWarning] = useState(false);

  /**
   * 助手改动文件后刷新文件树、文件内容与技能描述。
   * 用精确匹配，避免连带失效同前缀的助手对话历史（会把正在展示的消息冲掉）。
   */
  const refreshFiles = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.skillFiles(skillName),
    });
    void queryClient.invalidateQueries({
      queryKey: ['skills', skillName, 'file'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['skills', skillName],
      exact: true,
    });
  };

  // 默认打开 SKILL.md
  useEffect(() => {
    if (!activePath && files?.length) {
      setActivePath(files[0].path);
    }
  }, [files, activePath]);

  // 服务端内容变化时同步到编辑器；有未保存修改则保留用户的草稿
  useEffect(() => {
    if (!file) return;
    setDraft((prev) => {
      if (dirty && prev !== file.content) {
        setStaleWarning(true);
        return prev;
      }
      return file.content;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const selectFile = (path: string) => {
    if (dirty && !confirm('当前文件有未保存的修改，切换后会丢失。继续？')) {
      return;
    }
    setDirty(false);
    setStaleWarning(false);
    setActivePath(path);
  };

  const handleSave = async () => {
    if (!activePath) return;
    setError('');
    try {
      await saveFile.mutateAsync({ path: activePath, content: draft });
      setDirty(false);
      setStaleWarning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDelete = (path: string) => {
    if (!confirm(`确定删除文件「${path}」？`)) return;
    deleteFile.mutate(path, {
      onSuccess: () => {
        if (activePath === path) {
          setActivePath(null);
          setDirty(false);
        }
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : '删除失败'),
    });
  };

  const handleCreate = (path: string) => {
    setError('');
    saveFile.mutate(
      { path, content: '' },
      {
        onSuccess: () => {
          setDirty(false);
          setStaleWarning(false);
          setActivePath(path);
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : '创建失败'),
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-5">
        <Button
          size="iconSm"
          variant="ghost"
          title="返回技能列表"
          onClick={() => void navigate({ to: '/manage/skills' })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <EntityAvatar
          seed={skillName}
          icon={<Sparkles className="h-4 w-4" />}
          className="h-8 w-8 rounded-lg"
        />
        <button
          onClick={() => setRenaming(true)}
          title="修改名称与简介"
          className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">
                {skillName}
              </span>
              <PencilLine className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {skill?.description ?? '加载中...'}
            </span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="max-w-80 truncate text-xs text-destructive">
              {error}
            </span>
          )}
          <Button
            onClick={() => void handleSave()}
            disabled={!dirty || saveFile.isPending}
            variant={dirty ? 'default' : 'outline'}
          >
            <Save className="h-4 w-4" />
            {saveFile.isPending ? '保存中...' : dirty ? '保存修改' : '已保存'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FileTree
          files={files ?? []}
          active={activePath}
          onSelect={selectFile}
          onCreate={() => setCreating(true)}
          onDelete={handleDelete}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="font-mono text-xs text-muted-foreground">
              {activePath ?? '未选择文件'}
            </span>
            {dirty && (
              <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
                未保存
              </span>
            )}
            {staleWarning && (
              <button
                onClick={() => {
                  if (file) {
                    setDraft(file.content);
                    setDirty(false);
                    setStaleWarning(false);
                  }
                }}
                className="flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <RefreshCw className="h-3 w-3" />
                AI 已改动此文件，点击加载最新内容
              </button>
            )}
          </div>

          {activePath ? (
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed focus:outline-none"
              placeholder="文件内容为空，开始编写吧"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-faint">
              从左侧选择一个文件开始编辑
            </div>
          )}
        </div>

        <AssistantPanel skillName={skillName} onFilesChanged={refreshFiles} />
      </div>

      {creating && (
        <CreateFileDialog
          existing={(files ?? []).map((item) => item.path)}
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}

      {renaming && skill && (
        <RenameDialog
          skillName={skillName}
          description={skill.description}
          onClose={() => setRenaming(false)}
          onRenamed={(next) => {
            if (next !== skillName) {
              void navigate({
                to: '/skills/$skillName',
                params: { skillName: next },
                replace: true,
              });
            }
          }}
        />
      )}
    </div>
  );
}
