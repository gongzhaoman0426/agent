import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

export const useAccessTokens = () => {
  return useQuery({
    queryKey: queryKeys.accessTokens(),
    queryFn: () => apiClient.getAccessTokens(),
  });
};

export const useCreateAccessToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; expiresAt?: string }) =>
      apiClient.createAccessToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessTokens() });
    },
  });
};

export const useDeleteAccessToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAccessToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessTokens() });
    },
  });
};
