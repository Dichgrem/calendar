import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { route } from "preact-router";
import { useAuth } from "../hooks/use-auth";

export function RequireAuth({ children }: { children: ComponentChildren }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      route("/auth/login", true);
    }
    if (!isLoading) setChecked(true);
  }, [isAuthenticated, isLoading]);

  if (isLoading || !checked) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
