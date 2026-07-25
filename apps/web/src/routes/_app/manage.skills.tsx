import { useRef, useState, type DragEvent } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  FileArchive,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useCreateSkill,
  useDeleteSkill,
  useSkills,
  useUploadSkill,
} from '@/services/queries';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { cn } from '@/lib/utils';
import {
  CardGrid,
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/skills')({
  component: SkillsPage,
});

function CreateSkillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const createSkill = useCreateSkill();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      const created = await createSkill.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      });
      onOpenChange(false);
      setName('');
      setDescription('');
      onCreated(created.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const canSubmit =
    name.trim() && description.trim() && !createSkill.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="新建技能">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            技能名称
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="translate-doc"
            className="font-mono text-xs"
          />
          <p className="mt-1.5 text-xs text-faint">
            字母、数字、中划线、下划线，创建后不可修改
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            技能简介
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="一句话说明这个技能做什么，智能体据此判断何时激活它"
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm placeholder:text-faint focus:border-primary/40 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
          创建后会生成一份 SKILL.md 骨架，进入编辑页可以手动改，也可以让 AI
          助手帮你补全内容和脚本。
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {createSkill.isPending ? '创建中...' : '创建并编辑'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (name: string) => void;
}) {
  const uploadSkill = useUploadSkill();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const submit = async (file: File) => {
    setError('');
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('请上传 .zip 格式的技能包');
      return;
    }
    try {
      const uploaded = await uploadSkill.mutateAsync(file);
      onOpenChange(false);
      onUploaded(uploaded.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void submit(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="上传技能">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          disabled={uploadSkill.isPending}
          className={cn(
            'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 transition-colors',
            dragging
              ? 'border-primary bg-primary-soft'
              : 'border-border-strong bg-muted/50 hover:border-primary/50 hover:bg-primary-soft/50',
          )}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FileArchive className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">
            {uploadSkill.isPending
              ? '上传中...'
              : '点击选择或拖拽 zip 压缩包到此处'}
          </p>
          <p className="mt-1 text-xs text-faint">单个文件不超过 20MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void submit(file);
              e.target.value = '';
            }}
          />
        </button>

        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="rounded-xl bg-muted/70 p-4 text-[13px] leading-relaxed text-muted-foreground">
          <p className="mb-1.5 font-medium text-foreground">技能包结构</p>
          <pre className="font-mono text-xs leading-loose">{`your-skill.zip
├── SKILL.md        # 必需，frontmatter 含 name/description
├── scripts/        # 可选，.js 脚本（沙箱执行）
└── references/     # 可选，激活时附带的参考资料`}</pre>
        </div>
      </div>
    </Dialog>
  );
}

function SkillsPage() {
  const { data: skills, isLoading } = useSkills();
  const deleteSkill = useDeleteSkill();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const openEditor = (name: string) =>
    void navigate({ to: '/skills/$skillName', params: { skillName: name } });

  return (
    <PageShell
      title="技能"
      subtitle="在线新建或上传技能包（SKILL.md + 脚本 + 参考资料），挂载给智能体按需激活"
      actions={
        <>
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" />
            上传 zip
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            新建技能
          </Button>
        </>
      }
    >
      {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

      {skills && skills.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="还没有技能"
          description="直接在线新建，或把 SKILL.md 和脚本打包成 zip 上传，即可挂载给智能体使用"
          action={
            <>
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" />
                上传 zip
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建技能
              </Button>
            </>
          }
        />
      ) : (
        <CardGrid>
          {(skills ?? []).map((skill) => (
            <div
              key={skill.id}
              onClick={() => openEditor(skill.name)}
              className="entity-card flex cursor-pointer flex-col p-5"
            >
              <div className="flex items-start gap-3">
                <EntityAvatar
                  seed={skill.name}
                  icon={<Sparkles className="h-5 w-5" />}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">
                    {skill.name}
                  </h3>
                  <p className="text-[11px] text-faint">
                    {new Date(skill.updatedAt).toLocaleString('zh-CN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                {skill.hasScripts && (
                  <span className="rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                    含脚本
                  </span>
                )}
              </div>

              <p className="mt-3 line-clamp-2 min-h-[2.6em] flex-1 text-[13px] leading-relaxed text-muted-foreground">
                {skill.description}
              </p>

              <div
                className="mt-4 flex items-center gap-1.5 border-t border-border pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="soft"
                  className="flex-1"
                  onClick={() => openEditor(skill.name)}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  编辑技能
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  title="删除"
                  className="text-faint hover:text-destructive"
                  onClick={() => {
                    if (
                      confirm(
                        `确定删除技能「${skill.name}」？已挂载的智能体会同步卸载。`,
                      )
                    ) {
                      deleteSkill.mutate(skill.name);
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

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={openEditor}
      />
      <CreateSkillDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={openEditor}
      />
    </PageShell>
  );
}
