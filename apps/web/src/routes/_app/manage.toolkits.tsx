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
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`${toolkit.name} · 配置`}>
      <div className="space-y-3">
        {toolkit.settingsSchema && (
          <div>
            <p className="mb-1 text-sm font-medium">配置 Schema</p>
            <pre className="max-h-32 overflow-y-auto rounded-lg bg-muted p-2 text-xs">
              {JSON.stringify(toolkit.settingsSchema, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-medium">我的配置（JSON）</p>
          <Textarea
            value={value}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={updateSettings.isPending}>
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
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">工具包</h1>
          <p className="text-sm text-muted-foreground">
            代码定义、启动时自动同步；含配置项的工具包可按用户配置
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}

        <div className="space-y-3">
          {(toolkits ?? []).map((toolkit) => (
            <div
              key={toolkit.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">{toolkit.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {toolkit.id}
                  </span>
                </div>
                {toolkit.settingsSchema && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfiguring(toolkit)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    配置
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {toolkit.description}
              </p>
              <div className="mt-3 space-y-1.5">
                {toolkit.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="rounded-lg bg-muted/60 px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono font-medium">{tool.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {tool.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {configuring && (
        <SettingsDialog
          toolkit={configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}
