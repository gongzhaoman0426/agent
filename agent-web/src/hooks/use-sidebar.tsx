import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface SidebarContext {
  open: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
  closeMobile: () => void
}

const SidebarContext = createContext<SidebarContext | null>(null)

const MOBILE_BREAKPOINT = 1024 // lg

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const toggle = useCallback(() => setOpen((v) => !v), [])
  const closeMobile = useCallback(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setOpen(false)
    }
  }, [])

  return (
    <SidebarContext value={{ open, toggle, setOpen, closeMobile }}>
      {children}
    </SidebarContext>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
