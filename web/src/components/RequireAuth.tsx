import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { route } from "preact-router";
import { useAuth } from "../hooks/use-auth";

const AUTH_TIMEOUT_MS = 10_000;

export function RequireAuth({ children }: { children: ComponentChildren }) {
  const { isAuthenticated, isLoading, error } = useAuth();
  const [checked, setChecked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      setTimedOut(false);
      timerRef.current = setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    if (timedOut) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (error) {
      route("/auth/login", true);
      return;
    }

    if (!isAuthenticated) {
      route("/auth/login", true);
    } else {
      setChecked(true);
    }
  }, [isAuthenticated, isLoading, error]);

  if (isLoading && !timedOut) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (timedOut || (error && !isAuthenticated)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">{timedOut ? "Connection timed out" : "Session expired"}</p>
        <button
          type="button"
          onClick={() => {
            setTimedOut(false);
            setChecked(false);
            window.location.reload();
          }}
          className="px-3 py-1.5 text-xs rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!checked) return null;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
