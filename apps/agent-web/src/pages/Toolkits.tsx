import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Badge } from '@/ui/components/badge'
import { Separator } from '@/ui/components/separator'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Wrench, Package, ChevronDown, ChevronRight, Code, Settings } from 'lucide-react'
import { apiClient } from '../lib/api'
import type { Toolkit } from '../types'

export function Toolkits() {
  const [toolkits, setToolkits] = useState<Toolkit[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())

  // 配置弹窗状态
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsToolkit, setSettingsToolkit] = useState<Toolkit | null>(null)
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  useEffect(() => {
    fetchToolkits()
  }, [])

  const fetchToolkits = async () => {
    try {
      const data = await apiClient.getToolkits()
      setToolkits(data)
    } catch (error) {
      console.error('Failed to fetch toolkits:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleToolSchema = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }

  // 判断 toolkit 是否有用户可配置的 settings（排除空对象）
  const hasSettings = (toolkit: Toolkit) => {
    return toolkit.settings && Object.keys(toolkit.settings).length > 0
  }

  const openSettingsDialog = async (toolkit: Toolkit) => {
    setSettingsToolkit(toolkit)
    setSettingsDialogOpen(true)
    setSettingsLoading(true)
    try {
      const currentSettings = await apiClient.getToolkitSettings(toolkit.id)
      // 用 toolkit.settings 的 key 作为表单字段，合并已保存的用户值
      const formValues: Record<string, string> = {}
      for (const key of Object.keys(toolkit.settings || {})) {
        formValues[key] = currentSettings[key] != null ? String(currentSettings[key]) : ''
      }
      setSettingsForm(formValues)
    } catch (error) {
      console.error('Failed to load toolkit settings:', error)
      const formValues: Record<string, string> = {}
      for (const key of Object.keys(toolkit.settings || {})) {
        formValues[key] = ''
      }
      setSettingsForm(formValues)
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settingsToolkit) return
    setSettingsSaving(true)
    try {
      await apiClient.updateToolkitSettings(settingsToolkit.id, settingsForm)
      setSettingsDialogOpen(false)
    } catch (error) {
      console.error('Failed to save toolkit settings:', error)
    } finally {
      setSettingsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  const totalTools = toolkits.reduce((total, toolkit) => total + toolkit.tools.length, 0)
  const availableToolkits = toolkits.filter(toolkit => !toolkit.deleted).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Wrench className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工具包管理</h1>
            <p className="text-sm text-muted-foreground">查看系统中可用的工具包和工具</p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Package className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{toolkits.length}</p>
              <p className="text-xs text-muted-foreground">工具包总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Wrench className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalTools}</p>
              <p className="text-xs text-muted-foreground">工具总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Package className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{availableToolkits}</p>
              <p className="text-xs text-muted-foreground">可用工具包</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolkits Grid */}
      {toolkits.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {toolkits.map((toolkit) => (
            <Card key={toolkit.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-amber-500/20">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500/60 to-amber-500/20" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Wrench className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{toolkit.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                        {toolkit.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasSettings(toolkit) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSettingsDialog(toolkit)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        配置
                      </Button>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {toolkit.tools.length} 个工具
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Tools List */}
                <div className="space-y-1.5">
                  {toolkit.tools.map((tool: any, index: number) => (
                    <div key={tool.id}>
                      <div
                        className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => tool.schema && toggleToolSchema(tool.id)}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                          <Code className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{tool.name}</span>
                            {tool.schema && (
                              expandedTools.has(tool.id)
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                      </div>

                      {/* Expanded Schema */}
                      {tool.schema && expandedTools.has(tool.id) && (
                        <div className="ml-9.5 mt-1 mb-2 p-2.5 bg-muted/50 rounded-lg border border-border/50">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">参数定义</p>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                            {JSON.stringify(tool.schema, null, 2)}
                          </pre>
                        </div>
                      )}

                      {index < toolkit.tools.length - 1 && (
                        <Separator className="my-1" />
                      )}
                    </div>
                  ))}
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 mb-4">
              <Wrench className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">暂无工具包</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              系统中还没有可用的工具包
            </p>
          </CardContent>
        </Card>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{settingsToolkit?.name} - 配置</DialogTitle>
            <DialogDescription>
              配置工具包的参数，所有使用此工具包的智能体将共享这些设置。
            </DialogDescription>
          </DialogHeader>
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {settingsToolkit && Object.keys(settingsToolkit.settings || {}).map((key) => (
                <div key={key} className="space-y-2">
                  <Label>{key}</Label>
                  <Input
                    value={settingsForm[key] ?? ''}
                    placeholder={`请输入 ${key}`}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveSettings} disabled={settingsLoading || settingsSaving}>
              {settingsSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
