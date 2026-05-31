import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Circle, CheckCircle2, CircleDot, Plus } from "lucide-react";
import { useCalendars } from "../hooks/use-calendars";
import { useTodos } from "../hooks/use-todos";
import { useTodoLists } from "../hooks/use-todo-lists";
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

const statusLabels: Record<TodoStatus, string> = {
  todo: "待完成",
  in_progress: "进行中",
  completed: "已完成",
};

export function TodoListView() {
  const queryClient = useQueryClient();
  const { data: calendars } = useCalendars();
  const { data: lists } = useTodoLists();

  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<TodoStatus | "">("");

  const activeCalendarId =
    selectedCalendarId || calendars?.[0]?.id || "";

  const params: Record<string, string> = {};
  if (selectedListId) params.list_id = selectedListId;
  if (statusFilter) params.status = statusFilter;

  const { data: todos, isLoading, isError } = useTodos(activeCalendarId, params);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) =>
      api.todos.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.todos.create(activeCalendarId, { title: "新待办" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

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
          <option value="">全部清单</option>
          {lists?.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TodoStatus | "")}
          className="text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-900 dark:border-neutral-700"
        >
          <option value="">全部状态</option>
          <option value="todo">待完成</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已完成</option>
        </select>

        <div className="flex-1" />

        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4 mr-1" />
          新建
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <p className="p-4 text-sm text-neutral-400">加载中...</p>
        )}
        {isError && (
          <p className="p-4 text-sm text-red-500">加载失败</p>
        )}

        {todos?.length === 0 && !isLoading && !isError && (
          <p className="p-4 text-sm text-neutral-400">暂无待办</p>
        )}

        {todos?.map((todo) => {
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
                <p
                  className={cn(
                    "text-sm",
                    todo.status === "completed" && "line-through",
                  )}
                >
                  {todo.title}
                </p>

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
            </div>
          );
        })}
      </div>
    </div>
  );
}
