"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // QueryClient bileşen içinde kurulur ki sunucu render'ları arasında
  // paylaşılmasın (kullanıcı verisi sızmasın).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Hücre değişikliğinden sonra gereksiz yeniden çekmeyi
            // engeller; matris hızlı işaretlemede pürüzsüz kalır.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
