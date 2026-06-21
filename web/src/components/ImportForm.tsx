import { FileText, Globe, UploadSimple, Warning } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { JSX } from "preact";
import { useCallback, useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import { pickDistinctColor } from "../lib/colors";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { Button } from "./ui/button";

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

export function ImportForm() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
  const [imported, setImported] = useState(false);

  const handleFile = useCallback(
    async (e: JSX.TargetedEvent<HTMLInputElement>) => {
      const f = e.currentTarget.files?.[0];
      if (!f) return;
      setFile(f);
      setLoading(true);
      setError("");
      setPreview(null);

      try {
        const text = await f.text();
        setIcsContent(text);
        const res = await api.ics.preview(text);
        const data = res.data;
        setPreview(data);
        setCalendarName(data.name);
        setSelectedUids(new Set(data.items.map((i) => i.uid)));
        setCalendarColor(pickDistinctColor([]));
      } catch {
        setError(t("import.parseError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const handleFetchUrl = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const res = await api.ics.fetchUrl(url.trim());
      const { preview: previewData, content } = (
        res as { ok: boolean; data: { preview: IcsPreviewData; content: string } }
      ).data;
      setIcsContent(content);
      setPreview(previewData);
      setCalendarName(previewData.name);
      setSelectedUids(new Set(previewData.items.map((i) => i.uid)));
      setCalendarColor(pickDistinctColor([]));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [url, t]);

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
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setImported(true);
      setLoading(false);
      setTimeout(() => {
        setImported(false);
        setPreview(null);
        setFile(null);
        setIcsContent(null);
        setSelectedUids(new Set());
      }, 2000);
    } catch {
      setError(t("import.importFailed"));
      setLoading(false);
    }
  }, [icsContent, preview, calendarName, calendarColor, selectedUids, overwrite, queryClient, t]);

  return (
    <div>
      {!preview && (
        <>
          <div className="flex border-b border-neutral-200 dark:border-neutral-800 mb-3">
            <button
              type="button"
              onClick={() => {
                setMode("file");
                setError("");
              }}
              className={`flex-1 pb-1.5 text-sm font-medium transition-colors ${mode === "file" ? "border-b-2 border-neutral-900 dark:border-white text-neutral-900 dark:text-white" : "text-neutral-400 hover:text-neutral-600"}`}
            >
              <UploadSimple className="size-3.5 inline mr-1" weight="bold" />
              {t("import.tabFile")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("url");
                setError("");
              }}
              className={`flex-1 pb-1.5 text-sm font-medium transition-colors ${mode === "url" ? "border-b-2 border-neutral-900 dark:border-white text-neutral-900 dark:text-white" : "text-neutral-400 hover:text-neutral-600"}`}
            >
              <Globe className="size-3.5 inline mr-1" weight="bold" />
              {t("import.tabUrl")}
            </button>
          </div>

          {mode === "file" && (
            <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors">
              <UploadSimple className="size-5 text-neutral-400" weight="bold" />
              <span className="text-sm text-neutral-500">{file ? file.name : t("import.selectFile")}</span>
              <input type="file" accept=".ics,.ical,.ifb,.icalendar" onChange={handleFile} className="hidden" />
            </label>
          )}

          {mode === "url" && (
            <div className="space-y-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetchUrl();
                }}
                placeholder={t("import.urlPlaceholder")}
                className="w-full text-sm border rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-900 dark:border-neutral-700 outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
              />
              <Button className="w-full text-sm" size="sm" onClick={handleFetchUrl} disabled={loading || !url.trim()}>
                {loading ? t("import.fetching") : t("import.fetchBtn")}
              </Button>
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
              <Warning className="size-3.5" weight="bold" /> {error}
            </p>
          )}

          {loading && !error && <p className="mt-2 text-sm text-neutral-400 text-center">{t("import.parsing")}</p>}
        </>
      )}

      {preview && (
        <div className="mt-3 p-3 border border-neutral-200 dark:border-neutral-800 rounded-xl">
          <h2 className="font-semibold flex items-center gap-1.5 text-sm">
            <FileText className="size-3.5" weight="bold" />
            {preview.name}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {preview.eventCount} {t("import.events")}
            {preview.timeSpan.from && ` · ${preview.timeSpan.from.slice(0, 10)} ~ ${preview.timeSpan.to?.slice(0, 10)}`}
          </p>

          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={calendarName}
                onChange={(e) => setCalendarName(e.currentTarget.value)}
                className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700 flex-1 min-w-0"
                placeholder={t("import.calName")}
              />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.currentTarget.checked)}
                  className="peer sr-only"
                />
                <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors ">
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-white dark:text-neutral-800 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {t("import.overwrite")}
              </label>
            </div>
            <div>
              <span className="text-xs text-neutral-500 mb-1 block">{t("import.color")}</span>
              <ColorSwatchPicker value={calendarColor} onChange={setCalendarColor} />
            </div>
          </div>

          {overwrite && (
            <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
              <Warning className="size-3" weight="bold" />
              {t("import.overwriteWarn")}
            </p>
          )}

          <div className="mt-2 max-h-40 overflow-auto text-sm">
            {preview.items.map((item) => (
              <label
                key={item.uid}
                className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50 rounded px-1"
              >
                <input
                  type="checkbox"
                  checked={selectedUids.has(item.uid)}
                  onChange={() => toggleItem(item.uid)}
                  className="peer sr-only"
                />
                <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors  shrink-0">
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-white dark:text-neutral-800 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
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

          <Button className="mt-2 w-full text-sm" size="sm" onClick={handleImport} disabled={loading}>
            {loading ? t("import.parsing") : `${t("import.importBtn")} ${selectedUids.size} ${t("import.items")}`}
          </Button>

          {error && (
            <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
              <Warning className="size-3" weight="bold" /> {error}
            </p>
          )}
        </div>
      )}

      {imported && (
        <p className="mt-2 text-sm text-green-600 dark:text-green-400 text-center font-medium">
          ✓ {t("import.imported")}
        </p>
      )}
    </div>
  );
}
