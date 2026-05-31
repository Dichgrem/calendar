import { createContext, useContext, useCallback, useState, type RefCallback } from "react";
import { Outlet, NavLink, useNavigate } from "react-router";
import { Calendar, Settings, LogOut, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";

interface TopBarSlots {
  left: HTMLDivElement | null;
  center: HTMLDivElement | null;
  searchDropdown: HTMLDivElement | null;
}

const TopBarCtx = createContext<TopBarSlots | null>(null);
const SearchCtx = createContext<{
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchCalId: string | null;
  setSearchCalId: (v: string | null) => void;
}>({ searchQuery: "", setSearchQuery: () => {}, searchCalId: null, setSearchCalId: () => {} });

export function useTopBar() {
  return useContext(TopBarCtx);
}

export function useSearch() {
  return useContext(SearchCtx);
}

export function Layout() {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [centerEl, setCenterEl] = useState<HTMLDivElement | null>(null);
  const [dropdownEl, setDropdownEl] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCalId, setSearchCalId] = useState<string | null>(null);
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const leftRef: RefCallback<HTMLDivElement> = useCallback((el) => setLeftEl(el), []);
  const centerRef: RefCallback<HTMLDivElement> = useCallback((el) => setCenterEl(el), []);
  const dropdownRef: RefCallback<HTMLDivElement> = useCallback((el) => setDropdownEl(el), []);

  const handleLogout = async () => {
    await api.auth.logout();
    queryClient.clear();
    navigate("/auth/login");
  };

  const navItems = [
    { to: "/calendar", icon: Calendar, label: t("nav.calendar") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <TopBarCtx.Provider value={{ left: leftEl, center: centerEl, searchDropdown: dropdownEl }}>
      <SearchCtx.Provider value={{ searchQuery, setSearchQuery, searchCalId, setSearchCalId }}>
      <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
        <nav className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
          <div ref={leftRef} className="flex items-center gap-1" />
          <div ref={centerRef} className="flex items-center justify-center gap-1" />
          <div className="flex items-center gap-1 justify-end">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder={t("cal.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-36 pl-7 pr-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
              />
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "size-8 flex items-center justify-center rounded-full text-sm transition-colors",
                    isActive
                      ? "text-neutral-900 bg-neutral-200 dark:text-white dark:bg-neutral-800"
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800",
                  )
                }
              >
                <item.icon className="size-4" />
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="size-8 flex items-center justify-center rounded-full text-sm text-neutral-500 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title={t("nav.logout")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </nav>
        <div ref={dropdownRef} className="relative" />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      </SearchCtx.Provider>
    </TopBarCtx.Provider>
  );
}
