import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useCalendars } from "./use-calendars";

interface NavState {
  displayMonth: { year: number; month: number };
  setDisplayMonth: (m: { year: number; month: number }) => void;
  visibleCalendars: Set<string>;
  setVisibleCalendars: (s: Set<string>) => void;
  toggleCalendar: (id: string) => void;
  labelOverride: string | null;
  setLabelOverride: (s: string | null) => void;
}

const NavCtx = createContext<NavState>({
  displayMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  setDisplayMonth: () => {},
  visibleCalendars: new Set(),
  setVisibleCalendars: () => {},
  toggleCalendar: () => {},
  labelOverride: null,
  setLabelOverride: () => {},
});

export function useNav() {
  return useContext(NavCtx);
}

export function NavProvider({ children }: { children: ComponentChildren }) {
  const [displayMonth, setDisplayMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const { data: calendars } = useCalendars();
  const prevCalIdsRef = useRef<string>("");

  useEffect(() => {
    if (calendars) {
      const newIds = new Set(calendars.map((c) => c.id));
      setVisibleCalendars((prev) => {
        const merged = new Set<string>();
        for (const id of newIds) {
          if (prev.has(id)) merged.add(id);
        }
        for (const id of newIds) {
          if (!prev.has(id)) merged.add(id);
        }
        if (merged.size === prev.size && [...merged].every((id) => prev.has(id))) return prev;
        return merged;
      });
      prevCalIdsRef.current = [...newIds].sort().join(",");
    }
  }, [calendars]);

  const toggleCalendar = useCallback((id: string) => {
    setVisibleCalendars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      displayMonth,
      setDisplayMonth,
      visibleCalendars,
      setVisibleCalendars,
      toggleCalendar,
      labelOverride,
      setLabelOverride,
    }),
    [displayMonth, visibleCalendars, toggleCalendar, labelOverride],
  );

  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}
