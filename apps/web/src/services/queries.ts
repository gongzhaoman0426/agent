import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Agent,
  ChatSession,
  SessionDetail,
  SkillDetail,
  SkillSummary,
  Toolkit,
  Workflow,
} from '@/types';

export const queryKeys = {
  agents: ['agents'] as const,
  toolkits: ['toolkits'] as const,
  workflows: ['workflows'] as const,
  skills: ['skills'] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  toolkitSettings: (id: string) => ['toolkits', id, 'settings'] as const,
};

// ---- Agents ----

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<Agent[]>('/agents'),
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: Boolean(id),
  });
}

export interface AgentFormData {
  name?: string;
  description?: string;
  prompt?: string;
  model?: string;
  toolkitIds?: string[];
  workflowIds?: string[];
  skillNames?: string[];
  subAgentIds?: string[];
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentFormData) => api.post<Agent>('/agents', data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentFormData }) =>
      api.put<Agent>(`/agents/${id}`, data),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      queryClient.setQueryData(['agents', updated.id], updated);
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

// ---- Toolkits ----

export function useToolkits() {
  return useQuery({
    queryKey: queryKeys.toolkits,
    queryFn: () => api.get<Toolkit[]>('/toolkits'),
  });
}

export function useToolkitSettings(toolkitId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.toolkitSettings(toolkitId),
    queryFn: () =>
      api.get<Record<string, string>>(`/toolkits/${toolkitId}/settings`),
    enabled,
  });
}

export function useUpdateToolkitSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      toolkitId,
      settings,
    }: {
      toolkitId: string;
      settings: Record<string, string>;
    }) => api.put(`/toolkits/${toolkitId}/settings`, settings),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.toolkitSettings(variables.toolkitId),
      }),
  });
}

// ---- Workflows ----

export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: () => api.get<Workflow[]>('/workflows'),
  });
}

export function useExecuteWorkflow() {
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => api.post<Record<string, unknown>>(`/workflows/${id}/execute`, { input }),
  });
}

// ---- Skills ----

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => api.get<SkillSummary[]>('/skills'),
  });
}

export function useSkillDetail(name: string | null) {
  return useQuery({
    queryKey: ['skills', name],
    queryFn: () => api.get<SkillDetail>(`/skills/${name}`),
    enabled: Boolean(name),
  });
}

export function useUploadSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<SkillSummary>('/skills/upload', formData);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/skills/${name}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

// ---- Sessions ----

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.get<ChatSession[]>('/agents/sessions/all'),
  });
}

export function useSessionDetail(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.session(sessionId ?? ''),
    queryFn: () =>
      api.get<SessionDetail>(`/agents/sessions/detail/${sessionId}`),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.delete(`/agents/sessions/detail/${sessionId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}
