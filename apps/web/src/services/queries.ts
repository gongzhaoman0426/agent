import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Agent,
  ChatSession,
  ScheduledTask,
  SessionDetail,
  SkillDetail,
  SkillFileContent,
  SkillFileNode,
  SkillSummary,
  McpServer,
  Toolkit,
  UiMessage,
  WechatAccount,
  WechatLoginStart,
  WechatLoginStatus,
  Workflow,
} from '@/types';

export const queryKeys = {
  agents: ['agents'] as const,
  toolkits: ['toolkits'] as const,
  mcpServers: ['mcp-servers'] as const,
  workflows: ['workflows'] as const,
  skills: ['skills'] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  toolkitSettings: (id: string) => ['toolkits', id, 'settings'] as const,
  skillFiles: (name: string) => ['skills', name, 'files'] as const,
  skillFile: (name: string, path: string) =>
    ['skills', name, 'file', path] as const,
  skillAssistant: (name: string) => ['skills', name, 'assistant'] as const,
  scheduleInbox: ['schedule', 'inbox'] as const,
  wechatAccounts: ['wechat', 'accounts'] as const,
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.toolkitSettings(variables.toolkitId),
      });
      // settingsReady 挂在 toolkits 列表上，配置变更后需刷新
      queryClient.invalidateQueries({ queryKey: queryKeys.toolkits });
    },
  });
}

// ---- Minimal HTTP MCP ----

export function useMcpServers() {
  return useQuery({
    queryKey: queryKeys.mcpServers,
    queryFn: () => api.get<McpServer[]>('/mcp-servers'),
  });
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string }) =>
      api.post<McpServer>('/mcp-servers', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.toolkits });
    },
  });
}

export function useRefreshMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<McpServer>(`/mcp-servers/${id}/refresh`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.toolkits });
    },
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/mcp-servers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.toolkits });
    },
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

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      api.post<SkillSummary>('/skills', data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.skills, exact: true }),
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

/** 改名会同步目录、SKILL.md frontmatter 与智能体挂载 */
export function useRenameSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      updates,
    }: {
      name: string;
      updates: { name?: string; description?: string };
    }) => api.patch<SkillSummary>(`/skills/${name}`, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skills,
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    },
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

// ---- Skill 文件编辑 ----

export function useSkillFiles(name: string) {
  return useQuery({
    queryKey: queryKeys.skillFiles(name),
    queryFn: () => api.get<SkillFileNode[]>(`/skills/${name}/files`),
    enabled: Boolean(name),
  });
}

export function useSkillFile(name: string, filePath: string | null) {
  return useQuery({
    queryKey: queryKeys.skillFile(name, filePath ?? ''),
    queryFn: () =>
      api.get<SkillFileContent>(
        `/skills/${name}/file?path=${encodeURIComponent(filePath ?? '')}`,
      ),
    enabled: Boolean(name && filePath),
  });
}

export function useSaveSkillFile(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { path: string; content: string }) =>
      api.put<SkillFileContent>(`/skills/${name}/file`, data),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.skillFile(name, saved.path), saved);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skillFiles(name),
      });
      // exact：技能列表与助手历史同属 ['skills'] 前缀，避免误伤对话历史
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skills,
        exact: true,
      });
    },
  });
}

export function useDeleteSkillFile(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) =>
      api.delete(`/skills/${name}/file?path=${encodeURIComponent(filePath)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skillFiles(name),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skills,
        exact: true,
      });
    },
  });
}

// ---- Skill 编辑助手 ----

export function useSkillAssistantHistory(name: string) {
  return useQuery({
    queryKey: queryKeys.skillAssistant(name),
    queryFn: () =>
      api.get<UiMessage[]>(`/skills/${name}/assistant/history`),
    enabled: Boolean(name),
    staleTime: Infinity,
  });
}

export function useResetSkillAssistant(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/skills/${name}/assistant/history`),
    onSuccess: () =>
      queryClient.setQueryData(queryKeys.skillAssistant(name), []),
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

// ---- Schedule inbox（Web 渠道回传） ----

export function useScheduleInbox(enabled = true) {
  return useQuery({
    queryKey: queryKeys.scheduleInbox,
    queryFn: () => api.get<ScheduledTask[]>('/schedule/inbox'),
    enabled,
    refetchInterval: 8_000,
  });
}

export function useAckScheduleInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskIds: string[]) =>
      api.post<{ acked: number }>('/schedule/inbox/ack', { taskIds }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleInbox }),
  });
}

// ---- WeChat 渠道 ----

export function useWechatAccounts() {
  return useQuery({
    queryKey: queryKeys.wechatAccounts,
    queryFn: () => api.get<WechatAccount[]>('/wechat/accounts'),
  });
}

export function useStartWechatLogin() {
  return useMutation({
    mutationFn: () => api.post<WechatLoginStart>('/wechat/login/start'),
  });
}

export function useWechatLoginStatus(sessionKey: string | null) {
  return useQuery({
    queryKey: ['wechat', 'login', sessionKey],
    queryFn: () =>
      api.get<WechatLoginStatus>(
        `/wechat/login/status?sessionKey=${encodeURIComponent(sessionKey!)}`,
      ),
    enabled: Boolean(sessionKey),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        !sessionKey ||
        status === 'done' ||
        status === 'none' ||
        status === 'confirmed' ||
        status === 'binded_redirect' ||
        status === 'verify_code_blocked'
      ) {
        return false;
      }
      return 2_000;
    },
  });
}

export function useConfirmWechatBind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      defaultAgentId: string;
      accountId: string;
      token: string;
      baseUrl?: string;
    }) => api.post<WechatAccount>('/wechat/login/confirm', body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.wechatAccounts }),
  });
}

export function useSubmitWechatVerifyCode() {
  return useMutation({
    mutationFn: (body: { sessionKey: string; code: string }) =>
      api.post<{ ok: boolean; message: string }>(
        '/wechat/login/verify-code',
        body,
      ),
  });
}

export function useUpdateWechatAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      defaultAgentId?: string;
      enabled?: boolean;
    }) => api.patch<WechatAccount>(`/wechat/accounts/${id}`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.wechatAccounts }),
  });
}

export function useDeleteWechatAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/wechat/accounts/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.wechatAccounts }),
  });
}
