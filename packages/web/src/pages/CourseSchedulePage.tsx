import { createPortal } from "react-dom";
import { useEffect } from "react";
import { TimetableGrid } from "../components/TimetableGrid";
import { LeftControls, CenterControls } from "../components/TopBarControls";
import { useTopBar } from "../components/Layout";
import { useNav } from "../hooks/use-nav";
import { useCalendars } from "../hooks/use-calendars";
import { parseMeta } from "../lib/parse-meta";

export function CourseSchedulePage() {
  const topBar = useTopBar();
  const { setLabelOverride } = useNav();
  const { data: calendars } = useCalendars();
  const courseCal = calendars?.find((c) => c.sourceType === "course_schedule" && c.courseMeta);
  const meta = parseMeta(courseCal?.courseMeta);

  useEffect(() => {
    if (meta?.year && meta?.semester) {
      setLabelOverride(`${meta.year}年${meta.semester}学期`);
    }
    return () => setLabelOverride(null);
  }, [meta?.year, meta?.semester, setLabelOverride]);

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(<LeftControls />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      <div className="flex-1">
        <TimetableGrid className="h-full" />
      </div>
    </div>
  );
}
