import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Badge } from '@/ui/components/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/ui/components/tabs'
import { Bot, Plus, MessageSquare, Trash2, Wrench, BookOpen, Sparkles, ChevronRight, ChevronLeft, Check, Pencil, GitBranch, Code, Copy, CheckCheck } from 'lucide-react'
import { useAgents, useCreateAgent, useDeleteAgent, useUpdateAgent } from '../services/agent.service'
import { useToolkits } from '../services/toolkit.service'
import { useKnowledgeBases } from '../services/knowledge-base.service'
import { useWorkflows } from '../services/workflow.service'
import { useConfirmDialog } from '../hooks/use-confirm-dialog'
import type { CreateAgentDto } from '../types'

const STEPS = [
  { id: 0, title: '基本信息', description: '名称、描述和提示词' },
  { id: 1, title: '工具包', description: '选择功能工具' },
  { id: 2, title: '工作流', description: '绑定可用工作流' },
  { id: 3, title: '知识库', description: '关联知识文档' },
  { id: 4, title: '确认创建', description: '检查并提交' },
]

const initialFormData: CreateAgentDto = {
  name: '',
  description: '',
  prompt: '',
  options: {},
  toolkits: [],
  knowledgeBases: [],
  workflows: []
}

export function Agents() {
  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const { data: toolkits = [], isLoading: toolkitsLoading } = useToolkits()
  const { data: knowledgeBases = [], isLoading: kbLoading } = useKnowledgeBases()
  const { data: workflows = [], isLoading: wfLoading } = useWorkflows()
  const createAgentMutation = useCreateAgent()
  const updateAgentMutation = useUpdateAgent()
  const deleteAgentMutation = useDeleteAgent()
  const { confirm, alert, ConfirmDialog } = useConfirmDialog()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<CreateAgentDto>({ ...initialFormData })
  const [apiDialogAgent, setApiDialogAgent] = useState<{ id: string; name: string } | null>(null)
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  const loading = agentsLoading || toolkitsLoading || kbLoading || wfLoading

  const handleCopy = (text: string, blockId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedBlock(blockId)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  const CodeBlock = ({ code, id }: { code: string; id: string }) => (
    <div className="relative group/code">
      <button
        type="button"
        onClick={() => handleCopy(code, id)}
        className="absolute right-2 top-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground opacity-0 group-hover/code:opacity-100 transition-opacity"
      >
        {copiedBlock === id ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="rounded-lg bg-muted/50 border p-3 text-xs leading-relaxed overflow-x-auto"><code>{code}</code></pre>
    </div>
  )

  const canGoNext = () => {
    if (step === 0) return !!(formData.name?.trim() && formData.prompt?.trim())
    return true
  }

  const handleNext = () => {
    if (step < STEPS.length - 1 && canGoNext()) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.prompt) return
    try {
      await createAgentMutation.mutateAsync(formData)
      closeDialog()
    } catch (error) {
      console.error('Failed to create agent:', error)
    }
  }

  const handleUpdate = async () => {
    if (!editingAgentId || !formData.name || !formData.prompt) return
    try {
      await updateAgentMutation.mutateAsync({ id: editingAgentId, data: formData })
      closeDialog()
    } catch (error) {
      console.error('Failed to update agent:', error)
    }
  }

  const openDialog = () => {
    setEditingAgentId(null)
    setFormData({ ...initialFormData })
    setStep(0)
    setCreateDialogOpen(true)
  }

  const openEditDialog = (agent: any) => {
    setEditingAgentId(agent.id)
    setFormData({
      name: agent.name,
      description: agent.description || '',
      prompt: agent.prompt,
      options: agent.options || {},
      toolkits: agent.agentToolkits?.map((at: any) => ({ toolkitId: at.toolkit.id, settings: at.settings })) || [],
      knowledgeBases: agent.agentKnowledgeBases?.map((akb: any) => akb.knowledgeBase.id) || [],
      workflows: agent.agentWorkflows?.map((aw: any) => aw.workflow.id) || [],
    })
    setStep(0)
    setCreateDialogOpen(true)
  }

  const closeDialog = () => {
    setCreateDialogOpen(false)
    setEditingAgentId(null)
    setStep(0)
    setFormData({ ...initialFormData })
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '删除智能体',
      description: '确定要删除这个智能体吗？删除后无法恢复。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await deleteAgentMutation.mutateAsync(id)
    } catch (error) {
      console.error('删除智能体失败:', error)
      await alert({
        title: '删除失败',
        description: (error as Error).message,
      })
    }
  }

  // --- helpers for summary ---
  const selectedToolkitNames = toolkits
    .filter((tk) => formData.toolkits?.some((t: any) => t.toolkitId === tk.id))
    .map((tk) => tk.name)

  const selectedKbNames = knowledgeBases
    .filter((kb: any) => formData.knowledgeBases?.includes(kb.id))
    .map((kb: any) => kb.name)

  const selectedWorkflowNames = (workflows as any[])
    .filter((wf: any) => formData.workflows?.includes(wf.id))
    .map((wf: any) => wf.name)

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
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">智能体</h1>
              <p className="text-sm text-muted-foreground">创建和管理您的AI智能体</p>
            </div>
          </div>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          创建智能体
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Bot className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{agents.length}</p>
              <p className="text-xs text-muted-foreground">智能体总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Wrench className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{toolkits.length}</p>
              <p className="text-xs text-muted-foreground">可用工具包</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{knowledgeBases.length}</p>
              <p className="text-xs text-muted-foreground">知识库数量</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      {agents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <Card key={agent.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-primary/20">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 to-primary/20" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                        {agent.description || '暂无描述'}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">提示词</p>
                  <p className="text-xs leading-relaxed line-clamp-2">
                    {agent.prompt.length > 100
                      ? `${agent.prompt.substring(0, 100)}...`
                      : agent.prompt
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  {agent.agentToolkits && agent.agentToolkits.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                      {agent.agentToolkits.map((at: any) => (
                        <Badge key={at.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {at.toolkit.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {agent.agentKnowledgeBases && agent.agentKnowledgeBases.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                      {agent.agentKnowledgeBases.map((akb: any) => (
                        <Badge key={akb.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                          {akb.knowledgeBase.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {agent.agentWorkflows && agent.agentWorkflows.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                      {agent.agentWorkflows.map((aw: any) => (
                        <Badge key={aw.id} className="text-[10px] px-1.5 py-0 h-5 bg-violet-500/10 text-violet-700 border-violet-500/20 hover:bg-violet-500/20" variant="outline">
                          {aw.workflow.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Link to={`/?agent=${agent.id}`} className="flex-1">
                    <Button className="w-full gap-1.5" size="sm" variant="default">
                      <MessageSquare className="h-3.5 w-3.5" />
                      对话测试
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => setApiDialogAgent({ id: agent.id, name: agent.name })}
                  >
                    <Code className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => openEditDialog(agent)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(agent.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">暂无智能体</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              创建您的第一个智能体，配置工具包和知识库，开始智能对话
            </p>
            <Button onClick={openDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              创建智能体
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Agent Dialog - Stepper */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Dialog Header */}
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>{editingAgentId ? '编辑智能体' : '创建智能体'}</DialogTitle>
                  <DialogDescription>
                    {STEPS[step]?.description}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Stepper Indicator */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-0.5">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => { if (i < step || (i > step && canGoNext())) setStep(i) }}
                    disabled={i > step && !canGoNext()}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs transition-colors w-full min-w-0',
                      i === step
                        ? 'bg-primary/10 text-primary font-medium'
                        : i < step
                          ? 'text-muted-foreground hover:bg-muted/50 cursor-pointer'
                          : 'text-muted-foreground/50'
                    )}
                  >
                    <div className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      i === step
                        ? 'bg-primary text-primary-foreground'
                        : i < step
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground/50'
                    )}>
                      {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                    <span className="truncate hidden sm:inline">{s.title}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      'h-px w-3 shrink-0',
                      i < step ? 'bg-primary/30' : 'bg-border'
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[300px]">
            {/* Step 0: 基本信息 */}
            {step === 0 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name">名称 <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：客服助手、代码审查员"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">描述</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="简要描述智能体的用途"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prompt">系统提示词 <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="prompt"
                    value={formData.prompt}
                    onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                    placeholder="定义智能体的角色、行为和能力边界..."
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    提示词决定了智能体的核心行为，请尽量详细描述
                  </p>
                </div>
              </div>
            )}

            {/* Step 1: 工具包 */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    为智能体选择所需的工具包，赋予不同的功能能力。此步骤可选。
                  </p>
                </div>
                {toolkits.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {toolkits.map((toolkit) => {
                      const isSelected = formData.toolkits?.some((t: any) => t.toolkitId === toolkit.id)
                      return (
                        <label
                          key={toolkit.id}
                          htmlFor={`toolkit-${toolkit.id}`}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                            isSelected
                              ? 'border-primary/40 bg-primary/5'
                              : 'border-border hover:border-primary/20 hover:bg-muted/30'
                          )}
                        >
                          <input
                            type="checkbox"
                            id={`toolkit-${toolkit.id}`}
                            checked={!!isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  toolkits: [...(formData.toolkits || []), { toolkitId: toolkit.id }]
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  toolkits: formData.toolkits?.filter((t: any) => t.toolkitId !== toolkit.id) || []
                                })
                              }
                            }}
                            className="mt-0.5 accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{toolkit.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {toolkit.tools.length} 工具
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {toolkit.description}
                            </p>
                            {toolkit.tools && toolkit.tools.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {toolkit.tools.slice(0, 4).map((tool: any) => (
                                  <Badge key={tool.id} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                    {tool.name}
                                  </Badge>
                                ))}
                                {toolkit.tools.length > 4 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                    +{toolkit.tools.length - 4}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无可用的工具包</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: 工作流 */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    绑定工作流让智能体可以发现和执行自动化流程。此步骤可选。
                  </p>
                </div>
                {(workflows as any[]).length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {(workflows as any[]).map((wf: any) => {
                      const isSelected = formData.workflows?.includes(wf.id)
                      return (
                        <label
                          key={wf.id}
                          htmlFor={`wf-${wf.id}`}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                            isSelected
                              ? 'border-violet-500/40 bg-violet-500/5'
                              : 'border-border hover:border-violet-500/20 hover:bg-muted/30'
                          )}
                        >
                          <input
                            type="checkbox"
                            id={`wf-${wf.id}`}
                            checked={!!isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  workflows: [...(formData.workflows || []), wf.id]
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  workflows: formData.workflows?.filter((id: string) => id !== wf.id) || []
                                })
                              }
                            }}
                            className="mt-0.5 accent-violet-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{wf.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {wf.description || '暂无描述'}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无可用的工作流</p>
                    <p className="text-xs mt-1">
                      前往 <Link to="/manage/workflows" className="text-primary hover:underline">工作流管理</Link> 创建
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: 知识库 */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    关联知识库为智能体提供专业领域知识支持。此步骤可选。
                  </p>
                </div>
                {knowledgeBases.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5">
                    {knowledgeBases.map((kb: any) => {
                      const isSelected = formData.knowledgeBases?.includes(kb.id)
                      return (
                        <label
                          key={kb.id}
                          htmlFor={`kb-${kb.id}`}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                            isSelected
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-border hover:border-emerald-500/20 hover:bg-muted/30'
                          )}
                        >
                          <input
                            type="checkbox"
                            id={`kb-${kb.id}`}
                            checked={!!isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  knowledgeBases: [...(formData.knowledgeBases || []), kb.id]
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  knowledgeBases: formData.knowledgeBases?.filter((id: string) => id !== kb.id) || []
                                })
                              }
                            }}
                            className="mt-0.5 accent-emerald-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{kb.name}</span>
                              {kb.files && kb.files.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                  {kb.files.length} 文件
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {kb.description || '暂无描述'}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无可用的知识库</p>
                    <p className="text-xs mt-1">
                      前往 <Link to="/manage/knowledge-bases" className="text-primary hover:underline">知识库管理</Link> 创建
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: 确认 */}
            {step === 4 && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">请确认以下配置信息，然后点击创建。</p>

                <div className="space-y-4">
                  {/* 基本信息 */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">基本信息</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-y-2 gap-x-3 text-sm">
                      <span className="text-muted-foreground">名称</span>
                      <span className="font-medium">{formData.name}</span>
                      <span className="text-muted-foreground">描述</span>
                      <span>{formData.description || '—'}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">提示词</span>
                      <div className="mt-1 rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed max-h-24 overflow-y-auto">
                        {formData.prompt}
                      </div>
                    </div>
                  </div>

                  {/* 工具包 */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">工具包</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                        {selectedToolkitNames.length} 个
                      </Badge>
                    </div>
                    {selectedToolkitNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedToolkitNames.map((name) => (
                          <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">未选择工具包</p>
                    )}
                  </div>

                  {/* 工作流 */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium">工作流</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                        {selectedWorkflowNames.length} 个
                      </Badge>
                    </div>
                    {selectedWorkflowNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedWorkflowNames.map((name) => (
                          <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">未选择工作流</p>
                    )}
                  </div>

                  {/* 知识库 */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">知识库</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                        {selectedKbNames.length} 个
                      </Badge>
                    </div>
                    {selectedKbNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedKbNames.map((name) => (
                          <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">未选择知识库</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
                  <ChevronLeft className="h-4 w-4" />
                  上一步
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={closeDialog} disabled={createAgentMutation.isPending || updateAgentMutation.isPending}>
                取消
              </Button>
              {step < STEPS.length - 1 ? (
                <Button size="sm" onClick={handleNext} disabled={!canGoNext()} className="gap-1.5">
                  下一步
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : editingAgentId ? (
                <Button size="sm" onClick={handleUpdate} disabled={updateAgentMutation.isPending} className="gap-1.5">
                  {updateAgentMutation.isPending ? '保存中...' : '保存修改'}
                  {!updateAgentMutation.isPending && <Check className="h-4 w-4" />}
                </Button>
              ) : (
                <Button size="sm" onClick={handleCreate} disabled={createAgentMutation.isPending} className="gap-1.5">
                  {createAgentMutation.isPending ? '创建中...' : '创建智能体'}
                  {!createAgentMutation.isPending && <Check className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API 接入对话框 */}
      <Dialog open={!!apiDialogAgent} onOpenChange={(open) => { if (!open) setApiDialogAgent(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Code className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>API 接入</DialogTitle>
                  <DialogDescription>
                    {apiDialogAgent?.name} - Chat 接口调用方式
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          <Separator />
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {apiDialogAgent && (
              <div className="space-y-6">
                {/* 接口信息 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">接口地址</h3>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="default" className="shrink-0">POST</Badge>
                    <code className="flex-1 rounded-md bg-muted/50 border px-3 py-1.5 text-xs break-all">
                      {`http://localhost:3001/api/agents/${apiDialogAgent.id}/chat`}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="shrink-0 bg-emerald-600">POST (SSE)</Badge>
                    <code className="flex-1 rounded-md bg-muted/50 border px-3 py-1.5 text-xs break-all">
                      {`http://localhost:3001/api/agents/${apiDialogAgent.id}/chat/stream`}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">流式接口返回 Server-Sent Events，逐字输出回复内容</p>
                </div>

                {/* 请求参数 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">请求参数</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium">字段</th>
                          <th className="text-left px-3 py-2 font-medium">类型</th>
                          <th className="text-left px-3 py-2 font-medium">必填</th>
                          <th className="text-left px-3 py-2 font-medium">说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">message</td>
                          <td className="px-3 py-2 text-muted-foreground">string</td>
                          <td className="px-3 py-2"><Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">必填</Badge></td>
                          <td className="px-3 py-2 text-muted-foreground">用户发送的消息内容</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">sessionId</td>
                          <td className="px-3 py-2 text-muted-foreground">string</td>
                          <td className="px-3 py-2"><Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">必填</Badge></td>
                          <td className="px-3 py-2 text-muted-foreground">会话 ID，同一会话使用相同 ID 以保持上下文</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">context</td>
                          <td className="px-3 py-2 text-muted-foreground">object</td>
                          <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">可选</Badge></td>
                          <td className="px-3 py-2 text-muted-foreground">上下文信息，自定义键值对</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">generateTitle</td>
                          <td className="px-3 py-2 text-muted-foreground">boolean</td>
                          <td className="px-3 py-2"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">可选</Badge></td>
                          <td className="px-3 py-2 text-muted-foreground">是否生成对话标题（首次对话时使用）</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 代码示例 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">代码示例（普通请求）</h3>
                  <Tabs defaultValue="curl">
                    <TabsList>
                      <TabsTrigger value="curl">cURL</TabsTrigger>
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                      <TabsTrigger value="python">Python</TabsTrigger>
                    </TabsList>
                    <TabsContent value="curl">
                      <CodeBlock id="curl" code={`curl -X POST http://localhost:3001/api/agents/${apiDialogAgent.id}/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "你好，请介绍一下你自己",
    "sessionId": "your-session-id",
    "generateTitle": true
  }'`} />
                    </TabsContent>
                    <TabsContent value="javascript">
                      <CodeBlock id="javascript" code={`const response = await fetch(
  "http://localhost:3001/api/agents/${apiDialogAgent.id}/chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "你好，请介绍一下你自己",
      sessionId: crypto.randomUUID(),
      generateTitle: true,
    }),
  }
);
const data = await response.json();
console.log(data.response);`} />
                    </TabsContent>
                    <TabsContent value="python">
                      <CodeBlock id="python" code={`import requests, uuid

response = requests.post(
    "http://localhost:3001/api/agents/${apiDialogAgent.id}/chat",
    json={
        "message": "你好，请介绍一下你自己",
        "sessionId": str(uuid.uuid4()),
        "generateTitle": True,
    },
)
data = response.json()
print(data["response"])`} />
                    </TabsContent>
                  </Tabs>
                </div>

                {/* 流式代码示例 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">代码示例（SSE 流式请求）</h3>
                  <Tabs defaultValue="curl-stream">
                    <TabsList>
                      <TabsTrigger value="curl-stream">cURL</TabsTrigger>
                      <TabsTrigger value="javascript-stream">JavaScript</TabsTrigger>
                      <TabsTrigger value="python-stream">Python</TabsTrigger>
                    </TabsList>
                    <TabsContent value="curl-stream">
                      <CodeBlock id="curl-stream" code={`curl -N -X POST http://localhost:3001/api/agents/${apiDialogAgent.id}/chat/stream \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "你好，请介绍一下你自己",
    "sessionId": "your-session-id",
    "generateTitle": true
  }'`} />
                    </TabsContent>
                    <TabsContent value="javascript-stream">
                      <CodeBlock id="javascript-stream" code={`const res = await fetch(
  "http://localhost:3001/api/agents/${apiDialogAgent.id}/chat/stream",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "你好，请介绍一下你自己",
      sessionId: crypto.randomUUID(),
      generateTitle: true,
    }),
  }
);
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop();
  let eventName = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7);
    else if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      if (eventName === "delta") process.stdout.write(data.delta);
      if (eventName === "done") console.log("\\n完成:", data);
      eventName = "";
    }
  }
}`} />
                    </TabsContent>
                    <TabsContent value="python-stream">
                      <CodeBlock id="python-stream" code={`import requests, json, uuid

response = requests.post(
    "http://localhost:3001/api/agents/${apiDialogAgent.id}/chat/stream",
    json={
        "message": "你好，请介绍一下你自己",
        "sessionId": str(uuid.uuid4()),
        "generateTitle": True,
    },
    stream=True,
)
event_name = ""
for line in response.iter_lines(decode_unicode=True):
    if line.startswith("event: "):
        event_name = line[7:]
    elif line.startswith("data: "):
        data = json.loads(line[6:])
        if event_name == "delta":
            print(data["delta"], end="", flush=True)
        elif event_name == "done":
            print("\\n完成:", data)
        event_name = ""`} />
                    </TabsContent>
                  </Tabs>
                </div>

                {/* 响应示例 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">响应示例</h3>
                  <CodeBlock id="response" code={`{
  "agentId": "${apiDialogAgent.id}",
  "agentName": "${apiDialogAgent.name}",
  "userMessage": "你好，请介绍一下你自己",
  "response": "你好！我是${apiDialogAgent.name}...",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "context": {},
  "title": "自我介绍"
}`} />
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium">字段</th>
                          <th className="text-left px-3 py-2 font-medium">说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">response</td>
                          <td className="px-3 py-2 text-muted-foreground">智能体的回复内容</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">agentId</td>
                          <td className="px-3 py-2 text-muted-foreground">智能体 ID</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">agentName</td>
                          <td className="px-3 py-2 text-muted-foreground">智能体名称</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">userMessage</td>
                          <td className="px-3 py-2 text-muted-foreground">用户发送的原始消息</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">timestamp</td>
                          <td className="px-3 py-2 text-muted-foreground">响应时间戳</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">title</td>
                          <td className="px-3 py-2 text-muted-foreground">对话标题（仅当 generateTitle 为 true 时返回）</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  )
}
