import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useTodos(calendarId: string, params?: Record<string, string>) {
  return useQuery({
    queryKey: ["todos", calendarId, params],
    queryFn: async () => {
      const res = await api.todos.list(calendarId, params);
      return res.data;
    },
    enabled: !!calendarId,
  });
}
