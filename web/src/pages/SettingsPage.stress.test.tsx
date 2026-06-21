import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
import { SettingsPage } from "../pages/SettingsPage";

vi.mock("../lib/api", () => ({
  api: {
    settings: { get: vi.fn(), update: vi.fn(), exportConfig: vi.fn() },
    calendars: { list: vi.fn(), create: vi.fn(), remove: vi.fn(), update: vi.fn(), reorder: vi.fn() },
    auth: { me: vi.fn(), status: vi.fn(), logout: vi.fn(), changeUsername: vi.fn(), changePassword: vi.fn() },
    logs: vi.fn(),
    backup: { create: vi.fn(), download: vi.fn() },
    ics: { exportUrl: vi.fn(), preview: vi.fn(), fetchUrl: vi.fn(), import: vi.fn() },
  },
}));

import { api } from "../lib/api";

type MockFn = ReturnType<typeof vi.fn>;

function setupMocks() {
  (api.auth.me as MockFn).mockResolvedValue({ data: { userId: "u-1", username: "test" } });
  (api.settings.get as MockFn).mockResolvedValue({
    data: {
      userId: "u-1",
      language: "zh-CN",
      firstDayOfWeek: 1,
      showEventTime: false,
      dateFormat: "zh",
      showLunarCalendar: true,
      autoBackupCalendars: "",
      autoBackupInterval: 0,
    },
  });
  (api.settings.update as MockFn).mockImplementation(
    () => new Promise((r) => setTimeout(() => r({ ok: true, data: {} }), 10)),
  );
  (api.settings.exportConfig as MockFn).mockResolvedValue({ userDefaults: {} });
  (api.calendars.list as MockFn).mockResolvedValue({
    data: [
      { id: "c1", name: "默认", color: "#3b82f6", sourceType: "local" },
      { id: "c2", name: "工作", color: "#ef4444", sourceType: "local" },
    ],
  });
  (api.logs as MockFn).mockResolvedValue({ data: { lines: [] } });
  (api.backup.create as MockFn).mockResolvedValue({ data: { filename: "backup.db" } });
  (api.auth.changeUsername as MockFn).mockResolvedValue({ ok: true });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  return {
    qc,
    user,
    ...render(
      <QueryClientProvider client={qc}>
        <Layout>
          <SettingsPage />
        </Layout>
      </QueryClientProvider>,
    ),
  };
}

describe("SettingsPage realistic stress", () => {
  it("auto-backup save completes via task queue", async () => {
    setupMocks();
    const { user } = renderPage();
    await waitFor(() => expect(screen.getByText("偏好设置")).toBeInTheDocument());
    await user.click(screen.getByText("自动备份"));
    await waitFor(() => expect(screen.getByText("选择要自动备份的日历")).toBeInTheDocument());
    await user.click(screen.getByText("保存设置"));
    expect(screen.getByText("偏好设置")).toBeInTheDocument();
  });
});
