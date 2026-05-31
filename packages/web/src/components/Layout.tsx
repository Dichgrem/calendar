import { Outlet, NavLink } from "react-router";
import { Calendar, ListTodo, Settings } from "lucide-react";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/calendar", icon: Calendar, label: "日历" },
  { to: "/calendar/todos", icon: ListTodo, label: "待办" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Layout() {
  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
      <nav className="flex items-center gap-1 px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex-1" />
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
      </nav>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
