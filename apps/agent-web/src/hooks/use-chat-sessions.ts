import { useAllChatSessions, useChatSessionDetail, useDeleteChatSession } from '../services/chat-session.service'
import type { ChatSessionSummary } from '../types'

export function useChatSessions() {
  const { data: sessions = [], ...rest } = useAllChatSessions()
  const deleteMutation = useDeleteChatSession()

  const deleteSession = (agentId: string, sessionId: string) => {
    deleteMutation.mutate({ agentId, sessionId })
  }

  return { sessions: sessions as ChatSessionSummary[], deleteSession, ...rest }
}

export function useChatSession(agentId: string | undefined, sessionId: string | undefined) {
  return useChatSessionDetail(agentId || '', sessionId || '')
}
