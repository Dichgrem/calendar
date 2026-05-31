import { createContext, useContext, useCallback, useState, type RefCallback } from "react";
import { Outlet, NavLink } from "react-router";
import { Calendar, ListTodo, Settings } from "lucide-react";
import { cn } from "../lib/utils";
import { useI18n } from "../hooks/use-i18n";

interface TopBarSlots {
  left: HTMLDivElement | null;
  center: HTMLDivElement | null;
}

const TopBarCtx = createContext<TopBarSlots | null>(null);

export function useTopBar() {
  return useContext(TopBarCtx);
}

export function Layout() {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [centerEl, setCenterEl] = useState<HTMLDivElement | null>(null);
  const { t } = useI18n();

  const leftRef: RefCallback<HTMLDivElement> = useCallback((el) => setLeftEl(el), []);
  const centerRef: RefCallback<HTMLDivElement> = useCallback((el) => setCenterEl(el), []);

  const navItems = [
    { to: "/calendar", icon: Calendar, label: t("nav.calendar") },
    { to: "/calendar/todos", icon: ListTodo, label: t("nav.todos") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <TopBarCtx.Provider value={{ left: leftEl, center: centerEl }}>
      <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
        <nav className="flex items-center gap-1 px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
          <div ref={leftRef} className="shrink-0 flex items-center gap-1" />
          <div className="flex-1 flex justify-center">
            <div ref={centerRef} className="flex items-center gap-1" />
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "text-neutral-900 bg-neutral-200 dark:text-white dark:bg-neutral-800"
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800",
                  )
                }
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TopBarCtx.Provider>
  );
}
