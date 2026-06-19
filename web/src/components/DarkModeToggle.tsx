import { Moon, Sun } from "@phosphor-icons/react";
import { useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";

export function DarkModeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "1");

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("darkMode", next ? "1" : "0");
    document.documentElement.className = next ? "dark" : "light";
    document.body.className = next
      ? "bg-background text-neutral-800 dark:text-neutral-200 antialiased dark"
      : "bg-background text-neutral-800 dark:text-neutral-200 antialiased light";
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("cal.lightMode") : t("cal.darkMode")}
      className="size-10 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-lg flex items-center justify-center text-neutral-700 dark:text-neutral-200 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none group-hover:pointer-events-auto"
    >
      {dark ? <Sun className="size-5" weight="bold" /> : <Moon className="size-5" weight="bold" />}
    </button>
  );
}
