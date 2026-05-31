import type { CalendarRole, ID } from "./types.js";

declare const CalendarScopedBrand: unique symbol;
export type CalendarScoped<T> = T & { [CalendarScopedBrand]: true };

declare const PermissionedBrand: unique symbol;
export type Permissioned<T> = T & { [PermissionedBrand]: true };

export interface UserContext {
  userId: ID;
  session: { active: boolean };
}

export interface PermissionContext {
  userId: ID;
  roles: Map<ID, CalendarRole>;
}

export function roleGte(role: CalendarRole, min: CalendarRole): boolean {
  const rank: Record<CalendarRole, number> = {
    viewer: 0,
    editor: 1,
    admin: 2,
  };
  return rank[role] >= rank[min];
}
