import { useState, type Dispatch, type SetStateAction } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Badge } from '@/ui/components/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { BookOpen, Plus, Trash2, Upload, FileText, Clock, GraduationCap, CheckCircle2, Loader2, AlertCircle, File, Pencil } from 'lucide-react'
import {
  useKnowledgeBases,
  useCreateKnowledgeBase,
  useUpdateKnowledgeBase,
  useDeleteKnowledgeBase,
  useUploadFileToKnowledgeBase,
  useTrainKnowledgeBaseFile,
  useDeleteKnowledgeBaseFile
} from '../services/knowledge-base.service'
import { useConfirmDialog } from '../hooks/use-confirm-dialog'
import type { CreateKnowledgeBaseDto, KnowledgeBase, KnowledgeBaseFile } from '../types'

const defaultStatusCfg = { label: '待处理', icon: Clock, color: 'text-amber-500', badgeVariant: 'outline' as const }

const fileStatusConfig = {
  PROCESSED: { label: '已完成', icon: CheckCircle2, color: 'text-emerald-500', badgeVariant: 'default' as const },
  PROCESSING: { label: '处理中', icon: Loader2, color: 'text-blue-500', badgeVariant: 'secondary' as const },
  FAILED: { label: '失败', icon: AlertCircle, color: 'text-destructive', badgeVariant: 'destructive' as const },
  PENDING: { label: '待处理', icon: Clock, color: 'text-amber-500', badgeVariant: 'outline' as const },
}

function getStatusCfg(status: string) {
  return fileStatusConfig[status as keyof typeof fileStatusConfig] ?? defaultStatusCfg
}

export function KnowledgeBases() {
  const { data: knowledgeBases = [], isLoading } = useKnowledgeBases()
  const createKnowledgeBaseMutation = useCreateKnowledgeBase()
  const updateKnowledgeBaseMutation = useUpdateKnowledgeBase()
  const deleteKnowledgeBaseMutation = useDeleteKnowledgeBase()
  const uploadFileMutation = useUploadFileToKnowledgeBase()
  const trainFileMutation = useTrainKnowledgeBaseFile()
  const deleteFileMutation = useDeleteKnowledgeBaseFile()
  const { confirm, alert, ConfirmDialog } = useConfirmDialog()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingKnowledgeBase, setEditingKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [formData, setFormData] = useState<CreateKnowledgeBaseDto>({
    name: '',
    description: ''
  })
  const [uploadingKnowledgeBases, setUploadingKnowledgeBases] = useState<Record<string, boolean>>({})
  const [deletingKnowledgeBases, setDeletingKnowledgeBases] = useState<Record<string, boolean>>({})
  const [trainingFiles, setTrainingFiles] = useState<Record<string, boolean>>({})
  const [deletingFiles, setDeletingFiles] = useState<Record<string, boolean>>({})

  const setPending = (
    setter: Dispatch<SetStateAction<Record<string, boolean>>>,
    id: string,
    pending: boolean
  ) => {
    setter((current) => {
      const next = { ...current }
      if (pending) {
        next[id] = true
      } else {
        delete next[id]
      }
      return next
    })
  }

  const openCreateDialog = () => {
    setEditingKnowledgeBase(null)
    setFormData({ name: '', description: '' })
    setCreateDialogOpen(true)
  }

  const openEditDialog = (knowledgeBase: KnowledgeBase) => {
    setEditingKnowledgeBase(knowledgeBase)
    setFormData({
      name: knowledgeBase.name,
      description: knowledgeBase.description || '',
    })
    setCreateDialogOpen(true)
  }

  const closeKnowledgeBaseDialog = () => {
    setCreateDialogOpen(false)
    setEditingKnowledgeBase(null)
    setFormData({ name: '', description: '' })
  }

  const handleSaveKnowledgeBase = async () => {
    if (!formData.name) return

    try {
      if (editingKnowledgeBase) {
        await updateKnowledgeBaseMutation.mutateAsync({
          id: editingKnowledgeBase.id,
          data: formData,
        })
      } else {
        await createKnowledgeBaseMutation.mutateAsync(formData)
      }
      closeKnowledgeBaseDialog()
    } catch (error) {
      console.error('Failed to save knowledge base:', error)
      await alert({
        title: editingKnowledgeBase ? '保存失败' : '创建失败',
        description: (error as Error).message || '保存知识库失败，请稍后重试',
      })
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '删除知识库',
      description: '确定要删除这个知识库吗？删除后无法恢复。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      setPending(setDeletingKnowledgeBases, id, true)
      await deleteKnowledgeBaseMutation.mutateAsync(id)
    } catch (error) {
      console.error('Failed to delete knowledge base:', error)
      await alert({
        title: '删除失败',
        description: (error as Error).message || '删除知识库失败，请稍后重试',
      })
    } finally {
      setPending(setDeletingKnowledgeBases, id, false)
    }
  }

  const handleFileUpload = async (knowledgeBaseId: string, file: File) => {
    try {
      setPending(setUploadingKnowledgeBases, knowledgeBaseId, true)
      await uploadFileMutation.mutateAsync({ knowledgeBaseId, file })
    } catch (error) {
      console.error('Failed to upload file:', error)
      await alert({
        title: '上传失败',
        description: (error as Error).message || '上传文件失败，请稍后重试',
      })
    } finally {
      setPending(setUploadingKnowledgeBases, knowledgeBaseId, false)
    }
  }

  const handleTrainFile = async (knowledgeBaseId: string, fileId: string) => {
    try {
      setPending(setTrainingFiles, fileId, true)
      await trainFileMutation.mutateAsync({ knowledgeBaseId, fileId })
    } catch (error) {
      console.error('Failed to train file:', error)
      await alert({
        title: '训练失败',
        description: (error as Error).message || '训练文件失败，请稍后重试',
      })
    } finally {
      setPending(setTrainingFiles, fileId, false)
    }
  }

  const handleDeleteFile = async (knowledgeBaseId: string, fileId: string) => {
    const confirmed = await confirm({
      title: '删除文件',
      description: '确定要删除这个文件吗？删除后无法恢复。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      setPending(setDeletingFiles, fileId, true)
      await deleteFileMutation.mutateAsync({ knowledgeBaseId, fileId })
    } catch (error) {
      console.error('Failed to delete file:', error)
      await alert({
        title: '删除失败',
        description: (error as Error).message || '删除文件失败，请稍后重试',
      })
    } finally {
      setPending(setDeletingFiles, fileId, false)
    }
  }

  const totalFiles = knowledgeBases.reduce((sum, kb) => sum + (kb.files?.length || 0), 0)
  const completedFiles = knowledgeBases.reduce(
    (sum, kb) => sum + (kb.files?.filter((f) => f.status === 'PROCESSED').length || 0),
    0
  )

  if (isLoading) {
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <BookOpen className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">知识库管理</h1>
            <p className="text-sm text-muted-foreground">管理您的知识库和文档</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          创建知识库
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{knowledgeBases.length}</p>
              <p className="text-xs text-muted-foreground">知识库总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalFiles}</p>
              <p className="text-xs text-muted-foreground">文件总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
              <GraduationCap className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedFiles}</p>
              <p className="text-xs text-muted-foreground">已训练文件</p>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Bases Grid */}
      {knowledgeBases.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {knowledgeBases.map((kb) => {
            const isDeletingKb = !!deletingKnowledgeBases[kb.id]
            const isUploadingKb = !!uploadingKnowledgeBases[kb.id]

            return (
            <Card key={kb.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-emerald-500/20">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500/60 to-emerald-500/20" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                      <BookOpen className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{kb.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                        {kb.description || '暂无描述'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                      onClick={() => openEditDialog(kb)}
                      disabled={isDeletingKb}
                      aria-label={`编辑知识库 ${kb.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      onClick={() => handleDelete(kb.id)}
                      disabled={isDeletingKb}
                      aria-label={`删除知识库 ${kb.name}`}
                    >
                      {isDeletingKb ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* File count & upload */}
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs gap-1">
                    <FileText className="h-3 w-3" />
                    {kb.files?.length || 0} 个文件
                  </Badge>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(kb.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* File Upload */}
                <label
                  htmlFor={`file-upload-${kb.id}`}
                  className={`flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 transition-colors ${
                    isUploadingKb
                      ? 'cursor-wait bg-muted/40 text-muted-foreground'
                      : 'cursor-pointer hover:bg-muted/50'
                  }`}
                >
                  {isUploadingKb ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {isUploadingKb ? '上传中...' : '点击上传文件'}
                  </span>
                  <Input
                    id={`file-upload-${kb.id}`}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleFileUpload(kb.id, file)
                        e.target.value = ''
                      }
                    }}
                    disabled={isUploadingKb}
                  />
                </label>

                {/* File List */}
                {kb.files && kb.files.length > 0 ? (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {kb.files.map((file: KnowledgeBaseFile) => {
                      const statusCfg = getStatusCfg(file.status)
                      const StatusIcon = statusCfg.icon
                      const isTrainingFile = !!trainingFiles[file.id]
                      const isDeletingFile = !!deletingFiles[file.id]
                      const isBusyFile = isTrainingFile || isDeletingFile
                      return (
                        <div
                          key={file.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate flex-1 min-w-0">{file.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isTrainingFile ? (
                              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            ) : (
                              <StatusIcon className={`h-3 w-3 ${statusCfg.color} ${file.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                            )}
                            <span className={`text-[10px] ${isTrainingFile ? 'text-blue-500' : statusCfg.color}`}>
                              {isTrainingFile ? '训练中' : statusCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {(file.status === 'PENDING' || file.status === 'FAILED') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleTrainFile(kb.id, file.id)}
                                disabled={isBusyFile}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                title="训练"
                              >
                                {isTrainingFile ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <GraduationCap className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteFile(kb.id, file.id)}
                              disabled={isBusyFile}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              title="删除"
                            >
                              {isDeletingFile ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                    暂无文件
                  </div>
                )}
              </CardContent>
            </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
              <BookOpen className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">暂无知识库</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              创建您的第一个知识库，上传文档并训练，为智能体提供专业知识
            </p>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              创建知识库
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Knowledge Base Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (open) {
          setCreateDialogOpen(true)
        } else {
          closeKnowledgeBaseDialog()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <BookOpen className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <DialogTitle>{editingKnowledgeBase ? '编辑知识库' : '创建知识库'}</DialogTitle>
                <DialogDescription>
                  {editingKnowledgeBase ? '修改知识库名称和描述' : '创建一个新的知识库来存储和管理文档'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入知识库名称"
              />
            </div>
            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="输入知识库描述（可选）"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={closeKnowledgeBaseDialog}
                disabled={createKnowledgeBaseMutation.isPending || updateKnowledgeBaseMutation.isPending}
              >
                取消
              </Button>
              <Button
                onClick={handleSaveKnowledgeBase}
                disabled={!formData.name || createKnowledgeBaseMutation.isPending || updateKnowledgeBaseMutation.isPending}
              >
                {createKnowledgeBaseMutation.isPending || updateKnowledgeBaseMutation.isPending
                  ? '保存中...'
                  : editingKnowledgeBase ? '保存' : '创建'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  )
}
