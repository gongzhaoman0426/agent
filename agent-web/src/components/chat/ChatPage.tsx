import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useChatSession } from '../../hooks/use-chat-sessions'
import { useAgents } from '../../services/agent.service'
import { apiClient } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'
import { generateUUID } from '../../lib/uuid'
import { ChatHeader } from './ChatHeader'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import type { ChatMessage, ChatSessionSummary, ToolCallInfo } from '../../types'

const LAST_AGENT_KEY = 'last-agent-id'

export function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: agents = [] } = useAgents()
  const [isStreaming, setIsStreaming] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const assistantMsgIdRef = useRef<string>('')
  const abortControllerRef = useRef<AbortController | null>(null)

  const agentFromUrl = searchParams.get('agent') || ''
  const lastAgentId = localStorage.getItem(LAST_AGENT_KEY)
  const [selectedAgentId, setSelectedAgentId] = useState(
    () => agentFromUrl || lastAgentId || ''
  )

  // 监听URL中的agent参数变化，自动应用
  useEffect(() => {
    if (agentFromUrl && agentFromUrl !== selectedAgentId) {
      setSelectedAgentId(agentFromUrl)
      localStorage.setItem(LAST_AGENT_KEY, agentFromUrl)
    }
  }, [agentFromUrl, selectedAgentId])

  const { data: session } = useChatSession(
    agentFromUrl || selectedAgentId || undefined,
    sessionId,
  )

  const rawAgentId = session?.agentId || selectedAgentId
  const currentAgent = agents.find((a) => a.id === rawAgentId)
  // 只有当 agent 确实存在于当前用户的列表中时才视为有效
  const currentAgentId = currentAgent ? rawAgentId : ''
  const messages = session?.messages || []

  const handleAgentChange = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId)
      localStorage.setItem(LAST_AGENT_KEY, agentId)
    },
    []
  )

  const handleSend = useCallback(
    async (content: string) => {
      if (!currentAgentId) return

      let activeSessionId = sessionId
      const isFirstMessage = !sessionId

      // 首次消息：前端生成 sessionId
      if (!activeSessionId) {
        activeSessionId = generateUUID()

        // 乐观更新侧边栏：立即插入占位会话
        const now = new Date().toISOString()
        queryClient.setQueryData(queryKeys.chatSessions(), (old: any) => {
          const placeholder: ChatSessionSummary = {
            id: activeSessionId!,
            title: '新对话',
            agentId: currentAgentId,
            agentName: currentAgent?.name || '智能体',
            createdAt: now,
            updatedAt: now,
          }
          return old ? [placeholder, ...old] : [placeholder]
        })
      }

      // 乐观更新：立即显示用户消息
      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        content,
        sessionId: activeSessionId,
        createdAt: new Date().toISOString(),
      }

      const sessionQueryKey = queryKeys.chatSession(currentAgentId, activeSessionId)
      queryClient.setQueryData(sessionQueryKey, (old: any) => {
        if (!old) {
          return {
            id: activeSessionId,
            title: '新对话',
            agentId: currentAgentId,
            agentName: currentAgent?.name || '智能体',
            messages: [userMessage],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }
        return { ...old, messages: [...old.messages, userMessage] }
      })

      // 首次消息：写入 cache 后再导航，新组件会从 cache 读到乐观数据
      if (isFirstMessage) {
        navigate(`/chat/${activeSessionId}?agent=${currentAgentId}`, { replace: true })
      }

      const assistantMsgId = generateUUID()
      assistantMsgIdRef.current = assistantMsgId
      let assistantCreated = false

      setIsStreaming(true)
      setIsBusy(true)
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const ensureAssistantMessage = () => {
          if (!assistantCreated) {
            assistantCreated = true
            const assistantMessage: ChatMessage = {
              id: assistantMsgId,
              role: 'assistant',
              content: '',
              sessionId: activeSessionId!,
              createdAt: new Date().toISOString(),
              toolCalls: [],
            }
            queryClient.setQueryData(sessionQueryKey, (old: any) => {
              if (!old) return old
              return { ...old, messages: [...old.messages, assistantMessage] }
            })
            setIsStreaming(false)
          }
        }

        const result = await apiClient.streamChatWithAgent(
          currentAgentId,
          {
            message: content,
            sessionId: activeSessionId,
            context: {},
            generateTitle: isFirstMessage,
          },
          {
            onDelta: (delta) => {
              ensureAssistantMessage()
              queryClient.setQueryData(sessionQueryKey, (old: any) => {
                if (!old) return old
                const msgs = old.messages.map((m: ChatMessage) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + delta }
                    : m
                )
                return { ...old, messages: msgs }
              })
            },
            onToolCall: (data) => {
              ensureAssistantMessage()
              const toolCall: ToolCallInfo = {
                toolId: data.toolId,
                toolName: data.toolName,
                toolKwargs: data.toolKwargs,
                status: 'calling',
              }
              queryClient.setQueryData(sessionQueryKey, (old: any) => {
                if (!old) return old
                const msgs = old.messages.map((m: ChatMessage) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                    : m
                )
                return { ...old, messages: msgs }
              })
            },
            onToolResult: (data) => {
              queryClient.setQueryData(sessionQueryKey, (old: any) => {
                if (!old) return old
                const msgs = old.messages.map((m: ChatMessage) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls || []).map((tc: ToolCallInfo) =>
                          tc.toolId === data.toolId
                            ? { ...tc, result: data.result, status: 'done' as const }
                            : tc
                        ),
                      }
                    : m
                )
                return { ...old, messages: msgs }
              })
            },
          },
          abortController.signal,
        )

        // 首次消息：用返回的标题直接更新侧边栏 cache，避免全量刷新闪烁
        if (isFirstMessage) {
          const title = result?.title || '新对话'
          queryClient.setQueryData(queryKeys.chatSessions(), (old: any) => {
            if (!old) return old
            return old.map((s: ChatSessionSummary) =>
              s.id === activeSessionId ? { ...s, title } : s
            )
          })
        }
      } catch (err) {
        // 用户主动中断，不显示错误
        if (err instanceof DOMException && err.name === 'AbortError') {
          // 保留已有内容，不做额外处理
        } else if (!assistantCreated) {
          const errorMsg: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '抱歉，发生了错误，请稍后重试。',
            sessionId: activeSessionId!,
            createdAt: new Date().toISOString(),
          }
          queryClient.setQueryData(sessionQueryKey, (old: any) => {
            if (!old) return old
            return { ...old, messages: [...old.messages, errorMsg] }
          })
        } else {
          queryClient.setQueryData(sessionQueryKey, (old: any) => {
            if (!old) return old
            const msgs = old.messages.map((m: ChatMessage) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content || '抱歉，发生了错误，请稍后重试。' }
                : m
            )
            return { ...old, messages: msgs }
          })
        }
      } finally {
        abortControllerRef.current = null
        setIsStreaming(false)
        setIsBusy(false)
      }
    },
    [currentAgentId, sessionId, currentAgent, navigate, queryClient]
  )

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader />
      <ChatMessages
        messages={messages}
        isLoading={isStreaming}
      />
      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        disabled={!currentAgentId || isBusy}
        isLoading={isBusy}
        agentId={currentAgentId}
        onAgentChange={handleAgentChange}
        agentLocked={!!session}
      />
    </div>
  )
}
