import { createPortal } from "react-dom";
import { TimetableGrid } from "../components/TimetableGrid";
import { LeftControls, CenterControls } from "../components/TopBarControls";
import { useTopBar } from "../components/Layout";

export function CourseSchedulePage() {
  const topBar = useTopBar();

  return (
    <div className="h-full flex flex-col p-4">
      {topBar?.left && createPortal(<LeftControls />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      <div className="flex-1 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
        <TimetableGrid className="h-full p-2" />
      </div>
    </div>
  );
}
