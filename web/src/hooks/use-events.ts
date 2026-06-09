import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Event } from "../types";

export function useEvents(calendarIds: string[], start: string, end: string) {
  const enabled = calendarIds.length > 0 && !!start && !!end;
  // Sort IDs in the key so toggling visibility doesn't invalidate the cache
  // just because the array order changed.
  const sorted = [...calendarIds].sort();

  return useQuery({
    queryKey: ["events", sorted, start, end],
    queryFn: async () => {
      const results = await Promise.all(
        calendarIds.map((id) => api.events.list(id, start, end))
      );
      return results.flatMap((r) => (r as { data: Event[] | null }).data ?? []);
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}
