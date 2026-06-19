import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/Checkbox";

export function LogsViewer() {
  const { t } = useI18n();
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLevel, setLogLevel] = useState("");
  const [logCount, setLogCount] = useState(200);
  const [logAuto, setLogAuto] = useState(false);
  const [logError, setLogError] = useState("");
  const logAbortRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async () => {
    if (logAbortRef.current) logAbortRef.current.abort();
    const ac = new AbortController();
    logAbortRef.current = ac;
    setLogError("");
    try {
      const res = await api.logs(logCount, logLevel || undefined, ac.signal);
      if (ac.signal.aborted) return;
      if (res?.data?.lines) setLogLines(res.data.lines);
    } catch (e) {
      if (ac.signal.aborted) return;
      setLogError(e instanceof Error ? e.message : "Failed to fetch logs");
    }
  }, [logCount, logLevel]);

  useEffect(() => {
    fetchLogs();
    if (!logAuto) return;
    const t = setInterval(fetchLogs, 5000);
    return () => clearInterval(t);
  }, [logAuto, fetchLogs]);

  useEffect(() => {
    return () => {
      if (logAbortRef.current) logAbortRef.current.abort();
    };
  }, []);

  const exportLogs = () => {
    const blob = new Blob([logLines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar-server.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="py-0.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={logLevel}
          onChange={(e) => setLogLevel(e.currentTarget.value)}
          className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
        >
          <option value="">{t("settings.logAll")}</option>
          <option value="error">Error</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <select
          value={logCount}
          onChange={(e) => setLogCount(Number(e.currentTarget.value))}
          className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
        >
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
        <div className="flex items-center gap-1.5 text-xs cursor-pointer dark:text-neutral-300">
          <Checkbox checked={logAuto} onChange={setLogAuto} />
          {t("settings.logAutoRefresh")}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={fetchLogs} className="h-7 text-xs">
          {t("settings.logRefresh")}
        </Button>
        <Button variant="outline" size="sm" onClick={exportLogs} className="h-7 text-xs">
          {t("settings.logExport")}
        </Button>
      </div>
      <div className="w-full h-96 overflow-y-auto border rounded-lg bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 font-mono text-xs">
        {logError && <p className="px-2.5 py-2 text-red-500 text-xs">{logError}</p>}
        {logLines.map((line, i) => {
          const timeMatch = line.match(/^time=(\S+)\s/);
          const levelMatch = line.match(/level=(\w+)\s/);
          const msgMatch = line.match(/msg="?(.+?)"?$/);
          const time = timeMatch ? timeMatch[1].replace("T", " ").slice(0, 19) : "";
          const level = levelMatch ? levelMatch[1] : "";
          const msg = msgMatch ? msgMatch[1] : line;
          const levelColor =
            level === "ERROR"
              ? "text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
              : level === "WARN"
                ? "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
                : level === "DEBUG"
                  ? "text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700"
                  : "text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700";
          return (
            <div key={i} className={`px-2.5 py-1 border-b flex items-center gap-2 ${levelColor} last:border-b-0`}>
              <span className="text-neutral-400 dark:text-neutral-500 shrink-0 tabular-nums">{time}</span>
              <span
                className={`font-semibold uppercase shrink-0 w-12 ${
                  level === "ERROR"
                    ? "text-red-600 dark:text-red-400"
                    : level === "WARN"
                      ? "text-amber-600 dark:text-amber-400"
                      : level === "DEBUG"
                        ? "text-neutral-400 dark:text-neutral-500"
                        : "text-blue-600 dark:text-blue-400"
                }`}
              >
                {level}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-all ">{msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
