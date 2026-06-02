import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
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

export function NavProvider({ children }: { children: ReactNode }) {
  const [displayMonth, setDisplayMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const { data: calendars } = useCalendars();

  useEffect(() => {
    if (calendars) {
      setVisibleCalendars(new Set(calendars.map((c) => c.id)));
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

  return (
    <NavCtx.Provider value={{ displayMonth, setDisplayMonth, visibleCalendars, setVisibleCalendars, toggleCalendar, labelOverride, setLabelOverride }}>
      {children}
    </NavCtx.Provider>
  );
}
