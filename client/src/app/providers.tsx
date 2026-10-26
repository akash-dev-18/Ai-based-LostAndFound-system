import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { Logo } from "@/components/layout/logo";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { authStore } from "@/lib/auth/auth-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if ([400, 401, 403, 404, 409, 422, 429].includes(error.status)) return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

function AuthSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper">
      <Logo />
      <div className="flex items-center gap-2 text-xs text-muted">
        <Spinner className="size-4" />
        <span>Opening the board…</span>
      </div>
    </div>
  );
}

function AuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void authStore.ensureSession().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) return <AuthSplash />;
  return children;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>{children}</AuthBootstrap>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            fontFamily: "var(--font-sans)",
            borderRadius: "0.9rem",
          },
        }}
      />
    </QueryClientProvider>
  );
}

export { queryClient };
