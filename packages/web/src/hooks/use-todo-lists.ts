import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useTodoLists() {
  return useQuery({
    queryKey: ["todo-lists"],
    queryFn: async () => {
      const res = await api.todoLists.list();
      return res.data;
    },
  });
}
