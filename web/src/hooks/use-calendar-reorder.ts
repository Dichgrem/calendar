import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCalendarReorder(calendarIds: string[]) {
  const queryClient = useQueryClient();

  async function move(fromIdx: number, toIdx: number) {
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= calendarIds.length || toIdx >= calendarIds.length) return;
    if (fromIdx === toIdx) return;
    const ordered = [...calendarIds];
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, calendarIds[fromIdx]);
    try {
      await api.calendars.reorder(ordered);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
    }
  }

  return { move };
}
