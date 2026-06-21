import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { UserSettings } from "../types";

const DEFAULTS: UserSettings = {
  userId: "",
  language: "zh-CN",
  firstDayOfWeek: 1,
  showEventTime: false,
  dateFormat: "zh",
  showLunarCalendar: true,
  defaultCalendarId: undefined,
  autoBackupCalendars: undefined,
  autoBackupInterval: undefined,
};

const LOCAL_KEYS: (keyof UserSettings)[] = [
  "language",
  "firstDayOfWeek",
  "dateFormat",
  "showLunarCalendar",
  "showEventTime",
  "defaultCalendarId",
];

function getLocalPrefs(): Partial<UserSettings> {
  try {
    const raw = localStorage.getItem("prefs");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Extracted to module scope: same identity across renders → no cascading re-renders.
function mergeSettings(db: Partial<UserSettings> | undefined): UserSettings {
  return { ...DEFAULTS, ...(db ?? {}), ...getLocalPrefs() };
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.settings.get();
      return mergeSettings(res.data);
    },
    staleTime: 60_000,
  });
}

export function savePrefs(partial: Partial<UserSettings>) {
  const current = getLocalPrefs();
  const next: Record<string, unknown> = { ...current, ...partial };
  const toPersist: Record<string, unknown> = {};
  for (const k of LOCAL_KEYS) {
    if (next[k] !== undefined) toPersist[k] = next[k];
  }
  localStorage.setItem("prefs", JSON.stringify(toPersist));
}
