export {
  type ID,
  type CalendarRole,
  type CalendarSourceType,
  type Calendar,
  type Event,
  type UserSettings,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncPushConflict,
  type SyncPushResult,
} from "@calendar/shared";

declare const CalendarScopedBrand: unique symbol;
export type CalendarScoped<T> = T & { [CalendarScopedBrand]: true };

declare const PermissionedBrand: unique symbol;
export type Permissioned<T> = T & { [PermissionedBrand]: true };

export interface PermissionContext {
  userId: string;
  roles: Map<string, import("@calendar/shared").CalendarRole>;
}

export function roleGte(role: import("@calendar/shared").CalendarRole, min: import("@calendar/shared").CalendarRole): boolean {
  const rank: Record<import("@calendar/shared").CalendarRole, number> = {
    viewer: 0,
    editor: 1,
    admin: 2,
  };
  return rank[role] >= rank[min];
}
