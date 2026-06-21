import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from './toast';

export const queryClient = new QueryClient({
  // 查询失败时统一弹出错误提示（变更类操作由各调用点自行处理，避免重复提示）
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : '请求失败';
      // 登录过期由 ApiClient 统一跳转登录页，无需额外提示
      if (message.includes('登录已过期')) return;
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      // 数据保持新鲜 5 分钟
      staleTime: 5 * 60 * 1000,
      // 缓存数据 10 分钟
      gcTime: 10 * 60 * 1000,
      // 重试配置
      retry: (failureCount, error: any) => {
        // 4xx 错误不重试
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // 最多重试 3 次
        return failureCount < 3;
      },
      // 重试延迟
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // 变更重试配置
      retry: (failureCount, error: any) => {
        // 4xx 错误不重试
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // 最多重试 1 次
        return failureCount < 1;
      },
    },
  },
});
