import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

export const useAllChatSessions = () => {
  return useQuery({
    queryKey: queryKeys.chatSessions(),
    queryFn: () => apiClient.getAllChatSessions(),
  });
};

export const useChatSessionDetail = (agentId: string, sessionId: string) => {
  return useQuery({
    queryKey: queryKeys.chatSession(agentId, sessionId),
    queryFn: () => apiClient.getSession(agentId, sessionId),
    enabled: !!agentId && !!sessionId,
  });
};

export const useDeleteChatSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, sessionId }: { agentId: string; sessionId: string }) =>
      apiClient.deleteSession(agentId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSessions() });
    },
  });
};
