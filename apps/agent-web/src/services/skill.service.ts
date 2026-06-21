import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

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
