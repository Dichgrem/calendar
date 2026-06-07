import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NotePencil, Trash, Check, X, DownloadSimple, FileArrowDown, Globe } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { useCalendarReorder } from "../hooks/use-calendar-reorder";
import { Button } from "../components/ui/button";
import { ColorSwatchPicker } from "../components/ColorSwatchPicker";
import type { Calendar } from "../types";
import { useNavigate } from "react-router";

interface CommonCalendar {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  url: string;
  color: string;
}

const COMMON_CALENDARS: CommonCalendar[] = [
  {
    id: "cn-holidays",
    name: "中国节假日",
    nameEn: "Chinese Holidays",
    description: "法定节假日及调休补班",
    descriptionEn: "Public holidays and schedule adjustments",
    url: "https://cdn.jsdelivr.net/npm/chinese-days/dist/holidays.ics",
    color: "#ef4444",
  },
  {
    id: "cn-festival",
    name: "节日纪念日",
    nameEn: "Festivals & Memorial Days",
    description: "中国传统节日、纪念日",
    descriptionEn: "Chinese traditional festivals and memorial days",
    url: "https://yangh9.github.io/ChinaCalendar/cal_festival.ics",
    color: "#f59e0b",
  },
  {
    id: "cn-solar-term",
    name: "二十四节气",
    nameEn: "24 Solar Terms",
    description: "立春、雨水、惊蛰等二十四节气",
    descriptionEn: "Start of Spring, Rain Water, Awakening of Insects, etc.",
    url: "https://yangh9.github.io/ChinaCalendar/cal_solarTerm.ics",
    color: "#10b981",
  },
];

interface CalendarManagementProps {
  calendars: Calendar[] | undefined;
}

export function CalendarManagement({ calendars }: CalendarManagementProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang } = useI18n();
  const [editingCal, setEditingCal] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [commonCalOpen, setCommonCalOpen] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { dragId, onDragStart, onDragOver, onDrop, onDragEnd } = useCalendarReorder(
    calendars?.map((c) => c.id) ?? []
  );

  const importedCommonIds = new Set(
    COMMON_CALENDARS
      .filter((cal) => calendars?.some((c) => c.sourceUrl === cal.url))
      .map((cal) => cal.id)
  );

  const startEditCal = (cal: Calendar) => {
    setEditingCal(cal.id);
    setEditName(cal.name);
    setEditColor(cal.color);
  };

  const saveCalEdit = async () => {
    if (!editingCal) return;
    await api.calendars.update(editingCal, { name: editName, color: editColor });
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
    setEditingCal(null);
  };

  const deleteCalendar = async (id: string) => {
    if (!window.confirm(t("settings.confirmDelete"))) return;
    setDeleting(id);
    try {
      await api.calendars.remove(id);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch {
      setImportError(t("settings.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  const handleExportCal = (calendarId: string, calName: string) => {
    const url = api.ics.exportUrl(calendarId);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${calName}.ics`;
    a.click();
  };

  const handleExportSelected = () => {
    calendars?.filter((cal) => exportSelected.has(cal.id)).forEach((cal) => {
      handleExportCal(cal.id, cal.name);
    });
    setExportOpen(false);
  };

  const toggleExportCal = (id: string) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExportAll = () => {
    if (!calendars) return;
    setExportSelected((prev) =>
      prev.size === calendars.length ? new Set() : new Set(calendars.map((c) => c.id))
    );
  };

  const handleImportCommon = async (cal: CommonCalendar) => {
    setImporting((prev) => new Set(prev).add(cal.id));
    setImportError(null);
    try {
      const res = await api.ics.fetchUrl(cal.url);
      const { preview, content } = (res as { ok: boolean; data: { preview: { name: string; items: Array<{ uid: string }> }; content: string } }).data;
      await api.ics.import({
        content,
        calendarName: cal.name,
        color: cal.color,
        sourceUrl: cal.url,
        selectedUids: preview.items.map((i) => i.uid),
        overwrite: false,
      });
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("import.importFailed"));
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(cal.id);
        return next;
      });
    }
  };

  return (
    <>
      <hr className="my-4 border-neutral-200 dark:border-neutral-800" />

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="font-semibold text-sm shrink-0 dark:text-white">{t("settings.calendars")}</h2>
        <div className="flex items-center gap-1 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setCommonCalOpen(!commonCalOpen)} className="h-7 text-xs gap-1">
            <Globe className="size-3" weight="bold" />{t("settings.commonCalendars")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/import")} className="h-7 text-xs gap-1">
            <DownloadSimple className="size-3" weight="bold" />{t("settings.importIcs")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setExportSelected(new Set(calendars?.map((c) => c.id) ?? []));
            setExportOpen(true);
          }} className="h-7 text-xs gap-1">
            <FileArrowDown className="size-3" weight="bold" />{t("settings.exportIcs")}
          </Button>
        </div>
      </div>

      {exportOpen && (
        <div className="mb-3 p-3 border rounded-lg border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("settings.selectCalendars")}</span>
            <button onClick={toggleExportAll} className="text-xs text-blue-500 hover:underline">
              {exportSelected.size === calendars?.length ? t("settings.deselectAll") : t("settings.selectAll")}
            </button>
          </div>
          <div className="space-y-1 mb-2">
            {calendars?.map((cal) => (
              <label key={cal.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportSelected.has(cal.id)}
                  onChange={() => toggleExportCal(cal.id)}
                  className="accent-neutral-900 dark:accent-white"
                />
                <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="text-sm dark:text-neutral-200">{cal.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" onClick={handleExportSelected} disabled={exportSelected.size === 0} className="h-7 text-xs">
              {t("settings.exportSelected")} ({exportSelected.size})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} className="h-7 text-xs">
              {t("settings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {commonCalOpen && (
        <div className="mb-3 space-y-2">
          {COMMON_CALENDARS.map((cal) => (
            <div key={cal.id} className="flex items-center gap-2 p-2 border rounded-lg border-neutral-200 dark:border-neutral-700">
              <span className="size-4 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{lang === "en" ? cal.nameEn : cal.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{lang === "en" ? cal.descriptionEn : cal.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImportCommon(cal)}
                disabled={importing.has(cal.id) || importedCommonIds.has(cal.id)}
                className="h-7 text-xs shrink-0"
              >
                {importing.has(cal.id)
                  ? t("settings.importing")
                  : importedCommonIds.has(cal.id)
                    ? t("settings.imported")
                    : t("settings.importBtn")}
              </Button>
            </div>
          ))}
          {importError && (
            <p className="text-xs text-red-500">{importError}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {calendars?.map((cal) => (
          <div
            key={cal.id}
            draggable
            onDragStart={(e) => onDragStart(e, cal.id)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, cal.id)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-2 p-1.5 border rounded-lg border-neutral-200 dark:border-neutral-700 transition-colors ${dragId === cal.id ? "opacity-50" : ""} ${dragId && dragId !== cal.id ? "border-blue-300 dark:border-blue-700" : ""}`}
          >
            {editingCal === cal.id ? (
              <>
                <div className="flex-1 space-y-1.5">
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-600" />
                  <ColorSwatchPicker value={editColor} onChange={setEditColor} />
                </div>
                <button onClick={saveCalEdit} aria-label={t("settings.save")} className="size-6 flex items-center justify-center rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600">
                  <Check className="size-4" weight="bold" />
                </button>
                <button onClick={() => setEditingCal(null)} aria-label={t("settings.cancel")} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
                  <X className="size-4" weight="bold" />
                </button>
              </>
            ) : (
              <>
                <span className="size-4 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="flex-1 text-sm truncate dark:text-neutral-200">{cal.name}</span>
                <button onClick={() => startEditCal(cal)} aria-label={t("settings.editCalendar")} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
                  <NotePencil className="size-3.5" weight="bold" />
                </button>
                <button onClick={() => deleteCalendar(cal.id)} disabled={deleting === cal.id} aria-label={t("settings.deleteCalendar")} className={`size-6 flex items-center justify-center rounded text-neutral-400 ${deleting === cal.id ? "opacity-50 cursor-not-allowed" : "hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600"}`}>
                  <Trash className="size-3.5" weight="bold" />
                </button>
              </>
            )}
          </div>
        ))}
        {calendars?.length === 0 && (
          <p className="text-sm text-neutral-400">{t("settings.noCalendars")}</p>
        )}
      </div>

      {importError && (
        <p className="mt-2 text-xs text-red-500">{importError}</p>
      )}
    </>
  );
}
