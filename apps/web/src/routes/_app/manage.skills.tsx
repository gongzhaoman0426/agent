import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { FileText, Sparkles } from 'lucide-react';
import { useSkillDetail, useSkills } from '@/services/queries';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';

export const Route = createFileRoute('/_app/manage/skills')({
  component: SkillsPage,
});

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
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{skill.description}</p>
          <div>
            <p className="mb-1 text-sm font-medium">指令内容（SKILL.md）</p>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed">
              {skill.content}
            </pre>
          </div>
          {skill.scripts.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">脚本</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.scripts.map((script) => (
                  <span
                    key={script}
                    className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    {script}
                  </span>
                ))}
              </div>
            </div>
          )}
          {skill.references.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">引用资料</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.references.map((file) => (
                  <span
                    key={file}
                    className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs"
                  >
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
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">技能</h1>
          <p className="text-sm text-muted-foreground">
            标准文件形式（apps/api/skills/&lt;name&gt;/SKILL.md），启动时自动加载
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {(skills ?? []).map((skill) => (
            <div
              key={skill.name}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="font-medium">{skill.name}</h3>
                {skill.hasScripts && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    含脚本
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {skill.description}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setViewing(skill.name)}
              >
                <FileText className="h-3.5 w-3.5" />
                查看详情
              </Button>
            </div>
          ))}
        </div>

        {skills && skills.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            暂无技能。在 apps/api/skills/ 下按 &lt;name&gt;/SKILL.md 结构添加后重启服务。
          </div>
        )}
      </div>

      {viewing && (
        <SkillDetailDialog name={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
