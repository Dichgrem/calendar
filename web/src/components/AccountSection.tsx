import { PencilSimple } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "preact/hooks";
import { useI18n } from "../hooks/use-i18n";
import { api } from "../lib/api";
import { Button } from "./ui/button";

interface AccountSectionProps {
  username: string;
}

export function AccountSection({ username }: AccountSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editUsername, setEditUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [editPassword, setEditPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [acctMsg, setAcctMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const handleChangeUsername = async () => {
    if (busy) return;
    setAcctMsg("");
    setBusy(true);
    try {
      const res = await api.auth.changeUsername({ username: newUsername });
      if (res?.ok) {
        queryClient.setQueryData(["auth", "me"], (old: { data?: { username: string } } | undefined) =>
          old ? { ...old, data: { ...old.data, username: newUsername } } : old,
        );
        setEditUsername(false);
        setAcctMsg(t("settings.saved"));
      }
    } catch {
      setAcctMsg(t("settings.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (busy) return;
    setAcctMsg("");
    if (newPassword.length < 8) {
      setAcctMsg(t("settings.pwTooShort"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.changePassword({ oldPassword, newPassword });
      if (res?.ok) {
        setEditPassword(false);
        setOldPassword("");
        setNewPassword("");
        setAcctMsg(t("settings.saved"));
      }
    } catch (e: any) {
      setAcctMsg(e?.message || t("settings.saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-neutral-400 shrink-0">{t("login.username")}</span>
          {editUsername ? (
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.currentTarget.value)}
              placeholder={username}
              className="border rounded-lg px-2 py-0.5 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 w-40"
            />
          ) : (
            <p className="text-sm truncate text-neutral-800 dark:text-neutral-200">{username}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editUsername ? (
            <>
              <Button size="sm" onClick={handleChangeUsername} disabled={busy} className="h-6 text-xs px-2">
                {t("settings.save")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditUsername(false)} className="h-6 text-xs px-2">
                {t("settings.cancel")}
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewUsername(username);
                setEditUsername(true);
              }}
              className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 shrink-0"
            >
              <PencilSimple className="size-3" weight="bold" />
            </button>
          )}
          <span className="text-[11px] text-neutral-400 mx-1">|</span>
          {editPassword ? (
            <>
              <Button size="sm" onClick={handleChangePassword} disabled={busy} className="h-6 text-xs px-2">
                {t("settings.save")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditPassword(false)} className="h-6 text-xs px-2">
                {t("settings.cancel")}
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditPassword(true)}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
            >
              {t("settings.changePassword")}
            </button>
          )}
        </div>
      </div>
      {editPassword && (
        <div className="pb-1 space-y-1">
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.currentTarget.value)}
            placeholder={t("settings.oldPassword")}
            className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            placeholder={t("settings.newPassword")}
            className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
        </div>
      )}
      {acctMsg && (
        <div className="fixed top-14 right-4 z-50 pointer-events-none">
          <div className="px-5 py-3 rounded-lg shadow-lg text-base font-semibold transition-all duration-300 bg-green-600 text-white">
            {acctMsg}
          </div>
        </div>
      )}
    </div>
  );
}
