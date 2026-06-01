import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { Plus, Circle, CaretLeft, CaretRight, Sun, Moon, GraduationCap } from "@phosphor-icons/react";
import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";
import { useSettings } from "../hooks/use-settings";
import { useI18n } from "../hooks/use-i18n";
import { useTopBar, useSearch } from "./Layout";
import { EventEditor } from "./EventEditor";
import { formatCalendarDate } from "../lib/date-format";
import { getLunarText } from "../lib/lunar";
import type { Event } from "../types";

const CourseSetup = lazy(() => import("./CourseSetup").then((m) => ({ default: m.CourseSetup })));

const MONTHS_ZH = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null);
  const topBar = useTopBar();
  const { t, lang } = useI18n();
  const { searchQuery, setSearchQuery, searchCalId, setSearchCalId } = useSearch();
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [displayMonth, setDisplayMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date().toISOString(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "1");
  const [courseSetupOpen, setCourseSetupOpen] = useState(false);

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
    if (calendars && settings) {
      const ids = settings.showCourseSchedule
        ? calendars.map((c) => c.id)
        : calendars.filter((c) => c.sourceType !== "course_schedule").map((c) => c.id);
      setVisibleCalendars(new Set(ids));
    }
  }, [calendars, settings?.showCourseSchedule]);

  const { data: events, isLoading: evLoading, isError: evError } = useEvents(
    [...visibleCalendars],
    searchQuery ? "" : dateRange.start,
    searchQuery ? "" : dateRange.end,
  );

  const { data: allEvents } = useEvents(
    calendars?.map((c) => c.id) ?? [],
    searchQuery ? "2000-01-01T00:00:00Z" : dateRange.start,
    searchQuery ? "2099-12-31T23:59:59Z" : dateRange.end,
  );

  const searchableEvents = searchQuery ? allEvents : events;

  const highlightRef = useRef<string | null>(null);

  const applyHighlight = () => {
    const cur = highlightRef.current;
    document.querySelectorAll<HTMLElement>(`td[data-date]`).forEach((el) =>
      el.classList.remove("fc-highlight-search")
    );
    if (cur) {
      document.querySelectorAll<HTMLElement>(`td[data-date="${cur}"]`).forEach((el) =>
        el.classList.add("fc-highlight-search")
      );
    }
  };

  useEffect(() => {
    highlightRef.current = highlightDate;
    setTimeout(applyHighlight, 50);
  }, [highlightDate]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
    setTimeout(applyHighlight, 60);
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

  const gotoDate = useCallback((dateOrYear: Date | number, month?: number) => {
    const date = dateOrYear instanceof Date ? dateOrYear : new Date(dateOrYear, month!, 1);
    if (date.getFullYear() < 1970) date.setFullYear(1970);
    api()?.gotoDate(date);
    setPickerOpen(false);
  }, []);

  const gotoMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1);
    setDisplayMonth({ year, month });
    api()?.gotoDate(d);
    setPickerOpen(false);
    const ds = dateStr(d);
    setHighlightDate(ds);
  };

  const goToday = () => {
    const d = new Date();
    setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
    api()?.today();
    setPickerOpen(false);
  };
  const goPrev = () => {
    const api2 = api();
    if (api2) {
      api2.prev();
      if (api2.view.currentStart.getFullYear() < 1970) api2.gotoDate(new Date(1970, 0, 1));
      const d = api2.getDate();
      setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
      const ds = dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
      setHighlightDate(ds);
    }
  };
  const goNext = () => {
    const api2 = api();
    if (api2) {
      api2.next();
      const d = api2.getDate();
      setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
      const ds = dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
      setHighlightDate(ds);
    }
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("darkMode", next ? "1" : "0");
    document.documentElement.className = next ? "dark" : "light";
  };

  const isEn = lang === "en";
  const months = isEn ? MONTHS_EN : MONTHS_ZH;
  const dateFormat = settings?.dateFormat ?? "zh";
  const highlightDateObj = highlightDate ? new Date(highlightDate + "T00:00:00") : null;
  const displayDate = highlightDateObj ?? new Date(displayMonth.year, displayMonth.month, 1);
  const dateLabel = formatCalendarDate(displayDate, dateFormat, lang);

  const calendarColorMap = new Map(calendars?.map((c) => [c.id, c.color]) ?? []);
  const filteredEvents = searchableEvents
    .filter((e) => (!searchCalId || e.calendarId === searchCalId) && (!searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase())));

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const ev = filteredEvents.find((e) => e.id === arg.event.id);
    if (ev) setSelectedEvent(ev);
  }, [filteredEvents]);

  const fcEvents = filteredEvents.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.startAt,
    end: e.endAt,
    allDay: e.allDay,
    color: e.color ?? calendarColorMap.get(e.calendarId),
  }));

  const searchDropdown = searchQuery ? (
    <div className="absolute top-0 left-0 right-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shadow-lg">
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
        <button
          onClick={() => setSearchCalId(null)}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${searchCalId === null ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}
        >{t("cal.all")}</button>
          {calendars?.map((cal) => (
            <button
              key={cal.id}
              onClick={() => setSearchCalId(cal.id)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              style={searchCalId === cal.id ? { backgroundColor: cal.color, color: "#fff" } : { color: cal.color }}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: searchCalId === cal.id ? "#fff" : cal.color }} />
              <span className="dark:hidden">{cal.name}</span>
              <span className="hidden dark:inline text-neutral-200">{cal.name}</span>
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filteredEvents.length === 0 && (
          <p className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500">{t("cal.noResults")}</p>
        )}
        {filteredEvents.slice(0, 20).map((e) => {
          const cal = calendars?.find((c) => c.id === e.calendarId);
          return (
            <button
              key={e.id}
              onClick={() => {
                if (e.startAt) {
                  const d = new Date(e.startAt);
                  gotoDate(d);
                  setHighlightDate(dateStr(d));
                  setTimeout(() => setHighlightDate(null), 2000);
                }
                setSearchQuery("");
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: cal?.color }} />
              <span className="text-sm truncate dark:text-neutral-200">{e.title}</span>
              <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{e.startAt ? new Date(e.startAt).toLocaleDateString() : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const leftControls = (
    <div className="flex items-center gap-0.5">
      <button onClick={() => { setPickerOpen((v) => !v); if (!pickerOpen) setPickerYear(displayMonth.year); }}
        className="px-3 py-1.5 text-base font-semibold rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-white tabular-nums">
        {dateLabel}
      </button>
      <button onClick={goPrev} className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"><CaretLeft className="size-4" weight="bold" /></button>
      <button onClick={goToday} className="size-7 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors" title={t("cal.today")}><Circle className="size-4" weight="bold" /></button>
      <button onClick={goNext} className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"><CaretRight className="size-4" weight="bold" /></button>
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
      {topBar?.searchDropdown && searchDropdown && createPortal(searchDropdown, topBar.searchDropdown)}

      <div className="flex-1 relative">
        {evLoading && <p className="text-xs text-neutral-400 mb-1">{t("cal.loadingEvents")}</p>}
        {evError && <p className="text-xs text-red-500 mb-1">{t("cal.failedEvents")}</p>}

        {pickerOpen && (
          <div className="absolute top-2 left-4 z-50 w-56 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 shadow-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear((y) => y - 1)}
                className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400">{`<`}</button>
              <input type="number" value={pickerYear} onChange={(e) => setPickerYear(Number(e.target.value))} min={1970}
                className="w-16 text-center text-sm font-semibold border-0 bg-transparent text-neutral-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              <button onClick={() => setPickerYear((y) => y + 1)}
                className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400">{`>`}</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {months.map((m, i) => {
                const isCurrent = i === displayMonth.month && pickerYear === displayMonth.year;
                return (
                  <button key={m} onClick={() => gotoMonth(pickerYear, i)}
                    className={`px-2 py-1.5 text-sm rounded-md transition-colors dark:text-neutral-300 ${isCurrent ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>{m}</button>
                );
              })}
            </div>
            <button onClick={goToday}
              className="mt-2 w-full py-1.5 flex items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"><Circle className="size-3.5" weight="bold" /></button>
          </div>
        )}

          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={fcEvents}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            dateClick={(arg) => {
              const ds = dateStr(arg.date);
              setHighlightDate(ds);
            }}
            dayCellContent={settings?.showLunarCalendar ? (arg) => {
              const lunarText = getLunarText(arg.date);
              return (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 min-w-[2em] text-right">{lunarText}</span>
                  <span>{arg.dayNumberText}</span>
                </div>
              );
            } : undefined}
            height="100%"
            locale={isEn ? "en" : "zh-cn"}
            firstDay={settings?.firstDayOfWeek ?? 0}
            displayEventTime={settings?.showEventTime ?? true}
            headerToolbar={false}
          />
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 group">
        <button
          onClick={() => setCourseSetupOpen(true)}
          className="size-10 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none group-hover:pointer-events-auto"
          title={t("cal.importCourse")}
        >
          <GraduationCap className="size-5" weight="bold" />
        </button>
        <button
          onClick={toggleDark}
          className="size-10 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none group-hover:pointer-events-auto"
          title={dark ? "浅色模式" : "深色模式"}
        >
          {dark ? <Sun className="size-5" weight="bold" /> : <Moon className="size-5" weight="bold" />}
        </button>
        <button
          onClick={() => setCreating(true)}
          className="size-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          title={t("event.create")}
        >
          <Plus className="size-6" weight="bold" />
        </button>
      </div>

      <Suspense fallback={null}>
        {courseSetupOpen && (
          <CourseSetup open={courseSetupOpen} onClose={() => setCourseSetupOpen(false)} />
        )}
      </Suspense>

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
          defaultCalendarId={[...visibleCalendars][0] ?? calendars?.[0]?.id}
          open
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
