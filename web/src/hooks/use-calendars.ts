import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCalendars() {
  return useQuery({
    queryKey: ["calendars"],
    queryFn: async () => (await api.calendars.list()).data ?? [],
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
