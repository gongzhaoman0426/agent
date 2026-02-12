import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

// Query Options
export const toolkitQueryOptions = {
  // 获取所有工具包
  list: (filters = {}) => ({
    queryKey: queryKeys.toolkits(filters),
    queryFn: () => apiClient.getToolkits(),
    staleTime: 10 * 60 * 1000, // 工具包变化较少，缓存10分钟
  }),

  // 获取单个工具包详情
  detail: (id: string) => ({
    queryKey: queryKeys.toolkit(id),
    queryFn: async () => {
      const toolkits = await apiClient.getToolkits();
      const toolkit = toolkits.find(t => t.id === id);
      if (!toolkit) {
        throw new Error(`Toolkit with id ${id} not found`);
      }
      return toolkit;
    },
    enabled: !!id,
  }),

  // 获取工具包的工具
  tools: (id: string) => ({
    queryKey: queryKeys.toolkitTools(id),
    queryFn: async () => {
      const toolkits = await apiClient.getToolkits();
      const toolkit = toolkits.find(t => t.id === id);
      return toolkit?.tools || [];
    },
    enabled: !!id,
  }),

  // 获取工具包的用户设置
  settings: (id: string) => ({
    queryKey: queryKeys.toolkitSettings(id),
    queryFn: () => apiClient.getToolkitSettings(id),
    enabled: !!id,
  }),
};

// Hooks
export const useToolkits = () => {
  return useQuery(toolkitQueryOptions.list());
};

export const useToolkit = (id: string) => {
  return useQuery(toolkitQueryOptions.detail(id));
};

export const useToolkitTools = (id: string) => {
  return useQuery(toolkitQueryOptions.tools(id));
};

export const useToolkitSettings = (id: string) => {
  return useQuery(toolkitQueryOptions.settings(id));
};

export const useUpdateToolkitSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolkitId, settings }: { toolkitId: string; settings: any }) =>
      apiClient.updateToolkitSettings(toolkitId, settings),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolkitSettings(variables.toolkitId) });
    },
  });
};
