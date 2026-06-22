import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Calendar } from "../types";
import { useCalendars } from "./use-calendars";

const HIDDEN_KEY = "hiddenCalendars";

function getHiddenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenSet(s: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
}

function getCalendarOrder(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("calendarOrder") || "{}");
  } catch {
    return {};
  }
}

export function saveCalendarOrder(order: Record<string, number>) {
  localStorage.setItem("calendarOrder", JSON.stringify(order));
}

interface NavState {
  displayMonth: { year: number; month: number };
  setDisplayMonth: (m: { year: number; month: number }) => void;
  visibleCalendars: Set<string>;
  toggleCalendar: (id: string) => void;
  labelOverride: string | null;
  setLabelOverride: (s: string | null) => void;
  bumpOrder: () => void;
  sortedCalendars: Calendar[] | undefined;
}

const NavCtx = createContext<NavState>({
  displayMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  setDisplayMonth: () => {},
  visibleCalendars: new Set(),
  toggleCalendar: () => {},
  labelOverride: null,
  setLabelOverride: () => {},
  bumpOrder: () => {},
  sortedCalendars: undefined,
});

export function useNav() {
  return useContext(NavCtx);
}

export function NavProvider({ children }: { children: ComponentChildren }) {
  const [displayMonth, setDisplayMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [hiddenCalendars, setHiddenCalendars] = useState(getHiddenSet);
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState(0);
  const { data: rawCalendars } = useCalendars();
  const prevCalIdsRef = useRef<string>("");

  // Sort by localStorage order
  const calendars = useMemo(() => {
    if (!rawCalendars) return rawCalendars;
    const order = getCalendarOrder();
    return [...rawCalendars].sort((a, b) => {
      const ai = order[a.id] ?? rawCalendars.indexOf(a);
      const bi = order[b.id] ?? rawCalendars.indexOf(b);
      return ai - bi;
    });
  }, [rawCalendars, orderVersion]);

  // visible = all minus explicitly hidden
  const visibleCalendars = useMemo(() => {
    if (!calendars) return new Set<string>();
    const allIds = new Set(calendars.map((c) => c.id));
    for (const id of hiddenCalendars) allIds.delete(id);
    return allIds;
  }, [calendars, hiddenCalendars]);

  // Auto-hide removed calendars
  useEffect(() => {
    if (calendars) {
      const newIds = [...calendars.map((c) => c.id)].sort().join(",");
      if (newIds !== prevCalIdsRef.current) {
        const valid = new Set(calendars.map((c) => c.id));
        const cleaned = new Set([...hiddenCalendars].filter((id) => valid.has(id)));
        if (cleaned.size !== hiddenCalendars.size) {
          setHiddenCalendars(cleaned);
          saveHiddenSet(cleaned);
        }
        prevCalIdsRef.current = newIds;
      }
    }
  }, [calendars]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCalendar = useCallback((id: string) => {
    setHiddenCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveHiddenSet(next);
      return next;
    });
  }, []);

  const bumpOrder = useCallback(() => setOrderVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({
      displayMonth,
      setDisplayMonth,
      visibleCalendars,
      toggleCalendar,
      labelOverride,
      setLabelOverride,
      bumpOrder,
      sortedCalendars: calendars,
    }),
    [displayMonth, visibleCalendars, toggleCalendar, labelOverride, bumpOrder, calendars],
  );

  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}
