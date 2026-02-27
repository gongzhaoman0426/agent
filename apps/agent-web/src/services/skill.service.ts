import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import type { CreateSkillDto, UpdateSkillDto } from '../types';

// Query Options
export const skillQueryOptions = {
  list: (filters = {}) => ({
    queryKey: queryKeys.skills(filters),
    queryFn: () => apiClient.getSkills(),
    staleTime: 2 * 60 * 1000,
  }),

  detail: (id: string) => ({
    queryKey: queryKeys.skill(id),
    queryFn: () => apiClient.getSkill(id),
    enabled: !!id,
  }),
};

// Hooks
export const useSkills = () => {
  return useQuery(skillQueryOptions.list());
};

export const useSkill = (id: string) => {
  return useQuery(skillQueryOptions.detail(id));
};

// Mutations
export const useCreateSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSkillDto) => apiClient.createSkill(data),
    onSuccess: (newSkill) => {
      queryClient.setQueryData(queryKeys.skills({}), (old: any) => {
        if (!old) return [newSkill];
        return [newSkill, ...old];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills({}) });
    },
  });
};

export const useUpdateSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSkillDto }) =>
      apiClient.updateSkill(id, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills({}) });
    },
  });
};

export const useDeleteSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteSkill(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.skills({}) });
      const previousSkills = queryClient.getQueryData(queryKeys.skills({}));
      queryClient.setQueryData(queryKeys.skills({}), (old: any) => {
        if (!old) return old;
        return old.filter((skill: any) => skill.id !== deletedId);
      });
      return { previousSkills };
    },
    onError: (_, __, context) => {
      if (context?.previousSkills) {
        queryClient.setQueryData(queryKeys.skills({}), context.previousSkills);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills({}) });
    },
  });
};
