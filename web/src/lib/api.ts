import type { Calendar, Event, SyncPullResponse, UserSettings } from "../types";

interface ApiResponse<T> {
  ok: true;
  data: T;
}

function getBaseUrl(): string {
  const serverUrl = localStorage.getItem("serverUrl")?.replace(/\/+$/, "");
  if (serverUrl && !/^https?:\/\//.test(serverUrl)) {
    localStorage.removeItem("serverUrl");
    return "/api";
  }
  return serverUrl ? `${serverUrl}/api` : "/api";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBaseUrl();
  return doFetch<T>(base, path, init);
}

/** Plain fetch — no queue, no timeout, no abort. FullCalendar/Cal.com style. */
async function doFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const res = await fetch(`${base}${path}`, {
    ...rest,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...initHeaders },
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

export interface IcsPreviewData {
  name: string;
  eventCount: number;
  timeSpan: { from: string | null; to: string | null };
  items: Array<{
    type: "event";
    uid: string;
    title: string;
    startAt: string | null;
    endAt: string | null;
    rrule: string | null;
    selected: boolean;
  }>;
}

export const api = {
  auth: {
    status: () => request<ApiResponse<{ registered: boolean }>>("/auth/status"),
    register: (data: { username: string; password: string }) =>
      request<ApiResponse<{ userId: string }>>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { username: string; password: string }) =>
      request<ApiResponse<{ userId: string }>>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () => request<ApiResponse<null>>("/auth/logout", { method: "POST" }),
    me: () => request<ApiResponse<{ userId: string; username: string }>>("/auth/me"),
    changePassword: (data: { oldPassword: string; newPassword: string }) =>
      request<ApiResponse<unknown>>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    changeUsername: (data: { username: string }) =>
      request<ApiResponse<unknown>>("/auth/change-username", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  calendars: {
    list: () => request<ApiResponse<Calendar[]>>("/calendars"),
    get: (id: string) => request<ApiResponse<Calendar>>(`/calendars/${encodeURIComponent(id)}`),
    create: (data: { name: string; color?: string }) =>
      request<ApiResponse<Calendar>>("/calendars", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Calendar>) =>
      request<ApiResponse<Calendar>>(`/calendars/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<ApiResponse<null>>(`/calendars/${encodeURIComponent(id)}`, { method: "DELETE" }),
    reorder: (orderedIds: string[]) =>
      request<ApiResponse<null>>("/calendars/reorder", {
        method: "PATCH",
        body: JSON.stringify({ orderedIds }),
      }),
  },

  events: {
    all: (start: string, end: string, title?: string) =>
      request<ApiResponse<Event[]>>(
        `/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${title ? `&title=${encodeURIComponent(title)}` : ""}`,
      ),
    list: (calendarId: string, start: string, end: string) =>
      request<ApiResponse<Event[]>>(
        `/calendars/${encodeURIComponent(calendarId)}/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      ),
    get: (id: string) => request<ApiResponse<Event>>(`/events/${encodeURIComponent(id)}`),
    create: (calendarId: string, data: Partial<Event>) =>
      request<ApiResponse<Event>>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Event>) =>
      request<ApiResponse<Event>>(`/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<ApiResponse<null>>(`/events/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  ics: {
    preview: (content: string) =>
      request<ApiResponse<IcsPreviewData>>("/ics/preview", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    fetchUrl: (url: string) =>
      request<ApiResponse<{ preview: IcsPreviewData; content: string }>>("/ics/fetch-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    import: (data: {
      content: string;
      calendarId?: string;
      calendarName?: string;
      color?: string;
      sourceUrl?: string;
      selectedUids: string[];
      overwrite?: boolean;
    }) => request<ApiResponse<unknown>>("/ics/import", { method: "POST", body: JSON.stringify(data) }),
    exportUrl: (calendarId: string, start?: string, end?: string) => {
      const base = getBaseUrl();
      let url = `${base}/calendars/${encodeURIComponent(calendarId)}/ics/export`;
      if (start && end) url += `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      return url;
    },
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
      request<ApiResponse<UserSettings>>("/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    exportConfig: () => request<{ userDefaults: Record<string, unknown> }>("/settings/config"),
  },

  backup: {
    create: () => request<ApiResponse<{ filename: string; path: string }>>("/backup", { method: "POST" }),
    download: (filename: string) => {
      const a = document.createElement("a");
      a.href = `${getBaseUrl()}/backup/download/${encodeURIComponent(filename)}`;
      a.download = filename;
      a.click();
    },
  },

  logs: (n?: number, level?: string, signal?: AbortSignal) =>
    request<ApiResponse<{ lines: string[] }>>(
      `/logs?n=${n ?? 500}${level ? `&level=${level}` : ""}`,
      signal ? { signal } : undefined,
    ),
};
