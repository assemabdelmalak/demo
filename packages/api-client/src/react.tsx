'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useState } from 'react';

import { type ApiClient, createApiClient } from './client.js';

const ApiContext = createContext<ApiClient | null>(null);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Menus and sessions change rarely within seconds; realtime events trigger explicit refetches.
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}

export interface ApiProviderProps {
  baseUrl: string;
  children: ReactNode;
}

/** One typed API client and one TanStack Query cache per browser tab. */
export function ApiProvider({ baseUrl, children }: ApiProviderProps) {
  const [client] = useState(() => createApiClient({ baseUrl }));
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApiClient must be used inside <ApiProvider>');
  return client;
}
