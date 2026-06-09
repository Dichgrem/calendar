import { useState } from "react";
import { Circle, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useNav } from "../hooks/use-nav";
import { useCalendars } from "../hooks/use-calendars";
import { useSettings } from "../hooks/use-settings";
import { useI18n } from "../hooks/use-i18n";
import { formatCalendarDate, dateStr } from "../lib/date-format";

const MONTHS_ZH = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface TopBarControlsProps {
  calRef?: { current: { getApi: () => any } | null };
  highlightDate?: string | null;
  setHighlightDate?: (d: string | null) => void;
}

export function LeftControls({ calRef, highlightDate, setHighlightDate }: TopBarControlsProps) {
  const { t, lang } = useI18n();
  const { data: settings } = useSettings();
  const { displayMonth, setDisplayMonth, labelOverride } = useNav();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const isEn = lang === "en";
  const months = isEn ? MONTHS_EN : MONTHS_ZH;
  const dateFormat = settings?.dateFormat ?? "zh";
  const highlightDateObj = highlightDate ? new Date(highlightDate + "T00:00:00") : null;
  const displayDate = highlightDateObj ?? new Date(displayMonth.year, displayMonth.month, 1);
  const dateLabel = labelOverride ?? formatCalendarDate(displayDate, dateFormat, lang);

  const calApi = () => calRef?.current?.getApi();

  const gotoDate = (dateOrYear: Date | number, month?: number) => {
    const date = dateOrYear instanceof Date ? dateOrYear : new Date(dateOrYear, month!, 1);
    if (date.getFullYear() < 1970) date.setFullYear(1970);
    calApi()?.gotoDate(date);
    setPickerOpen(false);
  };

  const gotoMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1);
    setDisplayMonth({ year, month });
    calApi()?.gotoDate(d);
    if (setHighlightDate) {
      setHighlightDate(dateStr(d));
    }
  };

  const goToday = () => {
    const d = new Date();
    setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
    calApi()?.today();
    setPickerOpen(false);
    if (setHighlightDate) {
      setHighlightDate(dateStr(new Date(d.getFullYear(), d.getMonth(), 1)));
    }
  };

  const goPrev = () => {
    const a = calApi();
    if (a) {
      a.prev();
      if (a.view.currentStart.getFullYear() < 1970) a.gotoDate(new Date(1970, 0, 1));
      const d = a.getDate();
      setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
      if (setHighlightDate) setHighlightDate(dateStr(new Date(d.getFullYear(), d.getMonth(), 1)));
    } else {
      const nm = displayMonth.month - 1;
      const next = nm < 0 ? { year: displayMonth.year - 1, month: 11 } : { year: displayMonth.year, month: nm };
      setDisplayMonth(next);
      if (setHighlightDate) setHighlightDate(dateStr(new Date(next.year, next.month, 1)));
    }
  };

  const goNext = () => {
    const a = calApi();
    if (a) {
      a.next();
      const d = a.getDate();
      setDisplayMonth({ year: d.getFullYear(), month: d.getMonth() });
      if (setHighlightDate) setHighlightDate(dateStr(new Date(d.getFullYear(), d.getMonth(), 1)));
    } else {
      const nm = displayMonth.month + 1;
      const next = nm > 11 ? { year: displayMonth.year + 1, month: 0 } : { year: displayMonth.year, month: nm };
      setDisplayMonth(next);
      if (setHighlightDate) setHighlightDate(dateStr(new Date(next.year, next.month, 1)));
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => { setPickerOpen((v) => !v); if (!pickerOpen) setPickerYear(displayMonth.year); }}
        className="px-3 py-1.5 text-base font-semibold rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-white tabular-nums">
        {dateLabel}
      </button>
      <button onClick={goPrev} aria-label={t("cal.prev")} className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"><CaretLeft className="size-4" weight="bold" /></button>
      <button onClick={goToday} aria-label={t("cal.today")} className="size-7 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors" title={t("cal.today")}><Circle className="size-4" weight="bold" /></button>
      <button onClick={goNext} aria-label={t("cal.next")} className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"><CaretRight className="size-4" weight="bold" /></button>
      {pickerOpen && (
        <div className="absolute top-10 left-4 z-50 w-56 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 shadow-lg p-3">
          <div className="flex items-center justify-center gap-1 mb-3">
            <button onClick={() => setPickerYear((y) => y - 1)} aria-label={t("cal.yearPrev")}
              className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400">{`<`}</button>
            <input type="number" value={pickerYear} onChange={(e) => setPickerYear(Number(e.target.value))} min={1970}
              className="w-16 text-center text-sm font-semibold border-0 bg-transparent text-neutral-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <button onClick={() => setPickerYear((y) => y + 1)} aria-label={t("cal.yearNext")}
              className="size-7 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400">{`>`}</button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {months.map((m, i) => {
              const isCurrent = i === displayMonth.month && pickerYear === displayMonth.year;
              return (
                <button key={m} onClick={() => gotoMonth(pickerYear, i)}
                  className={`px-2 py-1.5 text-sm rounded-full transition-colors dark:text-neutral-300 ${isCurrent ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>{m}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CenterControls() {
  const { t } = useI18n();
  const { data: calendars, isLoading: calLoading, isError: calError } = useCalendars();
  const { visibleCalendars, toggleCalendar } = useNav();

  return (
    <>
      {calLoading && <span className="text-xs text-neutral-400">{t("cal.loading")}</span>}
      {calError && <span className="text-xs text-red-500">{t("cal.failed")}</span>}
      {calendars?.map((cal) => (
        <button
          key={cal.id}
          onClick={() => toggleCalendar(cal.id)}
          title={cal.name}
          aria-label={`${t("cal.toggleVisibility")}: ${cal.name}`}
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
}
