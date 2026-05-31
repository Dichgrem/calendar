import { useState, useCallback, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";

const MONTHS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null);
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date().toISOString(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());

  const { data: calendars, isLoading: calLoading, isError: calError } = useCalendars();

  useEffect(() => {
    if (calendars) setVisibleCalendars(new Set(calendars.map((c) => c.id)));
  }, [calendars]);

  const { data: events, isLoading: evLoading, isError: evError } = useEvents(
    [...visibleCalendars], dateRange.start, dateRange.end,
  );

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
    setCurrentDate(arg.view.currentStart);
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

  const api = () => calRef.current?.getApi();

  const gotoDate = useCallback((year: number, month: number) => {
    api()?.gotoDate(new Date(year, month, 1));
    setPickerOpen(false);
  }, []);

  const goToday = () => { api()?.today(); setPickerOpen(false); };
  const goPrev = () => api()?.prev();
  const goNext = () => api()?.next();

  const dateLabel = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;

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
      <nav className="flex items-center gap-1 px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={goPrev} className="size-7 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm">‹</button>
          <button onClick={() => setPickerOpen((v) => !v)}
            className="px-2 py-1 text-sm rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium">
            {dateLabel}
          </button>
          <button onClick={goNext} className="size-7 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm">›</button>
          <button onClick={goToday} className="px-2 py-1 text-xs rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">今天</button>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          {calLoading && <span className="text-xs text-neutral-400">加载...</span>}
          {calError && <span className="text-xs text-red-500">失败</span>}

          {calendars?.map((cal) => (
            <button
              key={cal.id}
              onClick={() => toggleCalendar(cal.id)}
              title={cal.name}
              className="relative size-6 rounded-full border-2 transition-all shrink-0"
              style={{
                backgroundColor: visibleCalendars.has(cal.id) ? cal.color : "transparent",
                borderColor: cal.color,
                opacity: visibleCalendars.has(cal.id) ? 1 : 0.4,
              }}
            />
          ))}

          {calendars?.length === 0 && !calLoading && (
            <span className="text-xs text-neutral-400">暂无日历</span>
          )}
        </div>
      </nav>

      <div className="flex-1 p-2 relative">
        {evLoading && <p className="text-xs text-neutral-400 mb-1">加载事件...</p>}
        {evError && <p className="text-xs text-red-500 mb-1">加载事件失败</p>}

        {pickerOpen && (
          <div className="absolute top-2 left-4 z-50 w-64 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 shadow-lg p-3">
            <div className="flex items-center justify-center gap-3 mb-3">
              <button onClick={() => setPickerYear((y) => y - 1)}
                className="size-7 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-lg leading-none">‹</button>
              <div className="flex items-center gap-1">
                <input type="number" value={pickerYear} onChange={(e) => setPickerYear(Number(e.target.value))}
                  className="w-16 text-center text-sm border rounded px-1 py-0.5 bg-transparent dark:border-neutral-700" />
                <span className="text-sm text-neutral-400">年</span>
              </div>
              <button onClick={() => setPickerYear((y) => y + 1)}
                className="size-7 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-lg leading-none">›</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((m, i) => (
                <button key={m} onClick={() => gotoDate(pickerYear, i)}
                  className="px-2 py-1.5 text-sm rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">{m}</button>
              ))}
            </div>
            <button onClick={goToday}
              className="mt-2 w-full py-1 text-sm border rounded border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800">今天</button>
          </div>
        )}

        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={fcEvents}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="100%"
          locale="zh-cn"
          headerToolbar={false}
        />
      </div>
    </div>
  );
}
