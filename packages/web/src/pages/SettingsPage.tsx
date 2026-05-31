import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import type { UserSettings } from "@calendar/shared";

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    api.settings
      .get()
      .then((res) => {
        const data = res as unknown as { ok: boolean; data: UserSettings };
        setSettings(data.data);
      })
      .catch(() => setError("加载设置失败"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaveError("");
    try {
      await api.settings.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("保存失败，请重试");
    }
  };

  if (loading) return <p className="p-6 text-sm text-neutral-400">加载中...</p>;
  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>;
  if (!settings) return null;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">设置</h1>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">时区</span>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
          >
            <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
            <option value="America/New_York">America/New_York (UTC-5)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
            <option value="Europe/London">Europe/London (UTC+0)</option>
            <option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
            <option value="UTC">UTC</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">语言</span>
          <select
            value={settings.language}
            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">默认提醒时间（分钟）</span>
          <input
            type="number"
            min={0}
            value={settings.defaultReminderBefore}
            onChange={(e) =>
              setSettings({ ...settings, defaultReminderBefore: Number(e.target.value) })
            }
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">每周第一天</span>
          <select
            value={settings.firstDayOfWeek}
            onChange={(e) =>
              setSettings({ ...settings, firstDayOfWeek: Number(e.target.value) })
            }
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
          >
            <option value={0}>周日</option>
            <option value={1}>周一</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.showCompletedTodos}
            onChange={(e) =>
              setSettings({ ...settings, showCompletedTodos: e.target.checked })
            }
            className="accent-neutral-900 dark:accent-white"
          />
          <span className="text-sm">显示已完成的待办</span>
        </label>
      </div>

      {saveError && (
        <p className="mt-3 text-sm text-red-500">{saveError}</p>
      )}

      <Button className="mt-6" onClick={handleSave}>
        {saved ? "已保存" : "保存设置"}
      </Button>
    </div>
  );
}
