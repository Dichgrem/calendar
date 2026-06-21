import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useEvents(start: string, end: string) {
  const enabled = !!start && !!end;
  return useQuery({
    queryKey: ["events", start, end],
    queryFn: async () => (await api.events.all(start, end)).data ?? [],
    enabled,
    placeholderData: (prev) => prev ?? [],
  });
}
