import { useCalendars } from "../hooks/use-calendars";
import { parseMeta } from "../lib/parse-meta";
import { useI18n } from "../hooks/use-i18n";

interface TimetableGridProps {
  className?: string;
}

interface RawCourse {
  name: string;
  teacher: string;
  location: string;
  weekday: number;
  index: number;
  duration: number;
  week: [number, number];
  odd: boolean;
  even: boolean;
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const WEEKDAYS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function TimetableGrid({ className }: TimetableGridProps) {
  const { data: calendars } = useCalendars();
  const courseCal = calendars?.find((c) => c.sourceType === "course_schedule" && c.courseMeta);
  const meta = parseMeta(courseCal?.courseMeta);

  const { t } = useI18n();

  if (!meta?.rawCourses?.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-neutral-400 dark:text-neutral-500">
        {t("cal.noCourseData")}
      </div>
    );
  }

  const timetable: [number, number][] = meta.timetable;
  const rawCourses: RawCourse[] = meta.rawCourses;

  const slotLabels = timetable.map((s) => {
    const h = String(s[0]).padStart(2, "0");
    const m = String(s[1]).padStart(2, "0");
    return `${h}:${m}`;
  });

  const courseColorMap = new Map<string, string>();
  let ci = 0;
  rawCourses.forEach((c) => {
    if (!courseColorMap.has(c.name)) {
      courseColorMap.set(c.name, COLORS[ci % COLORS.length]);
      ci++;
    }
  });

  const totalSlots = timetable.length;
  const days = [1, 2, 3, 4, 5, 6, 7];

  type Block = {
    name: string;
    location: string;
    teacher: string;
    weekday: number;
    startSlot: number;
    endSlot: number;
    weekLabel: string;
    color: string;
    colInDay: number;
    colsInDay: number;
  };

  const blocks: Block[] = [];
  const collisions = new Map<string, RawCourse[]>();
  rawCourses.forEach((c) => {
    const key = `${c.weekday}-${c.index}`;
    if (!collisions.has(key)) collisions.set(key, []);
    collisions.get(key)!.push(c);
  });

  collisions.forEach((courses) => {
    courses.forEach((c, colIdx) => {
      const startSlot = Math.max(0, c.index - 1);
      const endSlot = Math.min(totalSlots, startSlot + c.duration);
      const weekLabel = c.odd
        ? `${c.week[0]}-${c.week[1]}单`
        : c.even
          ? `${c.week[0]}-${c.week[1]}双`
          : `${c.week[0]}-${c.week[1]}`;

      blocks.push({
        name: c.name,
        location: c.location,
        teacher: c.teacher,
        weekday: c.weekday,
        startSlot,
        endSlot,
        weekLabel,
        color: courseColorMap.get(c.name) ?? "#3b82f6",
        colInDay: colIdx,
        colsInDay: courses.length,
      });
    });
  });

  const ROW_H = 48;

  return (
    <div className={`overflow-auto ${className ?? ""}`}>
      <div
        className="grid min-w-[48rem]"
        style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}
      >
        <div className="h-8 border-b border-neutral-200 dark:border-neutral-700" />
        {days.map((d) => (
          <div key={d} className="h-8 flex items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
            {WEEKDAYS[d]}
          </div>
        ))}

        {Array.from({ length: totalSlots }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} style={{ display: "contents" }}>
            <div
              className="flex items-start justify-end pr-2 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pt-1 leading-none"
              style={{ height: ROW_H }}
            >
              {slotLabels[rowIdx]}
            </div>
            {days.map((_, di) => (
              <div
                key={`bg-${rowIdx}-${di}`}
                className="border-b border-r border-neutral-100 dark:border-neutral-800"
                style={{ height: ROW_H }}
              />
            ))}
          </div>
        ))}

        {blocks.map((b, i) => {
          const w = b.colsInDay > 1 ? `${100 / b.colsInDay}%` : undefined;
          const ml = b.colsInDay > 1 ? `${(b.colInDay / b.colsInDay) * 100}%` : undefined;
          return (
            <div
              key={`${i}-${b.weekday}-${b.startSlot}`}
              className="rounded-md px-1.5 py-1 text-[11px] leading-tight overflow-hidden border-l-2 z-10 m-0.5"
              style={{
                gridColumn: b.weekday + 1,
                gridRow: `${b.startSlot + 2} / span ${Math.max(1, b.endSlot - b.startSlot)}`,
                backgroundColor: `${b.color}15`,
                borderColor: b.color,
                color: b.color,
                width: w,
                marginLeft: ml,
                minHeight: ROW_H - 4,
              }}
              title={`${b.name} · ${b.teacher} · ${b.location} · ${b.weekLabel}周`}
            >
              <div className="font-semibold truncate">{b.name}</div>
              {b.location && (
                <div className="truncate opacity-70 text-[10px]">{b.location}</div>
              )}
              <div className="truncate opacity-50 text-[9px]">{b.weekLabel}周</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
