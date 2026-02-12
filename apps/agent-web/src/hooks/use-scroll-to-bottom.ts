import { useEffect, useRef, useState, useCallback } from 'react'

export function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 40
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      setIsAtBottom(atBottom)
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Auto-scroll when at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
  })

  return { containerRef, isAtBottom, scrollToBottom }
}
