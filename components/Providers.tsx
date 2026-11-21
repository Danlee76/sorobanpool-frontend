'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/store';
import { initVitals } from '@/lib/vitals';
import { VITALS_SAMPLE_RATE } from '@/lib/config';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true } } }));
  const bootstrap = useSession((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
    // Initialize vitals reporting
    initVitals({
      sampleRate: VITALS_SAMPLE_RATE,
    });
  }, [bootstrap]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
