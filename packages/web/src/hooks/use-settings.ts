import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { UserSettings } from "../types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.settings.get();
      return (res as { ok: boolean; data: UserSettings }).data;
    },
    staleTime: 60_000,
  });
}
