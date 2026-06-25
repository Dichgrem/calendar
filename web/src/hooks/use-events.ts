import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useEvents(start: string, end: string) {
  const enabled = !!start && !!end;
  return useQuery<Event[], Error>({
    queryKey: ["events", start, end],
    queryFn: async () => {
      const d = (await api.events.all(start, end)).data;
      return Array.isArray(d) ? d : ((d as any).events ?? []);
    },
    enabled,
    placeholderData: (prev) => prev ?? [],
  });
}
