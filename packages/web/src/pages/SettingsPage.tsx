import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import type { UserSettings } from "@calendar/shared";
import { useNavigate } from "react-router";

export function SettingsPage() {
  const navigate = useNavigate();
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
    setSaveError("");
    try {
      await api.settings.update(s);
      setSettings(s as UserSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("保存失败，请重试");
    }
  };

  if (loading) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-neutral-400">加载中...</p></div>;
  if (error) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-red-500">{error}</p></div>;

  const s = settings ?? {
    userId: "",
    timezone: "Asia/Shanghai",
    language: "zh-CN",
    defaultReminderBefore: 15,
    firstDayOfWeek: 0,
    showCompletedTodos: false,
  } as UserSettings;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="max-w-lg mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">设置</h1>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">时区</span>
              <select value={s.timezone} onChange={(e) => setSettings({ ...s, timezone: e.target.value })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
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
              <select value={s.language} onChange={(e) => setSettings({ ...s, language: e.target.value })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">默认提醒时间（分钟）</span>
              <input type="number" min={0} value={s.defaultReminderBefore}
                onChange={(e) => setSettings({ ...s, defaultReminderBefore: Number(e.target.value) || 0 })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">每周第一天</span>
              <select value={s.firstDayOfWeek}
                onChange={(e) => setSettings({ ...s, firstDayOfWeek: Number(e.target.value) })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value={0}>周日</option>
                <option value={1}>周一</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.showCompletedTodos}
                onChange={(e) => setSettings({ ...s, showCompletedTodos: e.target.checked })}
                className="accent-neutral-900 dark:accent-white" />
              <span className="text-sm">显示已完成的待办</span>
            </label>
          </div>
          {saveError && <p className="mt-3 text-sm text-red-500">{saveError}</p>}
          <Button className="mt-6" onClick={handleSave}>{saved ? "已保存" : "保存设置"}</Button>

          <hr className="mt-8 border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-semibold mt-6 mb-3">数据管理</h2>
          <Button variant="outline" size="sm" onClick={() => navigate("/import")}>
            导入 ICS 日历
          </Button>
        </div>
      </div>
    </div>
  );
}
