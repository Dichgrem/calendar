import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import type { Event, Calendar } from "../types";

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

function roundToNextHour(d: Date): Date {
  const r = new Date(d);
  r.setMinutes(0, 0, 0);
  r.setHours(r.getHours() + 1);
  return r;
}

export function EventEditor(props: EventEditorProps) {
  const { open, onClose } = props;
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [calendarId, setCalendarId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (props.mode === "edit") {
      const { event } = props;
      setTitle(event.title);
      setStartAt(event.startAt.slice(0, 16));
      setEndAt(event.endAt.slice(0, 16));
      setAllDay(event.allDay);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      setCalendarId(event.calendarId);
    } else {
      const now = new Date();
      const start = props.defaultStart ?? roundToNextHour(now);
      const end = props.defaultEnd ?? new Date(start.getTime() + 60 * 60 * 1000);
      setTitle("");
      setStartAt(toLocalInput(start));
      setEndAt(toLocalInput(end));
      setAllDay(false);
      setDescription("");
      setLocation("");
      if (props.defaultCalendarId) {
        setCalendarId(props.defaultCalendarId);
      } else if (props.calendars.length > 0) {
        setCalendarId(props.calendars[0].id);
      }
    }
  }, [open, props.mode]);

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
    const data: Partial<Event> = {
      title,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
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

  const busy =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const hasError =
    createMutation.isError || updateMutation.isError || deleteMutation.isError;
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={busy}
              className="text-red-600 hover:text-red-700 mr-auto"
            >
              {t("event.delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t("event.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy || noCalendars || !title.trim()}>
            {createMutation.isPending || updateMutation.isPending
              ? isCreate ? t("event.creating") : t("event.saving")
              : t("event.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {noCalendars && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded px-3 py-2">
            {t("cal.noCalendars")}
          </p>
        )}

        {showCalendarSelect && (
          <label className="block">
            <span className="text-xs font-medium text-neutral-500">{t("event.calendar")}</span>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
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
          <span className="text-xs font-medium text-neutral-500">{t("event.title")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
            autoFocus
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 block">
            <span className="text-xs font-medium text-neutral-500">{t("event.start")}</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
            />
          </label>
          <label className="flex-1 block">
            <span className="text-xs font-medium text-neutral-500">{t("event.end")}</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
            />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="accent-neutral-900 dark:accent-white"
          />
          <span className="text-sm">{t("event.allDay")}</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-neutral-500">{t("event.location")}</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-neutral-500">{t("event.description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600 resize-none"
          />
        </label>

        {hasError && (
          <p className="text-xs text-red-500">{t("event.error")}</p>
        )}
      </div>
    </Modal>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
