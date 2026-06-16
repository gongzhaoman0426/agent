import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Badge } from '@/ui/components/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { Separator } from '@/ui/components/separator'
import { AlertCircle, CheckCircle2, Code2, FileCode, GitBranch, Play } from 'lucide-react'
import { useExecuteWorkflow, useWorkflows } from '../services/workflow.service'
import type { Workflow } from '../types'

export function Workflows() {
  const { data: workflows = [], isLoading: loading } = useWorkflows()
  const executeWorkflowMutation = useExecuteWorkflow()

  const [executeDialogOpen, setExecuteDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [executeInput, setExecuteInput] = useState('')
  const [executeFields, setExecuteFields] = useState<Record<string, string>>({})
  const [executeResult, setExecuteResult] = useState<any>(null)

  const availableWorkflows = workflows.filter((workflow) => !workflow.deleted).length
  const codeDefinedWorkflows = workflows.filter((workflow) => workflow.source === 'code').length

  const getStartEventFields = (workflow: Workflow | null): Record<string, string> => {
    if (!workflow?.DSL?.events) return {}
    const startEvent = workflow.DSL.events.find((event: any) => event.type === 'WORKFLOW_START')
    if (!startEvent?.data || typeof startEvent.data !== 'object') return {}
    return startEvent.data as Record<string, string>
  }

  const openExecuteDialog = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setExecuteInput('')
    setExecuteResult(null)

    const fields = getStartEventFields(workflow)
    setExecuteFields(
      Object.fromEntries(Object.keys(fields).map((key) => [key, '']))
    )
    setExecuteDialogOpen(true)
  }

  const handleExecute = async () => {
    if (!selectedWorkflow) return

    const fields = getStartEventFields(selectedWorkflow)
    const fieldKeys = Object.keys(fields)

    let input: any
    if (fieldKeys.length > 0) {
      const hasEmpty = fieldKeys.some((key) => !executeFields[key]?.trim())
      if (hasEmpty) return
      input = { ...executeFields }
    } else {
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
        },
      })

      setExecuteResult(result)
    } catch (error) {
      console.error('Failed to execute workflow:', error)
      setExecuteResult({ error: '执行失败: ' + (error as Error).message })
    }
  }

  const executeDisabled = () => {
    const fields = getStartEventFields(selectedWorkflow)
    const fieldKeys = Object.keys(fields)
    if (fieldKeys.length > 0) {
      return fieldKeys.some((key) => !executeFields[key]?.trim())
    }
    return !executeInput.trim()
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <GitBranch className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作流管理</h1>
            <p className="text-sm text-muted-foreground">后端代码定义的 DSL 工作流会自动同步到数据库</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Code2 className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{codeDefinedWorkflows}</p>
              <p className="text-xs text-muted-foreground">代码定义</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{availableWorkflows}</p>
              <p className="text-xs text-muted-foreground">可用工作流</p>
            </div>
          </div>
        </div>
      </div>

      {workflows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-violet-500/20">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500/60 to-violet-500/20" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                      <GitBranch className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{workflow.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                        {workflow.description || '暂无描述'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    代码定义
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
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

                <Button
                  className="w-full gap-1.5"
                  size="sm"
                  onClick={() => openExecuteDialog(workflow)}
                >
                  <Play className="h-3.5 w-3.5" />
                  执行工作流
                </Button>
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
            <p className="text-sm text-muted-foreground text-center max-w-md">
              在后端添加继承 BaseWorkflow 的 DSL 定义后，服务启动时会同步到这里。
            </p>
          </CardContent>
        </Card>
      )}

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
                    <Label htmlFor={`execute-field-${key}`}>{key} ({String(fields[key])})</Label>
                    <Input
                      id={`execute-field-${key}`}
                      value={executeFields[key] || ''}
                      onChange={(event) => setExecuteFields({ ...executeFields, [key]: event.target.value })}
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
                    onChange={(event) => setExecuteInput(event.target.value)}
                    placeholder='例如: {"message": "你好"} 或直接输入文本'
                    rows={4}
                  />
                </div>
              )
            })()}

            {executeResult && (
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
                onClick={() => setExecuteDialogOpen(false)}
                disabled={executeWorkflowMutation.isPending}
              >
                关闭
              </Button>
              <Button
                onClick={handleExecute}
                className="gap-1.5"
                disabled={executeWorkflowMutation.isPending || executeDisabled()}
              >
                <Play className="h-3.5 w-3.5" />
                {executeWorkflowMutation.isPending ? '执行中...' : '执行'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
