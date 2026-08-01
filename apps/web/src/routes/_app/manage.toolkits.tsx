import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, RefreshCw, Settings, Trash2, Wrench } from 'lucide-react';
import {
  useCreateMcpServer,
  useDeleteMcpServer,
  useMcpServers,
  useRefreshMcpServer,
  useToolkits,
  useToolkitSettings,
  useUpdateToolkitSettings,
} from '@/services/queries';
import type { McpServer, Toolkit } from '@/types';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Input } from '@/ui/input';
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
  const { data: settings, isLoading } = useToolkitSettings(toolkit.id, true);
  const updateSettings = useUpdateToolkitSettings();
  const fields = toolkit.settingsFields ?? [];
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings && !values) {
      setValues(
        Object.fromEntries(
          fields.map((field) => [field.key, settings[field.key] ?? '']),
        ),
      );
    }
  }, [settings, values, fields]);

  const form = values ?? {};
  const missing = fields.filter(
    (field) => field.required && !form[field.key]?.trim(),
  );

  const handleSave = async () => {
    setError('');
    try {
      await updateSettings.mutateAsync({
        toolkitId: toolkit.id,
        settings: form,
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
      {isLoading || !values ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          加载中...
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-[13px] font-medium">
                {field.label}
                {field.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </label>
              {field.description && (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {field.description}
                </p>
              )}
              <Input
                type={field.secret ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={form[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...(prev ?? {}),
                    [field.key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}

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
              disabled={updateSettings.isPending || missing.length > 0}
            >
              {updateSettings.isPending ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function AddMcpDialog({ onClose }: { onClose: () => void }) {
  const createMcp = useCreateMcpServer();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://127.0.0.1:9000/mcp');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await createMcp.mutateAsync({ name: name.trim(), url: url.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="添加远程 MCP"
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          仅支持 Minimal HTTP MCP（
          <code className="text-xs">POST /mcp</code>：initialize / tools/list /
          tools/call）。地址须为 API 进程可访问的 URL；若 MCP 只监听
          127.0.0.1，请与 API 同机部署。
        </p>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">名称</label>
          <Input
            placeholder="如 知识库"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">MCP URL</label>
          <Input
            placeholder="http://127.0.0.1:9000/mcp"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
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
            disabled={createMcp.isPending || !name.trim() || !url.trim()}
          >
            {createMcp.isPending ? '连接中...' : '添加并拉取工具'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BuiltinCard({
  toolkit,
  onConfigure,
}: {
  toolkit: Toolkit;
  onConfigure: () => void;
}) {
  return (
    <div className="entity-card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <EntityAvatar seed={toolkit.id} icon={<Wrench className="h-5 w-5" />} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{toolkit.name}</h3>
          <p className="truncate font-mono text-[11px] text-faint">
            {toolkit.id}
          </p>
        </div>
        {(toolkit.settingsFields?.length ?? 0) > 0 && (
          <Button
            size="iconSm"
            variant="ghost"
            title="配置"
            onClick={onConfigure}
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
        {toolkit.settingsReady === false ? ' · 未完成配置' : ''}
      </p>
    </div>
  );
}

function McpCard({
  server,
  refreshing,
  onRefresh,
  onDelete,
}: {
  server: McpServer;
  refreshing: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="entity-card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <EntityAvatar seed={server.id} icon={<Wrench className="h-5 w-5" />} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{server.name}</h3>
          <p className="truncate font-mono text-[11px] text-faint">
            {server.toolkitId}
          </p>
        </div>
        <Button
          size="iconSm"
          variant="ghost"
          title="刷新工具"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="iconSm"
          variant="ghost"
          title="删除"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="mt-3 truncate text-[13px] text-muted-foreground">
        {server.url}
      </p>

      <div className="mt-3 flex-1 space-y-1.5">
        {server.tools.map((tool) => (
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
        {server.toolCount} 个工具
        {server.ready ? ' · 可挂载' : ' · 需刷新'}
        {server.lastError ? ` · ${server.lastError}` : ''}
      </p>
    </div>
  );
}

function ToolkitsPage() {
  const { data: toolkits, isLoading } = useToolkits();
  const { data: mcpServers, isLoading: mcpLoading } = useMcpServers();
  const refreshMcp = useRefreshMcpServer();
  const deleteMcp = useDeleteMcpServer();
  const [configuring, setConfiguring] = useState<Toolkit | null>(null);
  const [addingMcp, setAddingMcp] = useState(false);
  const [mcpError, setMcpError] = useState('');

  const builtin = useMemo(
    () => (toolkits ?? []).filter((item) => item.source !== 'mcp'),
    [toolkits],
  );

  const handleRefresh = async (id: string) => {
    setMcpError('');
    try {
      await refreshMcp.mutateAsync(id);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : '刷新失败');
    }
  };

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`确定删除 MCP「${server.name}」？已挂载的 Agent 将自动卸下。`)) {
      return;
    }
    setMcpError('');
    try {
      await deleteMcp.mutateAsync(server.id);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <PageShell
      title="插件工具"
      subtitle="内置工具包启动时同步；远程 MCP 填地址后自动拉取 tools/list"
      actions={
        <Button size="sm" onClick={() => setAddingMcp(true)}>
          <Plus className="h-3.5 w-3.5" />
          添加 MCP
        </Button>
      }
    >
      {(isLoading || mcpLoading) && (
        <p className="text-sm text-muted-foreground">加载中...</p>
      )}

      {mcpError && (
        <p className="mb-4 rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          {mcpError}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-semibold text-muted-foreground">
          内置工具包
        </h2>
        {builtin.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title="暂无内置工具包"
            description="在 apps/api/src/toolkit/toolkits/ 下用 @toolkitId 装饰器新增"
          />
        ) : (
          <CardGrid>
            {builtin.map((toolkit) => (
              <BuiltinCard
                key={toolkit.id}
                toolkit={toolkit}
                onConfigure={() => setConfiguring(toolkit)}
              />
            ))}
          </CardGrid>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-muted-foreground">
          远程 MCP（Minimal HTTP）
        </h2>
        {(mcpServers ?? []).length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-6 w-6" />}
            title="尚未添加远程 MCP"
            description="点击右上角「添加 MCP」，填写如 http://127.0.0.1:9000/mcp 的端点"
          />
        ) : (
          <CardGrid>
            {(mcpServers ?? []).map((server) => (
              <McpCard
                key={server.id}
                server={server}
                refreshing={refreshMcp.isPending}
                onRefresh={() => void handleRefresh(server.id)}
                onDelete={() => void handleDelete(server)}
              />
            ))}
          </CardGrid>
        )}
      </section>

      {configuring && (
        <SettingsDialog
          toolkit={configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
      {addingMcp && <AddMcpDialog onClose={() => setAddingMcp(false)} />}
    </PageShell>
  );
}
