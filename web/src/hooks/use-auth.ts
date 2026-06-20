import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const AUTH_FETCH_TIMEOUT_MS = 8_000;

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Auth request timed out")), AUTH_FETCH_TIMEOUT_MS),
      );
      const res = await Promise.race([api.auth.me(), timeout]);
      return res.data;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    user: data ?? undefined,
    isLoading,
    isAuthenticated: !error && !!data,
    error,
    logout: async () => {
      await api.auth.logout();
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  };
}
