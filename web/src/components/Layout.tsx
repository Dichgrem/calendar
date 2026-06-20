import { CalendarDots, GearSix, MagnifyingGlass, SignOut } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { route } from "preact-router";
import { useI18n } from "../hooks/use-i18n";
import { NavProvider } from "../hooks/use-nav";
import { api } from "../lib/api";

interface TopBarSlots {
  left: HTMLDivElement | null;
  center: HTMLDivElement | null;
  right: HTMLDivElement | null;
  searchDropdown: HTMLDivElement | null;
}

const TopBarCtx = createContext<TopBarSlots | null>(null);
const SearchCtx = createContext<{
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchCalId: string | null;
  setSearchCalId: (v: string | null) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
}>({
  searchQuery: "",
  setSearchQuery: () => {},
  searchCalId: null,
  setSearchCalId: () => {},
  searchOpen: false,
  setSearchOpen: () => {},
});

export function useTopBar() {
  return useContext(TopBarCtx);
}

export function useSearch() {
  return useContext(SearchCtx);
}

export function Layout({ children }: { children: ComponentChildren }) {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [centerEl, setCenterEl] = useState<HTMLDivElement | null>(null);
  const [rightEl, setRightEl] = useState<HTMLDivElement | null>(null);
  const [dropdownEl, setDropdownEl] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCalId, setSearchCalId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const leftRef = useCallback((el: HTMLDivElement | null) => setLeftEl(el), []);
  const centerRef = useCallback((el: HTMLDivElement | null) => setCenterEl(el), []);
  const rightRef = useCallback((el: HTMLDivElement | null) => setRightEl(el), []);
  const dropdownRef = useCallback((el: HTMLDivElement | null) => setDropdownEl(el), []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.auth.logout();
      queryClient.clear();
      route("/auth/login");
    } finally {
      setLoggingOut(false);
    }
  };

  // Keyboard shortcut: Ctrl+K or / to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navItems = [
    { to: "/calendar", icon: CalendarDots, label: t("nav.calendar") },
    { to: "/settings", icon: GearSix, label: t("nav.settings") },
  ];

  return (
    <NavProvider>
      <TopBarCtx.Provider value={{ left: leftEl, center: centerEl, right: rightEl, searchDropdown: dropdownEl }}>
        <SearchCtx.Provider
          value={{
            searchQuery,
            setSearchQuery,
            searchCalId,
            setSearchCalId,
            searchOpen,
            setSearchOpen,
          }}
        >
          <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950">
            <nav className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-1 border-b border-neutral-300 dark:border-neutral-600">
              <div ref={leftRef} className="flex items-center gap-1" />
              <div ref={centerRef} className="flex items-center justify-center gap-1" />
              <div className="flex items-center gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    setSearchQuery("");
                    setSearchCalId(null);
                  }}
                  aria-label={t("cal.search")}
                  className="size-8 flex items-center justify-center rounded-full transition-colors text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800"
                  title={t("cal.search")}
                >
                  <MagnifyingGlass className="size-4" weight="bold" />
                </button>
                <div ref={rightRef} className="flex items-center gap-1" />
                {navItems.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => route(item.to)}
                    aria-label={item.label}
                    className="size-8 flex items-center justify-center rounded-full text-sm transition-colors text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <item.icon className="size-4" weight="bold" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  aria-label={t("nav.logout")}
                  className={`size-8 flex items-center justify-center rounded-full text-sm transition-colors ${loggingOut ? "opacity-50" : "text-neutral-500 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
                  title={t("nav.logout")}
                >
                  <SignOut className="size-4" weight="bold" />
                </button>
              </div>
            </nav>
            <div ref={dropdownRef} className="relative" />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </SearchCtx.Provider>
      </TopBarCtx.Provider>
    </NavProvider>
  );
}
