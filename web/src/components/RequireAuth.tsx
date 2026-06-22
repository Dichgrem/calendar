import { useQueryClient } from "@tanstack/react-query";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useAuth } from "../hooks/use-auth";

export function RequireAuth({ children }: { children: ComponentChildren }) {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const wasEverAuthed = useRef(false);

  if (isAuthenticated) wasEverAuthed.current = true;

  if (window.location.pathname === "/auth/login") return <>{children}</>;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/auth/login";
    }
  }, [isLoading, isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <>
      {wasEverAuthed.current && !isAuthenticated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-3 py-1 flex items-center justify-center gap-3">
          <span className="text-xs text-red-700 dark:text-red-300">Session expired</span>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["auth"] })}
            className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      )}
      {children}
    </>
  );
}
