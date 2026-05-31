import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import { Plus } from "lucide-react";
import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";
import { useSettings } from "../hooks/use-settings";
import { useI18n } from "../hooks/use-i18n";
import { useTopBar } from "./Layout";
import { EventEditor } from "./EventEditor";
import { formatCalendarDate } from "../lib/date-format";
import type { Event } from "../types";

const MONTHS_ZH = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null);
  const topBar = useTopBar();
  const { t, lang } = useI18n();
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date().toISOString(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(new Date());

  const { data: calendars, isLoading: calLoading, isError: calError } = useCalendars();
  const { data: settings } = useSettings();

  useEffect(() => {
    const calendarApi = calRef.current?.getApi();
    if (calendarApi && settings) {
      calendarApi.setOption("locale", settings.language === "en" ? "en" : "zh-cn");
      calendarApi.setOption("firstDay", settings.firstDayOfWeek ?? 0);
      calendarApi.setOption("displayEventTime", settings.showEventTime ?? true);
    }
  }, [settings?.language, settings?.firstDayOfWeek, settings?.showEventTime]);

  useEffect(() => {
    const dateFormat = settings?.dateFormat ?? (lang === "en" ? "en" : "zh");
    if (!/[Hms]/i.test(dateFormat)) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [settings?.dateFormat]);

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
    const ev = events.find((e) => e.id === arg.event.id);
    if (ev) setSelectedEvent(ev);
  }, [events]);

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

  const isEn = lang === "en";
  const months = isEn ? MONTHS_EN : MONTHS_ZH;
  const dateFormat = settings?.dateFormat ?? "zh";
  const hasTime = /[Hms]/i.test(dateFormat);
  const displayDate = hasTime ? now : currentDate;
  const dateLabel = formatCalendarDate(displayDate, dateFormat, lang);

  const calendarColorMap = new Map(calendars?.map((c) => [c.id, c.color]) ?? []);

  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.startAt,
    end: e.endAt,
    allDay: e.allDay,
    color: e.color ?? calendarColorMap.get(e.calendarId),
  }));

  const leftControls = (
    <div className="flex items-center gap-1.5">
      <button onClick={() => setPickerOpen((v) => !v)}
        className={`px-3 py-1.5 text-base font-semibold rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 tabular-nums${hasTime ? " font-mono" : ""}`}>
        {dateLabel}
      </button>
      <button onClick={goPrev} className="size-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-2xl">‹</button>
      <button onClick={goToday} className="min-h-8 px-3 text-xs rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium tracking-wide leading-8">{t("cal.today")}</button>
      <button onClick={goNext} className="size-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-2xl">›</button>
    </div>
  );

  const centerControls = (
    <>
      {calLoading && <span className="text-xs text-neutral-400">{t("cal.loading")}</span>}
      {calError && <span className="text-xs text-red-500">{t("cal.failed")}</span>}
      {calendars?.map((cal) => (
        <button
          key={cal.id}
          onClick={() => toggleCalendar(cal.id)}
          title={cal.name}
          className="relative size-5 rounded-full border-2 transition-all shrink-0"
          style={{
            backgroundColor: visibleCalendars.has(cal.id) ? cal.color : "transparent",
            borderColor: cal.color,
            opacity: visibleCalendars.has(cal.id) ? 1 : 0.4,
          }}
        />
      ))}
      {calendars?.length === 0 && !calLoading && (
        <span className="text-xs text-neutral-400">{t("cal.noCalendars")}</span>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(leftControls, topBar.left)}
      {topBar?.center && createPortal(centerControls, topBar.center)}

      <div className="flex-1 p-2 relative">
        {evLoading && <p className="text-xs text-neutral-400 mb-1">{t("cal.loadingEvents")}</p>}
        {evError && <p className="text-xs text-red-500 mb-1">{t("cal.failedEvents")}</p>}

        {pickerOpen && (
          <div className="absolute top-2 left-4 z-50 w-56 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 shadow-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear((y) => y - 1)}
                className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">‹</button>
              <input type="number" value={pickerYear} onChange={(e) => setPickerYear(Number(e.target.value))}
                className="w-16 text-center text-sm font-semibold border-0 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              <button onClick={() => setPickerYear((y) => y + 1)}
                className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">›</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {months.map((m, i) => {
                const isCurrent = i === currentDate.getMonth() && pickerYear === currentDate.getFullYear();
                return (
                  <button key={m} onClick={() => gotoDate(pickerYear, i)}
                    className={`px-2 py-1.5 text-sm rounded-md transition-colors ${isCurrent ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>{m}</button>
                );
              })}
            </div>
            <button onClick={goToday}
              className="mt-2 w-full py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 font-medium">{t("cal.today")}</button>
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
          locale={isEn ? "en" : "zh-cn"}
          firstDay={settings?.firstDayOfWeek ?? 0}
          displayEventTime={settings?.showEventTime ?? true}
          headerToolbar={false}
        />
      </div>

      {/* FAB: create event */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-6 z-40 size-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        title={t("event.create")}
      >
        <Plus className="size-6" />
      </button>

      {selectedEvent && (
        <EventEditor
          mode="edit"
          event={selectedEvent}
          open
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {creating && (
        <EventEditor
          mode="create"
          calendars={calendars ?? []}
          defaultCalendarId={[...visibleCalendars][0]}
          open
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
