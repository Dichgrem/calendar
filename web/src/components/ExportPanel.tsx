import { useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import type { Calendar } from "../types";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/Checkbox";

interface ExportPanelProps {
  calendars: Calendar[];
  onClose: () => void;
}

export function ExportPanel({ calendars, onClose }: ExportPanelProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(calendars.map((c) => c.id)));

  const toggleCal = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = () =>
    setSelected((p) => (p.size === calendars.length ? new Set() : new Set(calendars.map((c) => c.id))));

  const handleExport = (id: string, name: string) => {
    const a = document.createElement("a");
    a.href = api.ics.exportUrl(id);
    a.download = `${name}.ics`;
    a.click();
  };

  return (
    <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-neutral-500">{t("settings.selectCalendars")}</span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          {selected.size === calendars.length ? t("settings.deselectAll") : t("settings.selectAll")}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {calendars.map((cal) => (
          <div key={cal.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
            <Checkbox checked={selected.has(cal.id)} onChange={() => toggleCal(cal.id)} />
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
            <span className="text-neutral-800 dark:text-neutral-200">{cal.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => {
            const toExport = calendars.filter((c) => selected.has(c.id));
            for (const c of toExport) handleExport(c.id, c.name);
            onClose();
          }}
          disabled={selected.size === 0}
          className="h-7 text-xs"
        >
          {t("settings.exportSelected")} ({selected.size})
        </Button>
        <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
          {t("settings.cancel")}
        </Button>
      </div>
    </div>
  );
}
