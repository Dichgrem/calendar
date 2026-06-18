import { memo, useMemo } from "react";
import { useSettings } from "../hooks/use-settings";
import { dateStr } from "../lib/date-format";
import { getLunarText } from "../lib/lunar";
import type { Event } from "../types";

export const WEEKDAYS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getOrderedWeekdays(lang: string, firstDayOfWeek: number): string[] {
  if (lang === "en") {
    const order: number[] = [];
    for (let i = 0; i < 7; i++) order.push((firstDayOfWeek + i) % 7);
    return order.map((i) => WEEKDAYS_EN[i]);
  }
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const result: string[] = [];
  for (let i = 0; i < 7; i++) result.push(WEEKDAYS_ZH[(i + offset) % 7]);
  return result;
}

function getMonthDays(year: number, month: number, firstDayOfWeek: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const rawDow = firstDay.getDay();
  const adjustedDow = (rawDow - firstDayOfWeek + 7) % 7;
  const start = new Date(year, month, 1);
  start.setDate(1 - adjustedDow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

interface MonthGridProps {
  year: number;
  month: number;
  firstDayOfWeek: number;
  events: Event[];
  calendarColorMap: Map<string, string>;
  dotCalendarIds: Set<string>; // calendars whose events show as dots (ics_import)
  highlightDate: string | null;
  onDateClick: (date: Date) => void;
  onEventClick: (event: Event) => void;
}

export const MonthGrid = memo(function MonthGrid({
  year,
  month,
  firstDayOfWeek,
  events,
  calendarColorMap,
  dotCalendarIds,
  highlightDate,
  onDateClick,
  onEventClick,
}: MonthGridProps) {
  const { data: settings } = useSettings();
  const showLunar = settings?.showLunarCalendar ?? false;
  const showEventTime = settings?.showEventTime ?? false;

  const days = useMemo(() => getMonthDays(year, month, firstDayOfWeek), [year, month, firstDayOfWeek]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of events ?? []) {
      if (!ev.startAt) continue;
      // Convert UTC stored time to local date string for grid display.
      const localDate = new Date(ev.startAt);
      const key = dateStr(localDate);
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);

      if (ev.endAt && ev.startAt !== ev.endAt) {
        const startDate = new Date(ev.startAt);
        const endDate = new Date(ev.endAt);
        const startKey = dateStr(startDate);
        const endKey = dateStr(endDate);
        if (endKey > startKey) {
          const isTimed = ev.startAt.length > 10;
          for (let d = new Date(startDate); isTimed ? d <= endDate : d < endDate; d.setDate(d.getDate() + 1)) {
            const midKey = dateStr(d);
            if (midKey === key) continue;
            const midList = map.get(midKey);
            if (midList) {
              if (!midList.some((e) => e.id === ev.id)) midList.push(ev);
            } else {
              map.set(midKey, [ev]);
            }
          }
        }
      }
    }
    return map;
  }, [events, dateStr]);

  const lunarCache = useMemo(() => {
    if (!showLunar) return new Map<string, string>();
    return new Map<string, string>();
  }, [showLunar]);

  const todayKey = dateStr(new Date());

  return (
    <div className="grid grid-cols-7 min-h-full auto-rows-fr">
      {days.map((d, i) => {
        const key = dateStr(d);
        const isCurrentMonth = d.getMonth() === month;
        const isToday = key === todayKey;
        const isHighlighted = key === highlightDate;
        const isLastRow = i >= 35;
        const dayEvents = eventsByDate.get(key) ?? [];

        return (
          // biome-ignore lint/a11y/useSemanticElements: calendar cell — must be div for grid layout
          <div
            key={key}
            role="button"
            tabIndex={0}
            data-date={key}
            onClick={() => onDateClick(d)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDateClick(d);
              }
            }}
            className={`relative border-r border-neutral-300 dark:border-neutral-600
              ${!isLastRow ? "border-b" : ""}
              ${isToday ? "bg-[rgba(255,220,40,0.15)] dark:bg-[rgba(255,220,40,0.1)]" : isCurrentMonth ? "bg-neutral-50 dark:bg-neutral-900" : "bg-neutral-100 dark:bg-neutral-950"}
              ${isHighlighted ? "highlight-search" : ""}
            `}
          >
            <div className="flex items-baseline justify-end gap-1.5 px-2 pt-1.5 pb-0.5">
              {showLunar && (
                <span className="text-[0.7rem] text-neutral-400 dark:text-neutral-500 leading-none">
                  {(() => {
                    const cached = lunarCache.get(key);
                    if (cached !== undefined) return cached;
                    if (!lunarCache.has(key)) {
                      lunarCache.set(key, getLunarText(d));
                    }
                    return lunarCache.get(key) ?? "";
                  })()}
                </span>
              )}
              <span
                className={`text-base tabular-nums leading-none
                  ${isCurrentMonth ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-300 dark:text-neutral-600"}
                  ${isToday ? "font-bold" : ""}
                `}
              >
                {d.getDate()}
              </span>
            </div>
            <div className="space-y-[2px] px-1.5 pb-1.5 pt-1">
              {dayEvents.map((ev) => {
                const color = ev.color ?? calendarColorMap.get(ev.calendarId) ?? "#3b82f6";
                const isDot = dotCalendarIds.has(ev.calendarId);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className={
                      isDot
                        ? "text-[.82rem] truncate leading-snug cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded px-1 flex items-center gap-1 text-neutral-800 dark:text-neutral-200 w-full text-left"
                        : "text-[.82rem] truncate rounded px-1.5 py-[3px] leading-snug cursor-pointer hover:brightness-90 w-full text-left"
                    }
                    style={isDot ? {} : { backgroundColor: color, color: "#fff" }}
                  >
                    {isDot && <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                    {!isDot && showEventTime && !ev.allDay && ev.startAt && (
                      <span className="opacity-80 mr-0.5">{ev.startAt.slice(11, 16)}</span>
                    )}
                    <span className={isDot ? "font-semibold" : ""}>{ev.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
