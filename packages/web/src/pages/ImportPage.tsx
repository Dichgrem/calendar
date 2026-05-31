import { useState, useCallback } from "react";
import { Upload, FileText, Check, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

interface IcsPreviewData {
  name: string;
  eventCount: number;
  todoCount: number;
  timeSpan: { from: string | null; to: string | null };
  items: Array<{
    type: "event" | "todo";
    uid: string;
    title: string;
    startAt: string | null;
    endAt: string | null;
    dueDate: string | null;
    rrule: string | null;
    selected: boolean;
  }>;
}

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IcsPreviewData | null>(null);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState(false);
  const [calendarName, setCalendarName] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    setError("");

    try {
      const text = await f.text();
      const res = await api.ics.preview(text);
      const data = (res as { ok: boolean; data: IcsPreviewData }).data;

      setPreview(data);
      setCalendarName(data.name);
      setSelectedUids(new Set(data.items.map((i) => i.uid)));
      setImported(false);
    } catch {
      setError("解析失败，请检查文件格式");
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleItem = useCallback((uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!file || !preview) return;
    setLoading(true);
    setError("");

    try {
      const text = await file.text();
      await api.ics.import({
        content: text,
        calendarName: calendarName || preview.name,
        selectedUids: [...selectedUids],
        overwrite,
      });
      setImported(true);
    } catch {
      setError("导入失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [file, preview, calendarName, selectedUids, overwrite]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">导入 ICS 日历</h1>

      <label className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors">
        <Upload className="size-8 text-neutral-400" />
        <span className="text-sm text-neutral-500">
          {file ? file.name : "点击选择 .ics 文件"}
        </span>
        <input
          type="file"
          accept=".ics,.ical,.ifb,.icalendar"
          onChange={handleFile}
          className="hidden"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="size-4" /> {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-4 text-sm text-neutral-400">解析中...</p>
      )}

      {preview && (
        <div className="mt-6 p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="size-4" />
            {preview.name}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            {preview.eventCount} 个事件 · {preview.todoCount} 个待办
            {preview.timeSpan.from && ` · ${preview.timeSpan.from.slice(0, 10)} ~ ${preview.timeSpan.to?.slice(0, 10)}`}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <input
              type="text"
              value={calendarName}
              onChange={(e) => setCalendarName(e.target.value)}
              className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700 flex-1"
              placeholder="日历名称"
            />
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="accent-neutral-900"
              />
              覆盖已有
            </label>
          </div>

          {overwrite && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              将清空此日历中现有内容再导入
            </p>
          )}

          <div className="mt-3 max-h-64 overflow-auto">
            {preview.items.map((item) => (
              <label
                key={item.uid}
                className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50 rounded px-1"
              >
                <input
                  type="checkbox"
                  checked={selectedUids.has(item.uid)}
                  onChange={() => toggleItem(item.uid)}
                  className="accent-neutral-900 dark:accent-white shrink-0"
                />
                <span className="text-xs px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                  {item.type === "event" ? "事件" : "待办"}
                </span>
                <span className="text-sm truncate">{item.title}</span>
                <span className="text-xs text-neutral-400 ml-auto shrink-0">
                  {item.startAt?.slice(0, 10) || item.dueDate?.slice(0, 10) || ""}
                  {item.rrule ? " 🔁" : ""}
                </span>
              </label>
            ))}
          </div>

          <Button
            className="mt-4 w-full"
            onClick={handleImport}
            disabled={imported || loading}
          >
            {imported ? (
              <>
                <Check className="size-4 mr-1" /> 已导入
              </>
            ) : (
              `导入 ${selectedUids.size} 项`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
