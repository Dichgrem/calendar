import { useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";

type ViewMode = "dayGridMonth" | "timeGridWeek";

export function CalendarView() {
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const now = new Date().toISOString();
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: now,
    end: now,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("dayGridMonth");

  const { data: calendars, isLoading: calLoading, isError: calError } = useCalendars();

  const { data: events, isLoading: evLoading, isError: evError } = useEvents(
    [...visibleCalendars],
    dateRange.start,
    dateRange.end,
  );

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    console.log("event clicked", arg.event.id);
  }, []);

  const toggleCalendar = useCallback((id: string) => {
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.startAt,
    end: e.endAt,
    allDay: e.allDay,
    color: e.color ?? undefined,
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto">
        {calLoading && <span className="text-xs text-neutral-400 shrink-0">加载日历...</span>}
        {calError && <span className="text-xs text-red-500 shrink-0">加载失败</span>}

        {calendars?.map((cal) => (
          <label
            key={cal.id}
            className="flex items-center gap-1.5 cursor-pointer text-sm shrink-0 select-none"
          >
            <input
              type="checkbox"
              checked={visibleCalendars.has(cal.id)}
              onChange={() => toggleCalendar(cal.id)}
              style={{ accentColor: cal.color }}
            />
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: cal.color }}
            />
            <span className="text-neutral-600 dark:text-neutral-400">{cal.name}</span>
          </label>
        ))}

        {calendars?.length === 0 && !calLoading && (
          <span className="text-xs text-neutral-400">暂无日历，请先导入或创建</span>
        )}
      </div>

      <div className="flex-1 p-2">
        {evLoading && (
          <p className="text-xs text-neutral-400 mb-1">加载事件...</p>
        )}
        {evError && (
          <p className="text-xs text-red-500 mb-1">加载事件失败</p>
        )}
        <FullCalendar
          key={viewMode}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={viewMode}
          events={fcEvents}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="100%"
          locale="zh-cn"
          headerToolbar={{
            left: "title",
            center: "",
            right: "dayGridMonth,timeGridWeek today prev,next",
          }}
          buttonText={{
            dayGridMonth: "月",
            timeGridWeek: "周",
          }}
        />
      </div>
    </div>
  );
}
