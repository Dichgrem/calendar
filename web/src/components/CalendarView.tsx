import { Moon, Plus, Sun } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useCalendars } from "../hooks/use-calendars";
import { useEvents } from "../hooks/use-events";
import { useI18n } from "../hooks/use-i18n";
import { useNav } from "../hooks/use-nav";
import { useSettings } from "../hooks/use-settings";
import { api } from "../lib/api";
import { dateStr } from "../lib/date-format";
import type { Event } from "../types";
import { EventEditor } from "./EventEditor";
import { useSearch, useTopBar } from "./Layout";
import { getOrderedWeekdays, MonthGrid } from "./MonthGrid";
import { CenterControls, LeftControls } from "./TopBarControls";

export function CalendarView() {
  const topBar = useTopBar();
  const { t } = useI18n();
  const { searchQuery, setSearchQuery, searchCalId, setSearchCalId, searchOpen, setSearchOpen } = useSearch();
  const { visibleCalendars, displayMonth, setDisplayMonth } = useNav();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("darkMode") === "1";
    document.documentElement.className = saved ? "dark" : "light";
    return saved;
  });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const queryClient = useQueryClient();

  const { data: calendars } = useCalendars();
  const { data: settings } = useSettings();
  const allCalIds = useMemo(() => calendars?.map((c) => c.id) ?? [], [calendars]);

  const firstDayOfWeek = settings?.firstDayOfWeek ?? 1;
  const orderedWeekdays = useMemo(
    () => getOrderedWeekdays(settings?.language ?? "zh-CN", firstDayOfWeek),
    [settings?.language, firstDayOfWeek],
  );

  // Month range for event queries — must cover full 42-cell grid,
  // not just the calendar month, to show events from adjacent months.
  // Both boundaries use local date strings to avoid UTC drift.
  const gridStart = new Date(displayMonth.year, displayMonth.month, 1);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() - firstDayOfWeek + 7) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 41);

  const {
    data: events,
    isLoading: evLoading,
    isError: evError,
  } = useEvents(
    searchQuery ? [] : allCalIds.filter((id) => visibleCalendars.has(id)),
    searchQuery ? "" : `${dateStr(new Date(gridStart.getTime() - 86400000))}T00:00:00`,
    searchQuery ? "" : `${dateStr(new Date(gridEnd.getTime() + 86400000))}T23:59:59`,
  );
  const { data: allEvents } = useEvents(
    searchQuery ? allCalIds : [],
    searchQuery ? "2000-01-01T00:00:00Z" : "",
    searchQuery ? "2099-12-31T23:59:59Z" : "",
  );

  const searchableEvents = searchQuery ? allEvents : events;

  // Prefetch adjacent months for instant navigation
  useEffect(() => {
    if (searchQuery || !allCalIds.length) return;
    const visibleIds = allCalIds.filter((id) => visibleCalendars.has(id));
    if (!visibleIds.length) return;

    const prefetchMonth = (year: number, month: number) => {
      const d = new Date(year, month, 1);
      d.setDate(d.getDate() - ((d.getDay() - firstDayOfWeek + 7) % 7));
      const s = `${dateStr(new Date(d.getTime() - 86400000))}T00:00:00`;
      const e = `${dateStr(new Date(d.getTime() + 41 * 86400000))}T23:59:59`;
      queryClient.prefetchQuery({
        queryKey: ["events", visibleIds, s, e],
        queryFn: () =>
          Promise.all(visibleIds.map((id) => api.events.list(id, s, e))).then((res) =>
            res.flatMap((r: any) => r.data ?? []),
          ),
      });
    };

    // Next month
    const nm = displayMonth.month + 1;
    prefetchMonth(nm > 11 ? displayMonth.year + 1 : displayMonth.year, nm > 11 ? 0 : nm);
    // Previous month
    const pm = displayMonth.month - 1;
    prefetchMonth(pm < 0 ? displayMonth.year - 1 : displayMonth.year, pm < 0 ? 11 : pm);
  }, [displayMonth, allCalIds, firstDayOfWeek, visibleCalendars, searchQuery, queryClient]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("darkMode", next ? "1" : "0");
    document.documentElement.className = next ? "dark" : "light";
    document.body.className = next
      ? "bg-background text-neutral-800 dark:text-neutral-200 antialiased dark"
      : "bg-background text-neutral-800 dark:text-neutral-200 antialiased light";
  };

  const calendarColorMap = useMemo(() => new Map(calendars?.map((c) => [c.id, c.color]) ?? []), [calendars]);
  const dotCalendarIds = useMemo(
    () => new Set(calendars?.filter((c) => c.sourceType === "ics_import").map((c) => c.id) ?? []),
    [calendars],
  );

  const filteredEvents = useMemo(() => {
    // Build a stable calendar order from the full calendar list (not just visible ones).
    // This prevents event ordering from shifting when toggling visibility.
    const calOrder = new Map(allCalIds.map((id, i) => [id, i]));
    return (searchableEvents ?? [])
      .filter(
        (e) =>
          (!searchCalId || e.calendarId === searchCalId) &&
          (!searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase())),
      )
      .sort((a, b) => {
        const ai = calOrder.get(a.calendarId) ?? 99;
        const bi = calOrder.get(b.calendarId) ?? 99;
        if (ai !== bi) return ai - bi;
        // Within same calendar, sort by start time
        return (a.startAt || "").localeCompare(b.startAt || "");
      });
  }, [searchableEvents, searchCalId, searchQuery, allCalIds]);

  const filteredEventsRef = useRef<Event[]>([]);
  const highlightedIndexRef = useRef(-1);
  useEffect(() => {
    filteredEventsRef.current = filteredEvents;
  }, [filteredEvents]);
  useEffect(() => {
    highlightedIndexRef.current = highlightedIndex;
  }, [highlightedIndex]);
  useEffect(() => {
    if (!searchQuery) setSearchCalId(null);
    setHighlightedIndex(-1);
  }, [searchQuery, setSearchCalId]);
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchOpen]);
  useEffect(() => {
    if (highlightedIndex < 0) return;
    document.querySelector(`[data-search-index="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  // Keyboard handler (refs avoid re-binding on filteredEvents change)
  useEffect(() => {
    if (!searchOpen) return;
    const calIds: (string | null)[] = [null, ...allCalIds];

    const handler = (e: KeyboardEvent) => {
      const events = filteredEventsRef.current;
      const idx = highlightedIndexRef.current;
      const maxIdx = Math.min(events.length, 20) - 1;

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
        setSearchCalId(calIds[(curIdx - 1 + calIds.length) % calIds.length]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const curIdx = calIds.indexOf(searchCalId);
        setSearchCalId(calIds[(curIdx + 1) % calIds.length]);
      } else if (e.key === "Enter" && idx >= 0) {
        e.preventDefault();
        const ev = events[idx];
        if (ev?.startAt) {
          const d = new Date(ev.startAt);
          setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
          setHighlightDate(dateStr(d));
        }
        setSearchQuery("");
        setSearchCalId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, allCalIds, searchCalId, setDisplayMonth, setSearchQuery, setSearchCalId, setSearchOpen]);

  const handleEventClick = (ev: Event) => setSelectedEvent(ev);

  const searchDropdown = searchOpen ? (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 mt-1 min-w-[24rem] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg">
      <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <input
          ref={(el) => el?.focus()}
          type="text"
          placeholder={t("cal.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          className="w-full h-7 text-sm text-neutral-800 dark:text-neutral-200 border rounded-lg px-2.5 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
        />
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 overflow-x-auto flex-nowrap">
        <button
          type="button"
          onClick={() => setSearchCalId(null)}
          className={`px-2 py-0.5 text-xs rounded-full transition-colors ${searchCalId === null ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}
        >
          {t("cal.all")}
        </button>
        {calendars?.map((cal) => (
          <button
            type="button"
            key={cal.id}
            onClick={() => setSearchCalId(cal.id)}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${searchCalId === cal.id ? "text-white" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
            style={searchCalId === cal.id ? { backgroundColor: cal.color } : { color: cal.color }}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: searchCalId === cal.id ? "#fff" : cal.color }}
            />
            <span className="truncate max-w-[8rem]" title={cal.name}>
              {cal.name}
            </span>
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {searchQuery && filteredEvents.length === 0 && (
          <p className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">{t("cal.noResults")}</p>
        )}
        {searchQuery &&
          filteredEvents.slice(0, 20).map((e, idx) => {
            const cal = calendars?.find((c) => c.id === e.calendarId);
            return (
              <button
                type="button"
                key={e.id}
                data-search-index={idx}
                onClick={() => {
                  if (e.startAt) {
                    const d = new Date(e.startAt);
                    setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
                    setHighlightDate(dateStr(d));
                  }
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchCalId(null);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${idx === highlightedIndex ? "bg-blue-50 dark:bg-blue-950" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}
              >
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: cal?.color }} />
                <span className="text-sm truncate text-neutral-800 dark:text-neutral-200">{e.title}</span>
                <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
                  {e.startAt ? new Date(e.startAt).toLocaleDateString() : ""}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full">
      {topBar?.left &&
        createPortal(<LeftControls highlightDate={highlightDate} setHighlightDate={setHighlightDate} />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      {topBar?.searchDropdown && searchDropdown && createPortal(searchDropdown, topBar.searchDropdown)}

      {evLoading && <p className="text-xs text-neutral-400 mb-1">{t("cal.loadingEvents")}</p>}
      {evError && <p className="text-xs text-red-500 mb-1">{t("cal.failedEvents")}</p>}
      {/* Weekday header — fixed, not scrolling with grid */}
      <div className="grid grid-cols-7 text-center border-b border-neutral-300 dark:border-neutral-600 shrink-0 border-l border-r">
        {orderedWeekdays.map((w) => (
          <span
            key={w}
            className="py-0.5 text-base font-bold text-neutral-800 dark:text-neutral-200 border-r border-neutral-300 dark:border-neutral-600 last:border-r-0"
          >
            {w}
          </span>
        ))}
      </div>
      {/* Scrollable grid */}
      <div className="flex-1 relative overflow-y-auto border-l border-r border-neutral-300 dark:border-neutral-600">
        <MonthGrid
          year={displayMonth.year}
          month={displayMonth.month}
          firstDayOfWeek={firstDayOfWeek}
          events={filteredEvents}
          calendarColorMap={calendarColorMap}
          dotCalendarIds={dotCalendarIds}
          highlightDate={highlightDate}
          onDateClick={(d) => setHighlightDate(dateStr(d))}
          onEventClick={handleEventClick}
        />
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 group">
        <button
          type="button"
          onClick={toggleDark}
          aria-label={dark ? t("cal.lightMode") : t("cal.darkMode")}
          className="size-10 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none group-hover:pointer-events-auto"
        >
          {dark ? <Sun className="size-5" weight="bold" /> : <Moon className="size-5" weight="bold" />}
        </button>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label={t("event.create")}
          className="size-12 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Plus className="size-6" weight="bold" />
        </button>
      </div>

      {selectedEvent && <EventEditor mode="edit" event={selectedEvent} open onClose={() => setSelectedEvent(null)} />}
      {creating && (
        <EventEditor
          mode="create"
          calendars={calendars ?? []}
          defaultCalendarId={[...visibleCalendars][0] ?? calendars?.[0]?.id}
          defaultStart={highlightDate ? new Date(`${highlightDate}T00:00:00`) : undefined}
          open
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
