import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import type { Event } from "../types";

interface EventEditorProps {
  event: Event | null;
  open: boolean;
  onClose: () => void;
}

export function EventEditor({ event, open, onClose }: EventEditorProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (event && open) {
      setTitle(event.title);
      setStartAt(event.startAt.slice(0, 16));
      setEndAt(event.endAt.slice(0, 16));
      setAllDay(event.allDay);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
    }
  }, [event, open]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Event>) => api.events.update(event!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.events.remove(event!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const handleSave = () => {
    if (!event) return;
    updateMutation.mutate({
      title,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      allDay,
      description: description || null,
      location: location || null,
    });
  };

  if (!event) return null;

  const busy = updateMutation.isPending || deleteMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("event.edit")}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={busy}
            className="text-red-600 hover:text-red-700 mr-auto"
          >
            {t("event.delete")}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t("event.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {updateMutation.isPending ? t("event.saving") : t("event.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-neutral-500">{t("event.title")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:border-neutral-600"
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

        {(updateMutation.isError || deleteMutation.isError) && (
          <p className="text-xs text-red-500">{t("event.error")}</p>
        )}
      </div>
    </Modal>
  );
}
