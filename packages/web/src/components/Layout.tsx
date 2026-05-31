import { Outlet, NavLink } from "react-router";
import { Calendar, ListTodo, Upload, Settings } from "lucide-react";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/calendar", icon: Calendar, label: "日历" },
  { to: "/calendar/todos", icon: ListTodo, label: "待办" },
  { to: "/import", icon: Upload, label: "导入" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside className="w-16 flex flex-col items-center border-r border-neutral-200 dark:border-neutral-800 py-4 gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs transition-colors",
                isActive
                  ? "text-neutral-900 bg-neutral-200 dark:text-white dark:bg-neutral-800"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800",
              )
            }
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
