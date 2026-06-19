import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCalendars() {
  return useQuery({
    queryKey: ["calendars"],
    queryFn: async () => {
      const res = await api.calendars.list();
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}
