import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.auth
      .status()
      .then((res) => {
        const data = (res as { ok: boolean; data: { registered: boolean } }).data;
        setIsFirstUser(!data.registered);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isFirstUser) {
        await api.auth.register({ username, password });
      } else {
        await api.auth.login({ username, password });
      }
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      navigate("/calendar");
    } catch (e) {
      setError(e instanceof Error ? e.message : isFirstUser ? t("login.registerFailed") : t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">{t("cal.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-4"
      >
        <h1 className="text-xl font-bold dark:text-white">
          {isFirstUser ? t("login.createAccount") : t("login.login")}
        </h1>

        {isFirstUser && <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("login.firstUseHint")}</p>}

        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded px-3 py-2">{error}</p>}

        <label className="block">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{t("login.username")}</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{t("login.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
            required
            minLength={8}
          />
        </label>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? isFirstUser
              ? t("login.creating")
              : t("login.loggingIn")
            : isFirstUser
              ? t("login.create")
              : t("login.loginBtn")}
        </Button>
      </form>
    </div>
  );
}
