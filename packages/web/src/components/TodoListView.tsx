import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Circle, CheckCircle2, CircleDot, Plus, X } from "lucide-react";
import { useCalendars } from "../hooks/use-calendars";
import { useTodos } from "../hooks/use-todos";
import { useTodoLists } from "../hooks/use-todo-lists";
import { useSettings } from "../hooks/use-settings";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import type { Todo, TodoStatus } from "@calendar/shared";

const statusIcons: Record<TodoStatus, typeof Circle> = {
  todo: Circle,
  in_progress: CircleDot,
  completed: CheckCircle2,
};

const priorityColors: Record<string, string> = {
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-blue-600",
  none: "text-neutral-400",
};

export function TodoListView() {
  const queryClient = useQueryClient();
  const { data: calendars } = useCalendars();
  const { data: lists } = useTodoLists();
  const { data: settings } = useSettings();
  const { t, lang } = useI18n();

  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<TodoStatus | "">("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const activeCalendarId =
    selectedCalendarId || calendars?.[0]?.id || "";

  const params: Record<string, string> = {};
  if (selectedListId) params.list_id = selectedListId;
  if (statusFilter) params.status = statusFilter;

  const { data: todos, isLoading, isError } = useTodos(activeCalendarId, params);

  const showCompleted = settings?.showCompletedTodos ?? true;
  const filteredTodos = showCompleted ? todos : todos?.filter((t) => t.status !== "completed");

  const statusLabels: Record<TodoStatus, string> = {
    todo: t("todo.statusTodo"),
    in_progress: t("todo.statusInProgress"),
    completed: t("todo.statusCompleted"),
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) =>
      api.todos.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.todos.create(activeCalendarId, { title: lang === "en" ? "New todo" : "新待办" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      const todo = (res as { ok: boolean; data: Todo }).data;
      if (todo) {
        setEditingId(todo.id);
        setEditingTitle(todo.title);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.todos.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.todos.update(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setEditingId(null);
    },
    onError: () => setEditingId(null),
  });

  const startRename = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const commitRename = () => {
    if (editingId && editingTitle.trim()) {
      renameMutation.mutate({ id: editingId, title: editingTitle.trim() });
    } else {
      setEditingId(null);
    }
  };

  const handleStatusCycle = (todo: Todo) => {
    const next: Record<TodoStatus, TodoStatus> = {
      todo: "in_progress",
      in_progress: "completed",
      completed: "todo",
    };
    statusMutation.mutate({ id: todo.id, status: next[todo.status] });
  };

  const handleCreate = () => {
    if (!activeCalendarId) return;
    createMutation.mutate();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-neutral-200 dark:border-neutral-800">
        <select
          value={activeCalendarId}
          onChange={(e) => setSelectedCalendarId(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700"
        >
          {calendars?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700"
        >
          <option value="">{t("todo.allLists")}</option>
          {lists?.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TodoStatus | "")}
          className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700"
        >
          <option value="">{t("todo.allStatus")}</option>
          <option value="todo">{t("todo.statusTodo")}</option>
          <option value="in_progress">{t("todo.statusInProgress")}</option>
          <option value="completed">{t("todo.statusCompleted")}</option>
        </select>

        <div className="flex-1" />

        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4 mr-1" />
          {t("todo.new")}
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <p className="p-4 text-sm text-neutral-400">{t("todo.loading")}</p>
        )}
        {isError && (
          <p className="p-4 text-sm text-red-500">{t("todo.loadFailed")}</p>
        )}

        {filteredTodos?.length === 0 && !isLoading && !isError && (
          <p className="p-4 text-sm text-neutral-400">{t("todo.empty")}</p>
        )}

        {filteredTodos?.map((todo) => {
          const StatusIcon = statusIcons[todo.status];
          return (
            <div
              key={todo.id}
              className={cn(
                "flex items-start gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 cursor-pointer transition-colors",
                todo.status === "completed" && "opacity-50",
              )}
              onClick={() => handleStatusCycle(todo)}
            >
              <StatusIcon
                className={cn(
                  "size-5 mt-0.5 shrink-0",
                  todo.status === "completed"
                    ? "text-green-600"
                    : "text-neutral-400 hover:text-neutral-600",
                )}
              />

              <div className="flex-1 min-w-0">
                {editingId === todo.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="w-full text-sm border rounded px-1 py-0.5 bg-white dark:bg-neutral-800 dark:border-neutral-600"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p
                    className={cn(
                      "text-sm",
                      todo.status === "completed" && "line-through",
                    )}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(todo);
                    }}
                    title={t("todo.dblClickEdit")}
                  >
                    {todo.title}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-0.5">
                  {todo.priority !== "none" && (
                    <span className={cn("text-xs", priorityColors[todo.priority])}>
                      {todo.priority === "high" ? "!!" : todo.priority === "medium" ? "!" : "·"}
                    </span>
                  )}

                  {todo.dueDate && (
                    <span className="text-xs text-neutral-400">{todo.dueDate}</span>
                  )}

                  <span className="text-xs text-neutral-400">
                    {statusLabels[todo.status]}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(todo.id);
                }}
                className="size-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-400 hover:text-red-600 shrink-0 mt-0.5"
                title={t("todo.delete")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
