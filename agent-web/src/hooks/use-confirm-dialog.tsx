import { useState, useCallback } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog'
import { buttonVariants } from '@/ui/components/button'
import { AlertCircle } from 'lucide-react'

interface ConfirmOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

interface AlertOptions {
  title: string
  description: string
  confirmText?: string
}

type PendingAction = {
  type: 'confirm'
  options: ConfirmOptions
  resolve: (value: boolean) => void
} | {
  type: 'alert'
  options: AlertOptions
  resolve: () => void
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingAction | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ type: 'confirm', options, resolve })
    })
  }, [])

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setPending({ type: 'alert', options, resolve })
    })
  }, [])

  const handleConfirm = () => {
    if (!pending) return
    if (pending.type === 'confirm') {
      pending.resolve(true)
    } else {
      pending.resolve()
    }
    setPending(null)
  }

  const handleCancel = () => {
    if (!pending) return
    if (pending.type === 'confirm') {
      pending.resolve(false)
    } else {
      pending.resolve()
    }
    setPending(null)
  }

  const ConfirmDialog = () => {
    if (!pending) return null

    const isDestructive = pending.type === 'confirm' && pending.options.variant === 'destructive'

    return (
      <AlertDialog open onOpenChange={(open) => { if (!open) handleCancel() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            {isDestructive && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 mb-1">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
            )}
            <AlertDialogTitle>{pending.options.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending.options.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {pending.type === 'confirm' && (
              <AlertDialogCancel onClick={handleCancel}>
                {pending.options.cancelText || '取消'}
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              onClick={handleConfirm}
              className={isDestructive ? buttonVariants({ variant: 'destructive' }) : ''}
            >
              {pending.type === 'confirm'
                ? (pending.options.confirmText || '确认')
                : (pending.options.confirmText || '知道了')
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return { confirm, alert, ConfirmDialog }
}
