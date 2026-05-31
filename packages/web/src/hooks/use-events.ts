import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useEvents(calendarIds: string[], start: string, end: string) {
  return useQueries({
    queries: calendarIds.map((id) => ({
      queryKey: ["events", id, start, end],
      queryFn: async () => {
        const res = await api.events.list(id, start, end);
        return res.data;
      },
      enabled: !!start && !!end,
    })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
    }),
  });
}
