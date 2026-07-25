import { useRef, useState, type DragEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  FileArchive,
  FileCode2,
  FileText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useDeleteSkill,
  useSkillDetail,
  useSkills,
  useUploadSkill,
} from '@/services/queries';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
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

function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      await uploadSkill.mutateAsync(file);
      onOpenChange(false);
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

function SkillDetailDialog({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const { data: skill } = useSkillDetail(name);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`技能 · ${name}`}
      className="max-w-2xl"
    >
      {skill ? (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            {skill.description}
          </p>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">
              指令内容（SKILL.md）
            </p>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed">
              {skill.content}
            </pre>
          </div>
          {skill.scripts.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">脚本</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.scripts.map((script) => (
                  <span
                    key={script}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs"
                  >
                    <FileCode2 className="h-3 w-3 text-faint" />
                    {script}
                  </span>
                ))}
              </div>
            </div>
          )}
          {skill.references.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">引用资料</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.references.map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs"
                  >
                    <FileText className="h-3 w-3 text-faint" />
                    {file}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">加载中...</p>
      )}
    </Dialog>
  );
}

function SkillsPage() {
  const { data: skills, isLoading } = useSkills();
  const deleteSkill = useDeleteSkill();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <PageShell
      title="技能"
      subtitle="上传技能压缩包（SKILL.md + 脚本 + 参考资料），挂载给智能体按需激活"
      actions={
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" />
          上传技能
        </Button>
      }
    >
      {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

      {skills && skills.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="还没有技能"
          description="把 SKILL.md 和脚本打包成 zip 上传，即可在智能体中挂载使用"
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              上传技能
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {(skills ?? []).map((skill) => (
            <div key={skill.id} className="entity-card flex flex-col p-5">
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

              <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="soft"
                  className="flex-1"
                  onClick={() => setViewing(skill.name)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  查看详情
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

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      {viewing && (
        <SkillDetailDialog name={viewing} onClose={() => setViewing(null)} />
      )}
    </PageShell>
  );
}
