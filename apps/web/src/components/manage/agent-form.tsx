import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Dialog } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { isSubmitEnter } from '@/lib/keyboard';
import { Input, Textarea } from '@/ui/input';
import { useCreateAgent } from '@/services/queries';

/** 创建只填名字和介绍，其余能力在编排页配置 */
export function CreateAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    setError('');
    try {
      const agent = await createAgent.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onOpenChange(false);
      navigate({ to: '/agents/$agentId', params: { agentId: agent.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="创建智能体">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            名称 <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：日程助手"
            autoFocus
            onKeyDown={(e) => {
              if (isSubmitEnter(e) && name.trim()) void handleSubmit();
            }}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">介绍</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说明这个智能体做什么。作为子智能体挂载时，这段介绍会成为工具描述。"
            rows={3}
          />
        </div>
        {error && (
          <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={createAgent.isPending || !name.trim()}
          >
            {createAgent.isPending ? '创建中...' : '创建并编排'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
