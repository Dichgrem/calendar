import { useQueryClient } from "@tanstack/react-query";
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { useAuth } from "../hooks/use-auth";

/**
 * Renders children immediately. Auth runs silently in background.
 * Only shows UI when session actually expired (not on cold start).
 */
export function RequireAuth({ children }: { children: ComponentChildren }) {
  const { isAuthenticated, isLoading, error } = useAuth();
  const queryClient = useQueryClient();
  const wasEverAuthed = useRef(false);

  if (isAuthenticated) wasEverAuthed.current = true;

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  };

  return (
    <>
      {wasEverAuthed.current && !isAuthenticated && !isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-3 py-1 flex items-center justify-center gap-3">
          <span className="text-xs text-red-700 dark:text-red-300">
            {error ? "Session expired" : "Not authenticated"}
          </span>
          <button
            type="button"
            onClick={handleRetry}
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
