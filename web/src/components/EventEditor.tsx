import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import type { Calendar, Event } from "../types";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

interface EditMode {
  mode: "edit";
  event: Event;
  open: boolean;
  onClose: () => void;
}

interface CreateMode {
  mode: "create";
  calendars: Calendar[];
  defaultCalendarId?: string;
  defaultStart?: Date;
  defaultEnd?: Date;
  open: boolean;
  onClose: () => void;
}

type EventEditorProps = EditMode | CreateMode;

export function roundToNextHour(d: Date): Date {
  const r = new Date(d);
  r.setMinutes(0, 0, 0);
  r.setHours(r.getHours() + 1);
  return r;
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventEditor(props: EventEditorProps) {
  const { open, onClose } = props;
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("00:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [calendarId, setCalendarId] = useState("");

  const eventForEffect = props.mode === "edit" ? props.event : null;

  useEffect(() => {
    if (!open) return;
    if (props.mode === "edit" && eventForEffect) {
      setTitle(eventForEffect.title);
      setStartDate(eventForEffect.startAt.slice(0, 10));
      setStartTime(eventForEffect.startAt.slice(11, 16));
      setEndDate(eventForEffect.endAt.slice(0, 10));
      setEndTime(eventForEffect.endAt.slice(11, 16));
      setAllDay(eventForEffect.allDay);
      setDescription(eventForEffect.description ?? "");
      setLocation(eventForEffect.location ?? "");
      setCalendarId(eventForEffect.calendarId);
    } else if (props.mode === "create") {
      const now = new Date();
      const start = props.defaultStart ?? roundToNextHour(now);
      const end = props.defaultEnd ?? new Date(start.getTime() + 60 * 60 * 1000);
      const startStr = toLocalInput(start);
      const endStr = toLocalInput(end);
      setTitle("");
      setStartDate(startStr.slice(0, 10));
      setStartTime(startStr.slice(11, 16));
      setEndDate(endStr.slice(0, 10));
      setEndTime(endStr.slice(11, 16));
      setAllDay(false);
      setDescription("");
      setLocation("");
      if (props.defaultCalendarId) {
        setCalendarId(props.defaultCalendarId);
      } else if (props.calendars.length > 0) {
        setCalendarId(props.calendars[0].id);
      }
    }
  }, [open, eventForEffect?.id]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Event>) => api.events.create(calendarId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const editEventId = props.mode === "edit" ? props.event.id : null;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Event>) => api.events.update(editEventId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.events.remove(editEventId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const handleSave = () => {
    if (!calendarId) return;
    const data: Partial<Event> = {
      title,
      startAt: new Date(`${startDate}T${allDay ? "00:00" : startTime}`).toISOString(),
      endAt: new Date(`${endDate}T${allDay ? "00:00" : endTime}`).toISOString(),
      allDay,
      description: description || null,
      location: location || null,
    };
    if (props.mode === "create") {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const hasError = createMutation.isError || updateMutation.isError || deleteMutation.isError;
  const isCreate = props.mode === "create";
  const showCalendarSelect = isCreate && props.calendars.length > 1;
  const noCalendars = isCreate && props.calendars.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? t("event.create") : t("event.edit")}
      footer={
        <>
          {!isCreate && (
            <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate()} disabled={busy}>
              {t("event.delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t("event.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {busy ? t("event.saving") : t("event.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {noCalendars && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/50 rounded-lg px-3 py-2">
            {t("cal.noCalendars")}
          </p>
        )}

        {showCalendarSelect && (
          <label className="block">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.calendar")}</span>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.currentTarget.value)}
              className="mt-1.5 block w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {props.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.title")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            className="mt-1.5 block w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.start")}</span>
            <div className="mt-1.5 flex gap-1">
              <input
                type="date"
                min="1970-01-01"
                max="2100-12-31"
                value={startDate}
                onChange={(e) => setStartDate(e.currentTarget.value)}
                className="flex-1 border rounded-lg px-2 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.currentTarget.value)}
                  className="w-26 border rounded-lg px-2 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              )}
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.end")}</span>
            <div className="mt-1.5 flex gap-1">
              <input
                type="date"
                min="1970-01-01"
                max="2100-12-31"
                value={endDate}
                onChange={(e) => setEndDate(e.currentTarget.value)}
                className="flex-1 border rounded-lg px-2 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.currentTarget.value)}
                  className="w-26 border rounded-lg px-2 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              )}
            </div>
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.currentTarget.checked)}
            className="peer sr-only"
          />
          <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors ">
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5 text-white dark:text-neutral-800"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-sm text-neutral-800 dark:text-neutral-200">{t("event.allDay")}</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.location")}</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
            className="mt-1.5 block w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("event.description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={3}
            className="mt-1.5 block w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-none"
          />
        </label>

        {hasError && <p className="text-xs text-red-500">{t("event.error")}</p>}
      </div>
    </Modal>
  );
}
