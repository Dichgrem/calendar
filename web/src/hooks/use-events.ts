import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useEvents(calendarIds: string[], start: string, end: string) {
  const enabled = calendarIds.length > 0 && !!start && !!end;

  return useQuery({
    queryKey: ["events", calendarIds, start, end],
    queryFn: async () => {
      const results = await Promise.all(calendarIds.map((id) => api.events.list(id, start, end)));
      return results.flatMap((r) => r.data ?? []);
    },
    enabled,
    placeholderData: (prev) => prev ?? [],
  });
}
