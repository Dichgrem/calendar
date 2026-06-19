import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.settings.get();
      return res.data;
    },
    staleTime: 60_000,
  });
}
