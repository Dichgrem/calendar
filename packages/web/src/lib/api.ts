import type { Calendar, Event, Todo, TodoList, UserSettings, SyncPullResponse } from "@calendar/shared";

interface ApiResponse<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: { code: string; message: string };
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }

  if (res.headers.get("Content-Type")?.includes("text/calendar")) {
    return { blob: await res.blob(), filename: "" } as T;
  }

  return res.json();
}

export const api = {
  calendars: {
    list: () => request<ApiResponse<Calendar[]>>("/calendars"),
    get: (id: string) => request<ApiResponse<Calendar>>(`/calendars/${id}`),
    create: (data: { name: string; color?: string }) =>
      request<ApiResponse<Calendar>>("/calendars", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Calendar>) =>
      request<ApiResponse<Calendar>>(`/calendars/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<ApiResponse<null>>(`/calendars/${id}`, { method: "DELETE" }),
  },

  events: {
    list: (calendarId: string, start: string, end: string) =>
      request<ApiResponse<Event[]>>(`/calendars/${calendarId}/events?start=${start}&end=${end}`),
    get: (id: string) => request<ApiResponse<Event>>(`/events/${id}`),
    create: (calendarId: string, data: Partial<Event>) =>
      request<ApiResponse<Event>>(`/calendars/${calendarId}/events`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Event>) =>
      request<ApiResponse<Event>>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<ApiResponse<null>>(`/events/${id}`, { method: "DELETE" }),
  },

  todos: {
    list: (calendarId: string, params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<ApiResponse<Todo[]>>(`/calendars/${calendarId}/todos${qs}`);
    },
    get: (id: string) => request<ApiResponse<Todo>>(`/todos/${id}`),
    create: (calendarId: string, data: Partial<Todo>) =>
      request<ApiResponse<Todo>>(`/calendars/${calendarId}/todos`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Todo>) =>
      request<ApiResponse<Todo>>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<ApiResponse<null>>(`/todos/${id}`, { method: "DELETE" }),
  },

  todoLists: {
    list: () => request<ApiResponse<TodoList[]>>("/todo-lists"),
    create: (data: { name: string }) =>
      request<ApiResponse<TodoList>>("/todo-lists", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string }) =>
      request<ApiResponse<TodoList>>(`/todo-lists/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<ApiResponse<null>>(`/todo-lists/${id}`, { method: "DELETE" }),
  },

  ics: {
    preview: (content: string) =>
      request<ApiResponse<unknown>>("/ics/preview", { method: "POST", body: JSON.stringify({ content }) }),
    import: (data: { content: string; calendarId?: string; calendarName?: string; selectedUids: string[]; overwrite?: boolean }) =>
      request<ApiResponse<unknown>>("/ics/import", { method: "POST", body: JSON.stringify(data) }),
    exportUrl: (calendarId: string, start?: string, end?: string) =>
      `/api/calendars/${calendarId}/ics/export${start ? `?start=${start}&end=${end}` : ""}`,
  },

  sync: {
    pull: (lastPulledSeq: number) =>
      request<ApiResponse<SyncPullResponse>>(`/sync/pull?last_pulled_seq=${lastPulledSeq}`),
    push: (data: unknown) =>
      request<ApiResponse<unknown>>("/sync/push", { method: "POST", body: JSON.stringify(data) }),
  },

  settings: {
    get: () => request<ApiResponse<UserSettings>>("/settings"),
    update: (data: Partial<UserSettings>) =>
      request<ApiResponse<UserSettings>>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
  },
};
