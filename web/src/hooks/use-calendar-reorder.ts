import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCalendarReorder(calendarIds: string[]) {
  const queryClient = useQueryClient();
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const onDragStart = (e: React.DragEvent, id: string) => {
    dragRef.current = id;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragRef.current;
    if (!sourceId || sourceId === targetId) return;

    const ordered = [...calendarIds];
    const fromIdx = ordered.indexOf(sourceId);
    const toIdx = ordered.indexOf(targetId);
    ordered.splice(fromIdx, 1);
    ordered.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, sourceId);

    await api.calendars.reorder(ordered);
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
    dragRef.current = null;
    setDragId(null);
  };

  const onDragEnd = () => {
    dragRef.current = null;
    setDragId(null);
  };

  return { dragId, onDragStart, onDragOver, onDrop, onDragEnd };
}
