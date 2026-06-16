import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import type { ExecuteWorkflowDto } from '../types';

// Query Options
export const workflowQueryOptions = {
  // 获取所有工作流
  list: (filters = {}) => ({
    queryKey: queryKeys.workflows(filters),
    queryFn: () => apiClient.getWorkflows(),
    staleTime: 2 * 60 * 1000, // 2分钟
  }),

  // 获取单个工作流详情
  detail: (id: string) => ({
    queryKey: queryKeys.workflow(id),
    queryFn: () => apiClient.getWorkflow(id),
    enabled: !!id,
  }),
};

// Hooks
export const useWorkflows = () => {
  return useQuery(workflowQueryOptions.list());
};

export const useWorkflow = (id: string) => {
  return useQuery(workflowQueryOptions.detail(id));
};

export const useExecuteWorkflow = () => {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExecuteWorkflowDto }) =>
      apiClient.executeWorkflow(id, data),
  });
};
