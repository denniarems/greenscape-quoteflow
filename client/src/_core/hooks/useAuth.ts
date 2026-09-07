import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useEffect } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      try {
        sessionStorage.removeItem("auth-token");
        sessionStorage.removeItem("session-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  };

  const user = meQuery.data ?? null;
  const loading = meQuery.isLoading || logoutMutation.isPending;
  const error = meQuery.error ?? logoutMutation.error ?? null;
  const isAuthenticated = Boolean(meQuery.data);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (user) return;
    if (typeof window === "undefined") return;

    if (redirectPath) {
      window.location.href = redirectPath;
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    user,
  ]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
