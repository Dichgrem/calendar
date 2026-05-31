import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await api.auth.me();
        return (res as { ok: boolean; data: { userId: string } }).data;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: data,
    isLoading,
    isAuthenticated: !!data,
    error,
    logout: async () => {
      await api.auth.logout();
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  };
}
