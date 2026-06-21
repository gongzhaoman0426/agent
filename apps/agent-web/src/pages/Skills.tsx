import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/components/dialog'
import { Separator } from '@/ui/components/separator'
import { BookOpen, Code2, Eye, FileText, Zap } from 'lucide-react'
import { useSkills } from '../services/skill.service'
import type { Skill, SkillReference, SkillScript } from '../types'

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

export function Skills() {
  const { data: skills = [], isLoading: loading } = useSkills()
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  const totalReferences = skills.reduce(
    (total, skill) => total + asArray<SkillReference>(skill.references).length,
    0,
  )
  const totalScripts = skills.reduce(
    (total, skill) => total + asArray<SkillScript>(skill.scripts).length,
    0,
  )

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <Zap className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">技能管理</h1>
            <p className="text-sm text-muted-foreground">查看可用技能及其指令内容</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
              <Zap className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{skills.length}</p>
              <p className="text-xs text-muted-foreground">技能总数</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BookOpen className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReferences}</p>
              <p className="text-xs text-muted-foreground">引用资料</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Code2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalScripts}</p>
              <p className="text-xs text-muted-foreground">脚本数量</p>
            </div>
          </div>
        </div>
      </div>

      {skills.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {skills.map((skill) => {
            const references = asArray<SkillReference>(skill.references)
            const scripts = asArray<SkillScript>(skill.scripts)

            return (
              <Card key={skill.id} className="group relative overflow-hidden border transition-all hover:shadow-md hover:border-orange-500/20">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500/60 to-orange-500/20" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                        <Zap className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{skill.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5 line-clamp-1">
                          {skill.description || '暂无描述'}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">指令内容</p>
                    </div>
                    <p className="text-xs leading-relaxed line-clamp-4 whitespace-pre-wrap">
                      {skill.content}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {references.length} 引用
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {scripts.length} 脚本
                    </Badge>
                  </div>

                  <Separator />

                  <Button
                    className="w-full gap-1.5"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    查看详情
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 mb-4">
              <Zap className="h-8 w-8 text-orange-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">暂无技能</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              还没有可用的技能
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedSkill} onOpenChange={(open) => { if (!open) setSelectedSkill(null) }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <Zap className="h-5 w-5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate">{selectedSkill?.name}</DialogTitle>
                  <DialogDescription className="line-clamp-2">
                    {selectedSkill?.description || '暂无描述'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          <Separator />
          {selectedSkill && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">指令内容</h3>
                <pre className="rounded-lg bg-muted/50 border p-3 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {selectedSkill.content}
                </pre>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">引用资料</h3>
                  {asArray<SkillReference>(selectedSkill.references).length > 0 ? (
                    <div className="space-y-2">
                      {asArray<SkillReference>(selectedSkill.references).map((reference, index) => (
                        <div key={`${reference.type}-${reference.uri}-${index}`} className="rounded-lg border p-3 text-xs">
                          <div className="font-medium">{reference.label || reference.type}</div>
                          <div className="mt-1 break-all text-muted-foreground">{reference.uri}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无引用资料</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">脚本</h3>
                  {asArray<SkillScript>(selectedSkill.scripts).length > 0 ? (
                    <div className="space-y-2">
                      {asArray<SkillScript>(selectedSkill.scripts).map((script, index) => (
                        <div key={`${script.name}-${index}`} className="rounded-lg border p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{script.name}</span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {script.language}
                            </Badge>
                          </div>
                          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2">
                            {script.code}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无脚本</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
