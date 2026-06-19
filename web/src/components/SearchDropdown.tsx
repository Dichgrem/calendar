import { useI18n } from "../hooks/use-i18n";
import { dateStr } from "../lib/date-format";
import type { Calendar, Event } from "../types";

interface SearchDropdownProps {
  calendars: Calendar[] | undefined;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchCalId: string | null;
  setSearchCalId: (v: string | null) => void;
  filteredEvents: Event[];
  highlightedIndex: number;
  setDisplayMonth: (v: { year: number; month: number }) => void;
  setHighlightDate: (d: string | null) => void;
  setSearchOpen: (v: boolean) => void;
}

export function SearchDropdown({
  calendars,
  searchQuery,
  setSearchQuery,
  searchCalId,
  setSearchCalId,
  filteredEvents,
  highlightedIndex,
  setDisplayMonth,
  setHighlightDate,
  setSearchOpen,
}: SearchDropdownProps) {
  const { t } = useI18n();

  const handleEventClick = (e: Event) => {
    if (e.startAt) {
      const d = new Date(e.startAt);
      setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
      setHighlightDate(dateStr(d));
    }
    setSearchOpen(false);
    setSearchQuery("");
    setSearchCalId(null);
  };

  return (
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
                onClick={() => handleEventClick(e)}
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
  );
}
