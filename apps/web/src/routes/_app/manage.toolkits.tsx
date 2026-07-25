import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Settings, Wrench } from 'lucide-react';
import {
  useToolkits,
  useToolkitSettings,
  useUpdateToolkitSettings,
} from '@/services/queries';
import type { Toolkit } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Textarea } from '@/ui/input';
import {
  CardGrid,
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/toolkits')({
  component: ToolkitsPage,
});

function SettingsDialog({
  toolkit,
  onClose,
}: {
  toolkit: Toolkit;
  onClose: () => void;
}) {
  const { data: settings } = useToolkitSettings(toolkit.id, true);
  const updateSettings = useUpdateToolkitSettings();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');

  const value =
    text ?? (settings ? JSON.stringify(settings, null, 2) : '{}');

  const handleSave = async () => {
    setError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(value) as Record<string, unknown>;
    } catch {
      setError('JSON 格式错误');
      return;
    }
    try {
      await updateSettings.mutateAsync({
        toolkitId: toolkit.id,
        settings: parsed,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${toolkit.name} · 配置`}
    >
      <div className="space-y-4">
        {toolkit.settingsSchema && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">配置 Schema</p>
            <pre className="max-h-32 overflow-y-auto rounded-xl bg-muted p-3 font-mono text-xs">
              {JSON.stringify(toolkit.settingsSchema, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-[13px] font-medium">我的配置（JSON）</p>
          <Textarea
            value={value}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="font-mono text-xs"
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
            onClick={() => void handleSave()}
            disabled={updateSettings.isPending}
          >
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ToolkitsPage() {
  const { data: toolkits, isLoading } = useToolkits();
  const [configuring, setConfiguring] = useState<Toolkit | null>(null);

  return (
    <PageShell
      title="插件工具"
      subtitle="代码定义、启动时自动同步；含配置项的工具包可按用户配置"
    >
      {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

      {toolkits && toolkits.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-6 w-6" />}
          title="暂无插件工具"
          description="在 apps/api/src/toolkit/toolkits/ 下用 @toolkitId 装饰器新增工具包"
        />
      ) : (
        <CardGrid>
          {(toolkits ?? []).map((toolkit) => (
            <div key={toolkit.id} className="entity-card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <EntityAvatar
                  seed={toolkit.id}
                  icon={<Wrench className="h-5 w-5" />}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">
                    {toolkit.name}
                  </h3>
                  <p className="truncate font-mono text-[11px] text-faint">
                    {toolkit.id}
                  </p>
                </div>
                {toolkit.settingsSchema && (
                  <Button
                    size="iconSm"
                    variant="ghost"
                    title="配置"
                    onClick={() => setConfiguring(toolkit)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                {toolkit.description}
              </p>

              <div className="mt-3 flex-1 space-y-1.5">
                {toolkit.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="rounded-lg bg-muted/70 px-3 py-2"
                    title={tool.description}
                  >
                    <p className="font-mono text-xs font-medium">{tool.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-3 border-t border-border pt-3 text-xs text-faint">
                {toolkit.tools.length} 个工具
              </p>
            </div>
          ))}
        </CardGrid>
      )}

      {configuring && (
        <SettingsDialog
          toolkit={configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
    </PageShell>
  );
}
