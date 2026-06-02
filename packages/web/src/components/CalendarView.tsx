import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { Plus, Sun, Moon } from "@phosphor-icons/react";
import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";
import { useSettings } from "../hooks/use-settings";
import { useI18n } from "../hooks/use-i18n";
import { useNav } from "../hooks/use-nav";
import { useTopBar, useSearch } from "./Layout";
import { EventEditor } from "./EventEditor";
import { LeftControls, CenterControls } from "./TopBarControls";
import { formatCalendarDate, dateStr } from "../lib/date-format";
import { getLunarText } from "../lib/lunar";
import type { Event } from "../types";

export function CalendarView() {
  const calRef = useRef<FullCalendar>(null);
  const topBar = useTopBar();
  const { t, lang } = useI18n();
  const { searchQuery, setSearchQuery, searchCalId, setSearchCalId, searchOpen, setSearchOpen } = useSearch();
  const { visibleCalendars, setDisplayMonth } = useNav();
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date().toISOString(),
  });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "1");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const { data: calendars, isLoading: calLoading, isError: calError } = useCalendars();
  const { data: settings } = useSettings();

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

  useEffect(() => {
    const calendarApi = calRef.current?.getApi();
    if (calendarApi && settings) {
      calendarApi.setOption("locale", settings.language === "en" ? "en" : "zh-cn");
      calendarApi.setOption("firstDay", settings.firstDayOfWeek ?? 1);
      calendarApi.setOption("displayEventTime", settings.showEventTime ?? false);
    }
  }, [settings?.language, settings?.firstDayOfWeek, settings?.showEventTime]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
    setTimeout(applyHighlight, 60);
  }, []);

  const { data: events, isLoading: evLoading, isError: evError } = useEvents(
    [...visibleCalendars],
    searchQuery ? "" : dateRange.start,
    searchQuery ? "" : dateRange.end,
  );

  const { data: allEvents } = useEvents(
    searchQuery ? (calendars?.map((c) => c.id) ?? []) : [],
    searchQuery ? "2000-01-01T00:00:00Z" : "",
    searchQuery ? "2099-12-31T23:59:59Z" : "",
  );

  const searchableEvents = searchQuery ? allEvents : events;

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("darkMode", next ? "1" : "0");
    document.documentElement.className = next ? "dark" : "light";
  };

  const calendarColorMap = new Map(calendars?.map((c) => [c.id, c.color]) ?? []);

  const filteredEvents = searchableEvents
    .filter((e) => (!searchCalId || e.calendarId === searchCalId) && (!searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase())));

  useEffect(() => {
    if (!searchQuery) setSearchCalId(null);
    setHighlightedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchOpen]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    const el = document.querySelector(`[data-search-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  useEffect(() => {
    if (!searchOpen) return;
    const calIds = [null, ...(calendars?.map((c) => c.id) ?? [])];
    const maxIdx = Math.min(filteredEvents.length, 20) - 1;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, maxIdx));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i === -1 ? maxIdx : Math.max(i - 1, 0)));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
        setSearchCalId(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const curIdx = calIds.indexOf(searchCalId);
        const nextIdx = (curIdx - 1 + calIds.length) % calIds.length;
        setSearchCalId(calIds[nextIdx]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const curIdx = calIds.indexOf(searchCalId);
        const nextIdx = (curIdx + 1) % calIds.length;
        setSearchCalId(calIds[nextIdx]);
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const ev = filteredEvents[highlightedIndex];
        if (ev && ev.startAt) {
          const d = new Date(ev.startAt);
          setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
          calRef.current?.getApi()?.gotoDate(d);
          setHighlightDate(dateStr(d));
          setTimeout(() => setHighlightDate(null), 2000);
        }
        setSearchQuery("");
        setSearchCalId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, searchQuery, highlightedIndex, filteredEvents, searchCalId, calendars]);

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

  const leftControls = (
    <LeftControls
      calRef={calRef as any}
      highlightDate={highlightDate}
      setHighlightDate={setHighlightDate}
    />
  );

  const centerControls = <CenterControls />;

  const searchDropdown = searchOpen ? (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 mt-1 w-96 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg">
      <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <input
          type="text"
          placeholder={t("cal.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="w-full h-7 text-sm text-neutral-800 dark:text-neutral-200 border rounded-lg px-2.5 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
        />
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
        <button
          onClick={() => setSearchCalId(null)}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${searchCalId === null ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}
        >{t("cal.all")}</button>
          {calendars?.map((cal) => (
            <button
              key={cal.id}
              onClick={() => setSearchCalId(cal.id)}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${searchCalId === cal.id ? "text-white" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
              style={searchCalId === cal.id ? { backgroundColor: cal.color } : { color: cal.color }}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: searchCalId === cal.id ? "#fff" : cal.color }} />
              <span>{cal.name}</span>
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {!searchQuery && (
          <p className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">{t("cal.search")}</p>
        )}
        {searchQuery && filteredEvents.length === 0 && (
          <p className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">{t("cal.noResults")}</p>
        )}
        {searchQuery && filteredEvents.slice(0, 20).map((e, idx) => {
          const cal = calendars?.find((c) => c.id === e.calendarId);
          return (
            <button
              key={e.id}
              data-search-index={idx}
              onClick={() => {
                if (e.startAt) {
                  const d = new Date(e.startAt);
                  setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
                  calRef.current?.getApi()?.gotoDate(d);
                  setHighlightDate(dateStr(d));
                  setTimeout(() => setHighlightDate(null), 2000);
                }
                setSearchOpen(false);
                setSearchQuery("");
                setSearchCalId(null);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${idx === highlightedIndex ? "bg-blue-50 dark:bg-blue-950" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}
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

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(leftControls, topBar.left)}
      {topBar?.center && createPortal(centerControls, topBar.center)}
      {topBar?.searchDropdown && searchDropdown && createPortal(searchDropdown, topBar.searchDropdown)}

      <div className="flex-1 relative">
        {evLoading && <p className="text-xs text-neutral-400 mb-1">{t("cal.loadingEvents")}</p>}
        {evError && <p className="text-xs text-red-500 mb-1">{t("cal.failedEvents")}</p>}

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
          locale={lang === "en" ? "en" : "zh-cn"}
          firstDay={settings?.firstDayOfWeek ?? 1}
          displayEventTime={settings?.showEventTime ?? false}
          headerToolbar={false}
        />
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 group">
        <button
          onClick={toggleDark}
          aria-label={dark ? t("cal.lightMode") : t("cal.darkMode")}
          className="size-10 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none group-hover:pointer-events-auto"
          title={dark ? t("cal.lightMode") : t("cal.darkMode")}
        >
          {dark ? <Sun className="size-5" weight="bold" /> : <Moon className="size-5" weight="bold" />}
        </button>
        <button
          onClick={() => setCreating(true)}
          aria-label={t("event.create")}
          className="size-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          title={t("event.create")}
        >
          <Plus className="size-6" weight="bold" />
        </button>
      </div>
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
          defaultStart={highlightDate ? new Date(highlightDate + "T00:00:00") : undefined}
          open
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
