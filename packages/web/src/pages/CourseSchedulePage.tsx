import { TimetableGrid } from "../components/TimetableGrid";

export function CourseSchedulePage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold dark:text-white">课表</h2>
      </div>
      <div className="flex-1 border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
        <TimetableGrid className="h-full p-2" />
      </div>
    </div>
  );
}
