import { Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DarkModeToggle } from "../components/DarkModeToggle";
import { SearchDropdown } from "../components/SearchDropdown";
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const queryClient = useQueryClient();

  const { sortedCalendars: calendars } = useNav();
  const { data: settings } = useSettings();

  const firstDayOfWeek = settings?.firstDayOfWeek ?? 1;
  const orderedWeekdays = useMemo(
    () => getOrderedWeekdays(settings?.language ?? "zh-CN", firstDayOfWeek),
    [settings?.language, firstDayOfWeek],
  );

  const eventStart = useMemo(() => {
    const d = new Date(displayMonth.year, displayMonth.month, 1);
    d.setDate(d.getDate() - 7);
    return `${dateStr(d)}T00:00:00`;
  }, [displayMonth.year, displayMonth.month]);
  const eventEnd = useMemo(() => {
    const d = new Date(displayMonth.year, displayMonth.month + 1, 0);
    d.setDate(d.getDate() + 7);
    return `${dateStr(d)}T23:59:59`;
  }, [displayMonth.year, displayMonth.month]);

  // Cancel stale events queries when month changes to prevent connection pool exhaustion
  useEffect(() => {
    queryClient.cancelQueries({
      queryKey: ["events"],
      predicate: (q) => {
        const [, s, e] = q.queryKey;
        return s !== eventStart || e !== eventEnd;
      },
    });
  }, [eventStart, eventEnd]);

  const { data: events, isError: evError } = useEvents(searchQuery ? "" : eventStart, searchQuery ? "" : eventEnd);
  const searchQRef = useRef(searchQuery);
  searchQRef.current = searchQuery;
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const { data: allEvents } = useQuery({
    queryKey: ["events", "search", debouncedQ],
    queryFn: async () => {
      if (!debouncedQ) return [];
      const raw = (await api.events.all("2000-01-01T00:00:00Z", "2099-12-31T23:59:59Z", debouncedQ)).data ?? [];
      // Dedup same event from multiple calendars by (title, startAt)
      const seen = new Set<string>();
      return raw.filter((e: Event) => {
        const key = `${e.title}|${e.startAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: !!debouncedQ,
    placeholderData: (prev) => prev ?? [],
  });

  const searchableEvents = searchQuery ? allEvents : events;

  const calendarColorMap = useMemo(() => new Map(calendars?.map((c) => [c.id, c.color]) ?? []), [calendars]);
  const dotCalendarIds = useMemo(
    () => new Set(calendars?.filter((c) => c.sourceType === "ics_import").map((c) => c.id) ?? []),
    [calendars],
  );

  const filteredEvents = useMemo(() => {
    const calOrder = new Map((calendars ?? []).map((c, i) => [c.id, i]));
    const seen = new Set<string>();
    return (searchableEvents ?? [])
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        if (searchQuery) {
          return (
            (!searchCalId || e.calendarId === searchCalId) && e.title.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }
        return visibleCalendars.has(e.calendarId);
      })
      .sort((a, b) => {
        const ai = calOrder.get(a.calendarId) ?? 99;
        const bi = calOrder.get(b.calendarId) ?? 99;
        if (ai !== bi) return ai - bi;
        return (a.startAt || "").localeCompare(b.startAt || "");
      });
  }, [searchableEvents, searchCalId, searchQuery, calendars, visibleCalendars]);

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

  useEffect(() => {
    if (!searchOpen) return;
    const calIds: (string | null)[] = [null, ...(calendars?.map((c) => c.id) ?? [])];

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
  }, [searchOpen, calendars, searchCalId, setDisplayMonth, setSearchQuery, setSearchCalId, setSearchOpen]);

  const searchDropdown = searchOpen ? (
    <SearchDropdown
      calendars={calendars}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchCalId={searchCalId}
      setSearchCalId={setSearchCalId}
      filteredEvents={filteredEvents}
      highlightedIndex={highlightedIndex}
      setDisplayMonth={setDisplayMonth}
      setHighlightDate={setHighlightDate}
      setSearchOpen={setSearchOpen}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full">
      {topBar?.left &&
        createPortal(<LeftControls highlightDate={highlightDate} setHighlightDate={setHighlightDate} />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      {topBar?.searchDropdown && searchDropdown && createPortal(searchDropdown, topBar.searchDropdown)}

      {evError && <p className="text-xs text-red-500 mb-1">{t("cal.failedEvents")}</p>}
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
      <div className="flex-1 relative overflow-y-auto border-l border-r border-neutral-300 dark:border-neutral-600">
        <MonthGrid
          year={displayMonth.year}
          month={displayMonth.month}
          firstDayOfWeek={firstDayOfWeek}
          events={filteredEvents}
          calendarColorMap={calendarColorMap}
          dotCalendarIds={dotCalendarIds}
          highlightDate={highlightDate}
          showLunar={settings?.showLunarCalendar ?? false}
          showEventTime={settings?.showEventTime ?? false}
          onDateClick={(d) => setHighlightDate(dateStr(d))}
          onEventClick={(ev) => setSelectedEvent(ev)}
        />
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3 group">
        <DarkModeToggle />
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
          defaultCalendarId={settings?.defaultCalendarId || ([...visibleCalendars][0] ?? calendars?.[0]?.id)}
          defaultStart={highlightDate ? new Date(`${highlightDate}T00:00:00`) : undefined}
          open
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
