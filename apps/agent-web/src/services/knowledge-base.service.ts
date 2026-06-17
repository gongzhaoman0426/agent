import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import type {
  ChatWithKnowledgeBaseDto,
  CreateKnowledgeBaseDto,
  KnowledgeBase,
  KnowledgeBaseFile,
  UpdateKnowledgeBaseDto,
} from '../types';

// Query Options - 分离查询选项和 hooks
export const knowledgeBaseQueryOptions = {
  // 获取所有知识库
  list: (filters = {}) => ({
    queryKey: queryKeys.knowledgeBases(filters),
    queryFn: () => apiClient.getKnowledgeBases(),
    staleTime: 2 * 60 * 1000, // 2分钟
  }),

  // 获取单个知识库详情
  detail: (id: string) => ({
    queryKey: queryKeys.knowledgeBase(id),
    queryFn: () => apiClient.getKnowledgeBase(id),
    enabled: !!id,
  }),

  // 获取知识库的文件
  files: (id: string) => ({
    queryKey: queryKeys.knowledgeBaseFiles(id),
    queryFn: async () => {
      const kb = await apiClient.getKnowledgeBase(id);
      return kb.files || [];
    },
    enabled: !!id,
  }),
};

// Hooks
export const useKnowledgeBases = () => {
  return useQuery({
    ...knowledgeBaseQueryOptions.list(),
    refetchInterval: (query) => {
      const data = query.state.data as KnowledgeBase[] | undefined;
      const hasProcessing = data?.some((kb) =>
        kb.files?.some((file) => file.status === 'PROCESSING'),
      );
      return hasProcessing ? 3000 : false;
    },
  });
};

export const useKnowledgeBase = (id: string) => {
  return useQuery(knowledgeBaseQueryOptions.detail(id));
};

export const useKnowledgeBaseFiles = (id: string) => {
  return useQuery(knowledgeBaseQueryOptions.files(id));
};

// Mutations
export const useCreateKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateKnowledgeBaseDto) => apiClient.createKnowledgeBase(data),
    onSuccess: (newKnowledgeBase) => {
      // 乐观更新：立即将新知识库添加到列表中
      queryClient.setQueryData(queryKeys.knowledgeBases({}), (old: any) => {
        if (!old) return [newKnowledgeBase];
        return [newKnowledgeBase, ...old];
      });

      // 使统计数据失效
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
    },
    onSettled: () => {
      // 重新获取列表以确保数据一致性
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
    },
  });
};

export const useUpdateKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateKnowledgeBaseDto }) =>
      apiClient.updateKnowledgeBase(id, data),
    onSuccess: (updatedKnowledgeBase) => {
      // 更新知识库详情缓存
      queryClient.setQueryData(queryKeys.knowledgeBase(updatedKnowledgeBase.id), updatedKnowledgeBase);
      queryClient.setQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}), (old) => {
        if (!old) return old;
        return old.map((kb) => kb.id === updatedKnowledgeBase.id ? updatedKnowledgeBase : kb);
      });
      // 使知识库列表缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
    },
  });
};

export const useDeleteKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteKnowledgeBase(id),
    onMutate: async (deletedId) => {
      // 取消正在进行的查询，避免覆盖我们的乐观更新
      await queryClient.cancelQueries({ queryKey: queryKeys.knowledgeBases({}) });

      // 获取当前的知识库列表
      const previousKnowledgeBases = queryClient.getQueryData(queryKeys.knowledgeBases({}));

      // 乐观更新：立即从列表中移除被删除的知识库
      queryClient.setQueryData(queryKeys.knowledgeBases({}), (old: any) => {
        if (!old) return old;
        return old.filter((kb: any) => kb.id !== deletedId);
      });

      // 返回上下文，以便在错误时回滚
      return { previousKnowledgeBases };
    },
    onError: (_error, __, context) => {
      // 如果删除失败，回滚到之前的状态
      if (context?.previousKnowledgeBases) {
        queryClient.setQueryData(queryKeys.knowledgeBases({}), context.previousKnowledgeBases);
      }
    },
    onSuccess: (_, deletedId) => {
      // 移除知识库详情缓存
      queryClient.removeQueries({ queryKey: queryKeys.knowledgeBase(deletedId) });
      // 移除相关的文件缓存
      queryClient.removeQueries({ queryKey: queryKeys.knowledgeBaseFiles(deletedId) });
      // 使统计数据失效
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
    },
    onSettled: () => {
      // 无论成功还是失败，都重新获取知识库列表以确保数据一致性
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
    },
  });
};

export const useUploadFileToKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ knowledgeBaseId, file }: { knowledgeBaseId: string; file: File }) =>
      apiClient.uploadFileToKnowledgeBase(knowledgeBaseId, file),
    onMutate: async ({ knowledgeBaseId, file }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.knowledgeBases({}) });
      const previous = queryClient.getQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}));
      const optimisticFile: KnowledgeBaseFile = {
        id: `uploading-${knowledgeBaseId}-${Date.now()}`,
        name: file.name,
        path: '',
        status: 'PENDING',
        knowledgeBaseId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}), (old) => {
        if (!old) return old;
        return old.map((kb) =>
          kb.id === knowledgeBaseId
            ? { ...kb, files: [optimisticFile, ...(kb.files || [])] }
            : kb,
        );
      });

      return { previous, optimisticFileId: optimisticFile.id };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.knowledgeBases({}), context.previous);
      }
    },
    onSuccess: (response, { knowledgeBaseId }, context) => {
      const uploadedFile = response?.file as KnowledgeBaseFile | undefined;
      if (uploadedFile && context?.optimisticFileId) {
        queryClient.setQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}), (old) => {
          if (!old) return old;
          return old.map((kb) => {
            if (kb.id !== knowledgeBaseId) return kb;
            return {
              ...kb,
              files: (kb.files || []).map((file) =>
                file.id === context.optimisticFileId ? uploadedFile : file,
              ),
            };
          });
        });
      }
    },
    onSettled: (_, __, { knowledgeBaseId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase(knowledgeBaseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBaseFiles(knowledgeBaseId) });
    },
  });
};

export const useTrainKnowledgeBaseFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ knowledgeBaseId, fileId }: { knowledgeBaseId: string; fileId: string }) =>
      apiClient.trainKnowledgeBaseFile(knowledgeBaseId, fileId),
    onMutate: async ({ knowledgeBaseId, fileId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.knowledgeBases({}) });
      const previous = queryClient.getQueryData(queryKeys.knowledgeBases({}));
      queryClient.setQueryData(queryKeys.knowledgeBases({}), (old: any) => {
        if (!old) return old;
        return old.map((kb: any) => {
          if (kb.id !== knowledgeBaseId) return kb;
          return {
            ...kb,
            files: kb.files?.map((f: any) =>
              f.id === fileId ? { ...f, status: 'PROCESSING' } : f,
            ),
          };
        });
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.knowledgeBases({}), context.previous);
      }
    },
    onSettled: (_, __, { knowledgeBaseId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase(knowledgeBaseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBaseFiles(knowledgeBaseId) });
    },
  });
};

export const useDeleteKnowledgeBaseFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ knowledgeBaseId, fileId }: { knowledgeBaseId: string; fileId: string }) =>
      apiClient.deleteKnowledgeBaseFile(knowledgeBaseId, fileId),
    onMutate: async ({ knowledgeBaseId, fileId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.knowledgeBases({}) });
      const previous = queryClient.getQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}));

      queryClient.setQueryData<KnowledgeBase[]>(queryKeys.knowledgeBases({}), (old) => {
        if (!old) return old;
        return old.map((kb) =>
          kb.id === knowledgeBaseId
            ? { ...kb, files: kb.files?.filter((file) => file.id !== fileId) || [] }
            : kb,
        );
      });

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.knowledgeBases({}), context.previous);
      }
    },
    onSettled: (_, __, { knowledgeBaseId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase(knowledgeBaseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBaseFiles(knowledgeBaseId) });
    },
  });
};

export const useQueryKnowledgeBase = () => {
  return useMutation({
    mutationFn: ({ knowledgeBaseId, data }: { knowledgeBaseId: string; data: ChatWithKnowledgeBaseDto }) =>
      apiClient.queryKnowledgeBase(knowledgeBaseId, data),
  });
};

export const useLinkKnowledgeBaseToAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ knowledgeBaseId, agentId }: { knowledgeBaseId: string; agentId: string }) =>
      apiClient.linkKnowledgeBaseToAgent(knowledgeBaseId, agentId),
    onSuccess: (_, { knowledgeBaseId, agentId }) => {
      // 使相关缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase(knowledgeBaseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
    },
  });
};

export const useUnlinkKnowledgeBaseFromAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ knowledgeBaseId, agentId }: { knowledgeBaseId: string; agentId: string }) =>
      apiClient.unlinkKnowledgeBaseFromAgent(knowledgeBaseId, agentId),
    onSuccess: (_, { knowledgeBaseId, agentId }) => {
      // 使相关缓存失效
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBase(knowledgeBaseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
    },
  });
};
