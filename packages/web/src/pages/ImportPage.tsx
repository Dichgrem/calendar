import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Check, AlertTriangle, Globe } from "lucide-react";
import { api } from "../lib/api";
import { pickDistinctColor } from "../lib/colors";
import { useI18n } from "../hooks/use-i18n";
import { useCalendars } from "../hooks/use-calendars";
import { Button } from "../components/ui/button";
import { ColorSwatchPicker } from "../components/ColorSwatchPicker";

interface IcsPreviewData {
  name: string;
  eventCount: number;
  timeSpan: { from: string | null; to: string | null };
  items: Array<{
    type: "event";
    uid: string;
    title: string;
    startAt: string | null;
    endAt: string | null;
    rrule: string | null;
    selected: boolean;
  }>;
}

export function ImportPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: calendars } = useCalendars();
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [icsContent, setIcsContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<IcsPreviewData | null>(null);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("#3b82f6");
  const [overwrite, setOverwrite] = useState(false);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const text = await f.text();
      setIcsContent(text);
      const res = await api.ics.preview(text);
      const data = (res as { ok: boolean; data: IcsPreviewData }).data;
      setPreview(data);
      setCalendarName(data.name);
      setSelectedUids(new Set(data.items.map((i) => i.uid)));
      setCalendarColor(pickDistinctColor(calendars?.map((c) => c.color) ?? []));
    } catch {
      setError(t("import.parseError"));
    } finally {
      setLoading(false);
    }
  }, [calendars]);

  const handleFetchUrl = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const res = await api.ics.fetchUrl(url.trim());
      const { preview: previewData, content } = (res as { ok: boolean; data: { preview: IcsPreviewData; content: string } }).data;
      setIcsContent(content);
      setPreview(previewData);
      setCalendarName(previewData.name);
      setSelectedUids(new Set(previewData.items.map((i) => i.uid)));
      setCalendarColor(pickDistinctColor(calendars?.map((c) => c.color) ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [url, calendars]);

  const toggleItem = useCallback((uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!icsContent || !preview) return;
    setLoading(true);
    setError("");

    try {
      await api.ics.import({
        content: icsContent,
        calendarName: calendarName || preview.name,
        color: calendarColor,
        selectedUids: [...selectedUids],
        overwrite,
      });
      queryClient.removeQueries({ queryKey: ["calendars"] });
      queryClient.removeQueries({ queryKey: ["events"] });
      navigate("/calendar");
    } catch {
      setError(t("import.importFailed"));
    } finally {
      setLoading(false);
    }
  }, [icsContent, preview, calendarName, selectedUids, overwrite, queryClient, navigate]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 grid place-items-center">
        <div className="w-80">
          {!preview && (
            <>
              <div className="flex border-b border-neutral-200 dark:border-neutral-800 mb-4">
                <button
                  onClick={() => { setMode("file"); setError(""); }}
                  className={`flex-1 pb-2 text-sm font-medium transition-colors ${mode === "file" ? "border-b-2 border-neutral-900 dark:border-white text-neutral-900 dark:text-white" : "text-neutral-400 hover:text-neutral-600"}`}
                >
                  <Upload className="size-4 inline mr-1" />{t("import.tabFile")}
                </button>
                <button
                  onClick={() => { setMode("url"); setError(""); }}
                  className={`flex-1 pb-2 text-sm font-medium transition-colors ${mode === "url" ? "border-b-2 border-neutral-900 dark:border-white text-neutral-900 dark:text-white" : "text-neutral-400 hover:text-neutral-600"}`}
                >
                  <Globe className="size-4 inline mr-1" />{t("import.tabUrl")}
                </button>
              </div>

              {mode === "file" && (
                <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors">
                  <Upload className="size-6 text-neutral-400" />
                  <span className="text-sm text-neutral-500">
                    {file ? file.name : t("import.selectFile")}
                  </span>
                  <input type="file" accept=".ics,.ical,.ifb,.icalendar" onChange={handleFile}
                    className="hidden" />
                </label>
              )}

              {mode === "url" && (
                <div className="space-y-3">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleFetchUrl(); }}
                    placeholder={t("import.urlPlaceholder")}
                    className="w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-neutral-900 dark:border-neutral-700 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                  />
                  <Button
                    className="w-full text-sm"
                    size="sm"
                    onClick={handleFetchUrl}
                    disabled={loading || !url.trim()}
                  >
                    {loading ? t("import.fetching") : t("import.fetchBtn")}
                  </Button>
                </div>
              )}

              {error && (
                <p className="mt-3 text-sm text-red-500 flex items-center justify-center gap-1">
                  <AlertTriangle className="size-4" /> {error}
                </p>
              )}

              {loading && !error && (
                <p className="mt-3 text-sm text-neutral-400 text-center">{t("import.parsing")}</p>
              )}
            </>
          )}

          {preview && (
            <div className="p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <FileText className="size-4" />{preview.name}
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                {preview.eventCount} {t("import.events")}
                {preview.timeSpan.from && ` · ${preview.timeSpan.from.slice(0, 10)} ~ ${preview.timeSpan.to?.slice(0, 10)}`}
              </p>

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input type="text" value={calendarName} onChange={(e) => setCalendarName(e.target.value)}
                    className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700 flex-1 min-w-0"
                    placeholder={t("import.calName")} />
                  <label className="flex items-center gap-1 text-xs cursor-pointer shrink-0">
                    <input type="checkbox" checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)} className="accent-neutral-900" />
                    {t("import.overwrite")}
                  </label>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 mb-1 block">{t("import.color")}</span>
                  <ColorSwatchPicker value={calendarColor} onChange={setCalendarColor} />
                </div>
              </div>

              {overwrite && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />{t("import.overwriteWarn")}
                </p>
              )}

              <div className="mt-3 max-h-48 overflow-auto text-sm">
                {preview.items.map((item) => (
                  <label key={item.uid}
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50 rounded px-1">
                    <input type="checkbox" checked={selectedUids.has(item.uid)}
                      onChange={() => toggleItem(item.uid)}
                      className="accent-neutral-900 dark:accent-white shrink-0" />
                    <span className="text-xs px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 shrink-0">
                      {t("import.event")}
                    </span>
                    <span className="truncate">{item.title}</span>
                    <span className="text-xs text-neutral-400 ml-auto shrink-0">
                      {item.startAt?.slice(0, 10) || ""}
                      {item.rrule ? " ↻" : ""}
                    </span>
                  </label>
                ))}
              </div>

              <Button className="mt-3 w-full text-sm" size="sm" onClick={handleImport}
                disabled={loading}>
                {loading ? t("import.parsing") : `${t("import.importBtn")} ${selectedUids.size} ${t("import.items")}`}
              </Button>

              {error && (
                <p className="mt-2 text-xs text-red-500 flex items-center justify-center gap-1">
                  <AlertTriangle className="size-3" /> {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
