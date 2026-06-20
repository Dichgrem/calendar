import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useEvents(start: string, end: string) {
  const enabled = !!start && !!end;

  return useQuery({
    queryKey: ["events", start, end],
    queryFn: async () => {
      const res = await api.events.all(start, end);
      return res.data ?? [];
    },
    enabled,
    placeholderData: (prev) => prev ?? [],
  });
}
