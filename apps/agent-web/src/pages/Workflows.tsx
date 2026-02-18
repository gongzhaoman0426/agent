import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Badge } from '@/ui/components/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { Separator } from '@/ui/components/separator'
import { GitBranch, Plus, Play, Trash2, Sparkles, Wand2, FileCode, CheckCircle2, AlertCircle, Loader2, XCircle } from 'lucide-react'
import { useWorkflows, useCreateWorkflow, useDeleteWorkflow, useGenerateDsl, useExecuteWorkflow, useTemporalWorkflowStatus, useTemporalWorkflowResult, useCancelTemporalWorkflow } from '../services/workflow.service'
import { useConfirmDialog } from '../hooks/use-confirm-dialog'
import type { Workflow, CreateWorkflowDto } from '../types'

export function Workflows() {
  const { data: workflows = [], isLoading: loading } = useWorkflows()
  const createWorkflowMutation = useCreateWorkflow()
  const deleteWorkflowMutation = useDeleteWorkflow()
  const generateDslMutation = useGenerateDsl()
  const executeWorkflowMutation = useExecuteWorkflow()
  const temporalResultMutation = useTemporalWorkflowResult()
  const cancelTemporalMutation = useCancelTemporalWorkflow()
  const { confirm, alert, ConfirmDialog } = useConfirmDialog()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)

  // Create workflow form
  const [createMode, setCreateMode] = useState<'natural' | 'manual'>('natural')
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('')
  const [generatedDsl, setGeneratedDsl] = useState<any>(null)
  const [formData, setFormData] = useState<CreateWorkflowDto>({
    name: '',
    description: '',
    dsl: null
  })

  // Execute workflow form
  const [executeInput, setExecuteInput] = useState('')
  const [executeFields, setExecuteFields] = useState<Record<string, string>>({})
  const [executeResult, setExecuteResult] = useState<any>(null)
  const executeEngine = 'temporal'
  const [temporalWorkflowId, setTemporalWorkflowId] = useState<string | null>(null)

  // Temporal 状态轮询
  const { data: temporalStatus } = useTemporalWorkflowStatus(temporalWorkflowId)

  // 当 Temporal 工作流完成时自动获取结果
  useEffect(() => {
    if (temporalStatus?.status === 'COMPLETED' && temporalWorkflowId) {
      temporalResultMutation.mutateAsync(temporalWorkflowId).then((result) => {
        setExecuteResult(result)
        setTemporalWorkflowId(null)
      })
    } else if (temporalStatus?.status === 'FAILED' || temporalStatus?.status === 'CANCELLED') {
      setExecuteResult({ error: `工作流${temporalStatus.status === 'FAILED' ? '执行失败' : '已取消'}` })
      setTemporalWorkflowId(null)
    }
  }, [temporalStatus?.status])

  const generateDslFromNaturalLanguage = async () => {
    if (!naturalLanguageInput.trim()) return

    try {
      const response = await generateDslMutation.mutateAsync({
        userMessage: naturalLanguageInput
      })

      setGeneratedDsl(response.dsl.data)
      setFormData({
        name: response.dsl.data.name || '',
        description: response.dsl.data.description || '',
        dsl: response.dsl.data
      })
    } catch (error) {
      console.error('Failed to generate DSL:', error)
      await alert({ title: '生成失败', description: '生成工作流失败，请检查输入或稍后重试' })
    }
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.dsl) return

    try {
      await createWorkflowMutation.mutateAsync(formData)
      setCreateDialogOpen(false)
      resetCreateForm()
    } catch (error) {
      console.error('Failed to create workflow:', error)
      await alert({ title: '创建失败', description: '创建工作流失败，请检查配置' })
    }
  }

  // Helper: extract WORKFLOW_START event data fields from DSL
  const getStartEventFields = (workflow: Workflow | null): Record<string, string> => {
    if (!workflow?.DSL?.events) return {}
    const startEvent = workflow.DSL.events.find((e: any) => e.type === 'WORKFLOW_START')
    if (!startEvent?.data || typeof startEvent.data !== 'object') return {}
    return startEvent.data as Record<string, string>
  }

  const handleExecute = async () => {
    if (!selectedWorkflow) return

    const fields = getStartEventFields(selectedWorkflow)
    const fieldKeys = Object.keys(fields)

    let input: any
    if (fieldKeys.length > 0) {
      // Build input from dynamic fields
      input = { ...executeFields }
      // Check all fields have values
      const hasEmpty = fieldKeys.some((key) => !executeFields[key]?.trim())
      if (hasEmpty) return
    } else {
      // Fallback: parse raw JSON input
      if (!executeInput.trim()) return
      try {
        input = JSON.parse(executeInput)
      } catch {
        input = { input: executeInput }
      }
    }

    try {
      const result = await executeWorkflowMutation.mutateAsync({
        id: selectedWorkflow.id,
        data: {
          input,
          context: {},
        }
      })

      if (executeEngine === 'temporal' && result.temporalWorkflowId) {
        // 异步模式：开始轮询状态
        setTemporalWorkflowId(result.temporalWorkflowId)
        setExecuteResult({ message: '工作流已提交，等待执行...', temporalWorkflowId: result.temporalWorkflowId })
      } else {
        setExecuteResult(result)
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error)
      setExecuteResult({ error: '执行失败: ' + (error as Error).message })
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '删除工作流',
      description: '确定要删除这个工作流吗？删除后无法恢复。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteWorkflowMutation.mutateAsync(id)
    } catch (error) {
      console.error('Failed to delete workflow:', error)
    }
  }

  const resetCreateForm = () => {
    setNaturalLanguageInput('')
    setGeneratedDsl(null)
    setFormData({ name: '', description: '', dsl: null })
    setCreateMode('natural')
  }

  const openExecuteDialog = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setExecuteInput('')
    setExecuteResult(null)
    // Initialize dynamic fields from DSL
    const fields = getStartEventFields(workflow)
    const initial: Record<string, string> = {}
    for (const key of Object.keys(fields)) {
      initial[key] = ''
    }
    setExecuteFields(initial)
    setTemporalWorkflowId(null)
    setExecuteDialogOpen(true)
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <GitBranch className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作流管理</h1>
            <p className="text-sm text-muted-foreground">创建和管理AI工作流，实现复杂的自动化任务</p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          创建工作流
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <GitBranch className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{workflows.length}</p>
              <p className="text-xs text-muted-foreground">工作流总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{workflows.filter(w => !w.deleted).length}</p>
              <p className="text-xs text-muted-foreground">可用工作流</p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflows Grid */}
      {workflows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-violet-500/20">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500/60 to-violet-500/20" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                      <GitBranch className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{workflow.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                        {workflow.description || '暂无描述'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {workflow.source === 'code' ? '内置工作流' : '工作流'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* DSL Preview */}
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileCode className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">工作流配置</p>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-28 overflow-y-auto leading-relaxed">
                    {JSON.stringify(workflow.DSL, null, 2)}
                  </pre>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-1.5"
                    size="sm"
                    onClick={() => openExecuteDialog(workflow)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    执行工作流
                  </Button>
                  {workflow.source !== 'code' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(workflow.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 mb-4">
              <GitBranch className="h-8 w-8 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">暂无工作流</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              创建您的第一个工作流，使用自然语言或手动配置实现自动化
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              创建工作流
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Workflow Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) resetCreateForm()
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <Sparkles className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <DialogTitle>创建工作流</DialogTitle>
                <DialogDescription>
                  使用自然语言描述或手动配置创建AI工作流
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as 'natural' | 'manual')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="natural" className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                自然语言创建
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                手动配置
              </TabsTrigger>
            </TabsList>

            <TabsContent value="natural" className="space-y-4">
              <div>
                <Label htmlFor="natural-input">描述您想要的工作流</Label>
                <Textarea
                  id="natural-input"
                  value={naturalLanguageInput}
                  onChange={(e) => setNaturalLanguageInput(e.target.value)}
                  placeholder="例如：创建一个客户服务工作流，能够自动分类客户问题并生成回复"
                  rows={4}
                />
              </div>

              <Button
                onClick={generateDslFromNaturalLanguage}
                disabled={!naturalLanguageInput.trim() || generateDslMutation.isPending}
                className="w-full gap-2"
              >
                <Wand2 className="h-4 w-4" />
                {generateDslMutation.isPending ? '生成中...' : '生成工作流'}
              </Button>

              {generatedDsl && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-xs font-medium text-muted-foreground">生成的工作流配置</p>
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto leading-relaxed">
                      {JSON.stringify(generatedDsl, null, 2)}
                    </pre>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="generated-name">工作流名称</Label>
                      <Input
                        id="generated-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="generated-description">描述</Label>
                      <Input
                        id="generated-description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manual-name">工作流名称</Label>
                  <Input
                    id="manual-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="输入工作流名称"
                  />
                </div>
                <div>
                  <Label htmlFor="manual-description">描述</Label>
                  <Input
                    id="manual-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="输入工作流描述"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="manual-dsl">DSL配置 (JSON格式)</Label>
                <Textarea
                  id="manual-dsl"
                  value={formData.dsl ? JSON.stringify(formData.dsl, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const dsl = JSON.parse(e.target.value)
                      setFormData({ ...formData, dsl })
                    } catch {
                      // Invalid JSON, keep the text for editing
                    }
                  }}
                  placeholder="输入工作流DSL配置"
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createWorkflowMutation.isPending}
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createWorkflowMutation.isPending || !formData.name || !formData.dsl}
            >
              {createWorkflowMutation.isPending ? '创建中...' : '创建工作流'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Execute Workflow Dialog */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <Play className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <DialogTitle>执行工作流</DialogTitle>
                <DialogDescription>
                  {selectedWorkflow?.name} - 输入执行参数并查看结果
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {(() => {
              const fields = getStartEventFields(selectedWorkflow)
              const fieldKeys = Object.keys(fields)
              if (fieldKeys.length > 0) {
                return fieldKeys.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`execute-field-${key}`}>{key} ({fields[key]})</Label>
                    <Input
                      id={`execute-field-${key}`}
                      value={executeFields[key] || ''}
                      onChange={(e) => setExecuteFields({ ...executeFields, [key]: e.target.value })}
                      placeholder={`请输入 ${key}`}
                    />
                  </div>
                ))
              }
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="execute-input">输入参数 (JSON格式或纯文本)</Label>
                  <Textarea
                    id="execute-input"
                    value={executeInput}
                    onChange={(e) => setExecuteInput(e.target.value)}
                    placeholder='例如: {"message": "你好"} 或直接输入文本'
                    rows={4}
                  />
                </div>
              )
            })()}

            {/* Temporal 轮询状态 */}
            {temporalWorkflowId && temporalStatus && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                    <p className="text-xs font-medium text-blue-700">
                      工作流执行中 — {temporalStatus.status}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive"
                    onClick={() => {
                      cancelTemporalMutation.mutate(temporalWorkflowId)
                      setTemporalWorkflowId(null)
                      setExecuteResult({ error: '已取消' })
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    取消
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ID: {temporalWorkflowId}
                </p>
              </div>
            )}

            {executeResult && !temporalWorkflowId && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  {executeResult.error ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  <p className="text-xs font-medium text-muted-foreground">
                    {executeResult.error ? '执行失败' : '执行结果'}
                  </p>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-muted/50 rounded-md p-2.5 leading-relaxed">
                  {JSON.stringify(executeResult, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setExecuteDialogOpen(false)
                  setTemporalWorkflowId(null)
                }}
                disabled={executeWorkflowMutation.isPending}
              >
                关闭
              </Button>
              <Button
                onClick={handleExecute}
                className="gap-1.5"
                disabled={executeWorkflowMutation.isPending || !!temporalWorkflowId || (() => {
                  const fields = getStartEventFields(selectedWorkflow)
                  const fieldKeys = Object.keys(fields)
                  if (fieldKeys.length > 0) {
                    return fieldKeys.some((key) => !executeFields[key]?.trim())
                  }
                  return !executeInput.trim()
                })()}
              >
                <Play className="h-3.5 w-3.5" />
                {executeWorkflowMutation.isPending ? '提交中...' : temporalWorkflowId ? '执行中...' : '执行'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  )
}
