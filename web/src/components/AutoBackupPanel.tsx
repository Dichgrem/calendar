import { useQueryClient } from "@tanstack/react-query";
import { useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { useSettings } from "../hooks/use-settings";
import { api } from "../lib/api";
import type { Calendar, UserSettings } from "../types";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/Checkbox";

interface AutoBackupPanelProps {
  calendars: Calendar[];
  onClose: () => void;
}

export function AutoBackupPanel({ calendars, onClose }: AutoBackupPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(() => {
    const saved = settings?.autoBackupCalendars;
    return saved ? new Set(saved.split(",").filter(Boolean)) : new Set();
  });
  const [interval, setInterval_] = useState(settings?.autoBackupInterval ?? 0);
  const [busy, setBusy] = useState(false);

  const toggleCal = (id: string) =>
    setSelectedCalendars((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = {
        autoBackupCalendars: [...selectedCalendars].join(","),
        autoBackupInterval: interval,
      } satisfies Partial<UserSettings>;
      const res = await api.settings.update(next);
      queryClient.setQueryData(["settings"], res.data);
      onClose();
    } catch {
      // silently ignore — user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-neutral-500">{t("settings.autoBackupCalendars")}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {calendars.map((cal) => (
          <div key={cal.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
            <Checkbox checked={selectedCalendars.has(cal.id)} onChange={() => toggleCal(cal.id)} />
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
            <span className="text-neutral-800 dark:text-neutral-200">{cal.name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-neutral-500">{t("settings.autoBackupInterval")}</span>
        <select
          value={interval}
          onChange={(e) => setInterval_(Number(e.currentTarget.value))}
          className="text-xs border rounded px-2 py-1 bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
        >
          <option value={0}>{t("settings.autoBackupOff")}</option>
          <option value={30}>{t("settings.autoBackup30m")}</option>
          <option value={60}>{t("settings.autoBackup1h")}</option>
          <option value={360}>{t("settings.autoBackup6h")}</option>
          <option value={720}>{t("settings.autoBackup12h")}</option>
          <option value={1440}>{t("settings.autoBackup24h")}</option>
        </select>
      </div>
      <div className="flex gap-1">
        <Button size="sm" onClick={handleSave} disabled={busy} className="h-7 text-xs">
          {t("settings.save")}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
          {t("settings.cancel")}
        </Button>
      </div>
    </div>
  );
}
