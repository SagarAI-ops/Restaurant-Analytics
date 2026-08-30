import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client configuration
 * - staleTime: 5 minutes (data is fresh for 5 min)
 * - gcTime: 10 minutes (inactive queries kept in cache for 10 min)
 * - retry: 1 (retry failed requests once)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
