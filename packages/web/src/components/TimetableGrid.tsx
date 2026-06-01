import { useEvents } from "../hooks/use-events";
import { useCalendars } from "../hooks/use-calendars";

interface TimetableGridProps {
  className?: string;
}

interface CourseBlock {
  id: string;
  title: string;
  location: string;
  teacher: string;
  weekday: number;
  startSlot: number;
  endSlot: number;
  color: string;
}

const SLOTS: { label: string; hour: number; minute: number }[] = [
  { label: "08:00", hour: 8, minute: 0 },
  { label: "08:55", hour: 8, minute: 55 },
  { label: "10:00", hour: 10, minute: 0 },
  { label: "10:55", hour: 10, minute: 55 },
  { label: "14:00", hour: 14, minute: 0 },
  { label: "14:55", hour: 14, minute: 55 },
  { label: "16:00", hour: 16, minute: 0 },
  { label: "16:55", hour: 16, minute: 55 },
  { label: "19:00", hour: 19, minute: 0 },
  { label: "19:55", hour: 19, minute: 55 },
  { label: "20:50", hour: 20, minute: 50 },
];

const SLOT_DURATION_MIN = 45;

const WEEKDAYS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function slotFromTime(hour: number, minute: number): number {
  const totalMin = hour * 60 + minute;
  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i];
    const sMin = s.hour * 60 + s.minute;
    if (Math.abs(totalMin - sMin) < 5) return i;
  }
  return -1;
}

function extractBlocks(events: any[], calendarColorMap: Map<string, string>): CourseBlock[] {
  const seen = new Set<string>();
  const blocks: CourseBlock[] = [];

  for (const e of events) {
    const date = new Date(e.startAt);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    const startSlot = slotFromTime(date.getHours(), date.getMinutes());
    if (startSlot < 0) continue;

    const endDate = new Date(e.endAt);
    const durMin = (endDate.getTime() - date.getTime()) / 60000;
    const durSlots = Math.max(1, Math.round(durMin / SLOT_DURATION_MIN));

    const color = e.color ?? calendarColorMap.get(e.calendarId) ?? "#3b82f6";
    const title = e.title?.split(" - ")[0] ?? e.title ?? "";
    const location = e.title?.includes(" - ") ? e.title.split(" - ")[1] ?? "" : e.location ?? "";
    const teacher = e.description?.replace("任课教师：", "").replace("。", "") ?? "";

    const key = `${title}|${weekday}|${startSlot}|${durSlots}`;
    if (seen.has(key)) continue;
    seen.add(key);

    blocks.push({
      id: key,
      title,
      location,
      teacher,
      weekday,
      startSlot,
      endSlot: startSlot + durSlots,
      color,
    });
  }

  return blocks;
}

export function TimetableGrid({ className }: TimetableGridProps) {
  const { data: calendars } = useCalendars();
  const courseCalIds = calendars
    ?.filter((c) => c.sourceType === "course_schedule")
    .map((c) => c.id) ?? [];

  const { data: events } = useEvents(
    courseCalIds,
    "2000-01-01T00:00:00Z",
    "2099-12-31T23:59:59Z",
  );

  const calendarColorMap = new Map(calendars?.map((c) => [c.id, c.color]) ?? []);
  const blocks = extractBlocks(events ?? [], calendarColorMap);

  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={`overflow-auto ${className ?? ""}`}>
      <div
        className="grid min-w-[48rem]"
        style={{
          gridTemplateColumns: `4rem repeat(${days.length}, 1fr)`,
          gridTemplateRows: "auto",
        }}
      >
        <div className="h-9 border-b border-neutral-200 dark:border-neutral-700" />
        {days.map((d) => (
          <div
            key={d}
            className="h-9 flex items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700"
          >
            {WEEKDAYS[d]}
          </div>
        ))}

        {SLOTS.map((slot, rowIdx) => (
          <div key={`row-${rowIdx}`} style={{ display: "contents" }}>
            <div
              className="h-14 flex items-start justify-end pr-2 text-[10px] text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pt-0.5"
              style={{ gridRow: rowIdx + 2 }}
            >
              {slot.label}
            </div>
            {days.map((_d, colIdx) => (
              <div
                key={`cell-${rowIdx}-${colIdx}`}
                className="border-b border-r border-neutral-100 dark:border-neutral-800 relative"
                style={{ gridRow: rowIdx + 2 }}
              />
            ))}
          </div>
        ))}

        {blocks.map((block) => (
          <div
            key={block.id}
            className="rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden shadow-sm border-l-2 z-10 m-0.5"
            style={{
              gridColumn: block.weekday + 1,
              gridRow: `${block.startSlot + 2} / span ${Math.max(1, block.endSlot - block.startSlot)}`,
              backgroundColor: `${block.color}18`,
              borderColor: block.color,
              color: block.color,
            }}
            title={`${block.title}${block.teacher ? ` - ${block.teacher}` : ""}${block.location ? ` @ ${block.location}` : ""}`}
          >
            <div className="font-semibold truncate">{block.title}</div>
            {block.location && (
              <div className="truncate opacity-80">{block.location}</div>
            )}
            {block.teacher && (
              <div className="truncate opacity-60">{block.teacher}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
