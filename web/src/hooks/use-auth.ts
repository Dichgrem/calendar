import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await api.auth.me();
      return (res as { ok: boolean; data: { userId: string; username: string } }).data;
    },
    retry: 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  return {
    user: data,
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
