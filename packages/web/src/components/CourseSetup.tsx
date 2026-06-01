import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GraduationCap } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { useCalendars } from "../hooks/use-calendars";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CourseSetup({ open, onClose }: Props) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t("cal.importCourse")}>
      <CourseForm onClose={onClose} />
    </Modal>
  );
}

function CourseForm({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const { data: calendars } = useCalendars();
  const existing = calendars?.find((c) => c.sourceType === "course_schedule" && c.courseMeta);
  const savedMeta = (() => {
    if (!existing?.courseMeta) return null;
    try { return JSON.parse(existing.courseMeta); } catch { return null; }
  })();
  const [username, setUsername] = useState(savedMeta?.username ?? "");
  const [password, setPassword] = useState("");
  const [semester, setSemester] = useState<"上" | "下">(savedMeta?.semester ?? "上");
  const [year, setYear] = useState(savedMeta?.year ?? String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    preview: { name: string; items: Array<{ uid: string; title: string; startAt: string | null; endAt: string | null; selected: boolean }> };
    icsContent: string;
    courses: Array<{ name: string; teacher: string; classroom: string; weekday: number; weeks: number[]; indexes: number[] }>;
    rawCourses: any[];
    timetable: [number, number][];
    startDate: [number, number, number];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importingAll, setImportingAll] = useState(false);
  const [importAllResult, setImportAllResult] = useState<{ count: number; errors?: string[] } | null>(null);

  const handleImportAll = async () => {
    if (!username || !password) {
      setError(lang === "en" ? "Please fill in all fields" : "请填写所有字段");
      return;
    }
    setImportingAll(true);
    setError("");
    setImportAllResult(null);
    try {
      const res = await api.sources.courseImportAll({ username, password });
      const data = (res as { ok: boolean; data: { calendarId: string; eventCount: number; errors?: string[] } }).data;
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setImportAllResult({ count: data.eventCount, errors: data.errors });
      if (!data.errors?.length) setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === "en" ? "Import failed" : "导入失败"));
    } finally {
      setImportingAll(false);
    }
  };

  const handleFetch = async () => {
    if (!username || !password) {
      setError(lang === "en" ? "Please fill in all fields" : "请填写所有字段");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.sources.coursePreview({ username, password, semester, year });
      const data = (res as { ok: boolean; data: typeof preview }).data;
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === "en" ? "Fetch failed" : "获取失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError("");
    try {
      await api.sources.courseImport({
        icsContent: preview.icsContent,
        calendarName: `课表 ${year}${semester}学期`,
        selectedUids: preview.preview.items.filter((i) => i.selected).map((i) => i.uid),
        overwrite: false,
        username,
        password,
        semester,
        year,
        rawCourses: preview.rawCourses,
        timetable: preview.timetable,
        startDate: preview.startDate,
      });
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setImported(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === "en" ? "Import failed" : "导入失败"));
    } finally {
      setImporting(false);
    }
  };

  const weekdays = lang === "en"
    ? ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  const semesters = lang === "en"
    ? [{ v: "上" as const, l: "Spring" }, { v: "下" as const, l: "Fall" }]
    : [{ v: "上" as const, l: "上学期" }, { v: "下" as const, l: "下学期" }];

  return (
    <div className="space-y-4">
      {!preview ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-neutral-200">
              {lang === "en" ? "Student ID" : "学号"}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder={lang === "en" ? "Enter student ID" : "输入学号"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-neutral-200">
              {lang === "en" ? "Password" : "密码"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder={lang === "en" ? "Enter password" : "输入教务系统密码"}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1 dark:text-neutral-200">
                {lang === "en" ? "Semester" : "学期"}
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value as "上" | "下")}
                className="w-full px-3 py-2 text-sm border rounded-lg border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none"
              >
                {semesters.map((s) => (
                  <option key={s.v} value={s.v}>{s.l}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1 dark:text-neutral-200">
                {lang === "en" ? "Year" : "学年"}
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2015}
                max={2030}
                className="w-full px-3 py-2 text-sm border rounded-lg border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="2026"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <div className="pt-2 space-y-2">
            <Button onClick={handleFetch} disabled={loading || importingAll} className="w-full">
              {loading
                ? (lang === "en" ? "Fetching..." : "获取中...")
                : (lang === "en" ? "Fetch Course Schedule" : "获取课程表")}
            </Button>
            <Button onClick={handleImportAll} disabled={loading || importingAll} variant="outline" className="w-full">
              {importingAll
                ? (lang === "en" ? "Importing all..." : "正在导入全部学期...")
                : (lang === "en" ? "Import All Semesters (2023-2026)" : "一键导入全部学期(2023-2026)")}
            </Button>
            {importAllResult && (
              <p className="text-xs text-green-600 dark:text-green-400">
                {lang === "en" ? `Imported ${importAllResult.count} events` : `已导入 ${importAllResult.count} 个事件`}
                {importAllResult.errors?.length ? (
                  <span className="text-red-500"> · {importAllResult.errors.join("; ")}</span>
                ) : null}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {preview.courses.length > 0 && (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {preview.courses.map((c, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:text-neutral-200">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 w-10 shrink-0">
                    {weekdays[c.weekday]}
                  </span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{c.classroom || c.teacher}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {preview.preview.items.length} {lang === "en" ? "events" : "个事件"}
          </p>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>
              {lang === "en" ? "Back" : "返回"}
            </Button>
            <Button onClick={handleImport} disabled={importing || imported} className="flex-1">
              {imported
                ? (lang === "en" ? "Imported!" : "已导入！")
                : importing
                  ? (lang === "en" ? "Importing..." : "导入中...")
                  : (lang === "en" ? "Import Course Schedule" : "导入课程表")}
            </Button>
          </div>
        </>
      )}
      {imported && (
        <p className="text-sm text-green-600 dark:text-green-400 text-center">
          {lang === "en" ? "Course schedule imported!" : "课程表导入成功！"}
        </p>
      )}
    </div>
  );
}
