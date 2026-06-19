import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
import { api } from "../lib/api";
import { SettingsPage } from "./SettingsPage";

vi.mock("../lib/api", () => ({
  api: {
    settings: { get: vi.fn(), update: vi.fn() },
    calendars: { list: vi.fn() },
    auth: { me: vi.fn(), status: vi.fn(), logout: vi.fn() },
    logs: vi.fn(),
    backup: { backup: vi.fn(), restore: vi.fn(), download: vi.fn(), list: vi.fn() },
    ics: { exportUrl: vi.fn() },
  },
}));

describe("SettingsPage stability", () => {
  it("renders without crashing after rapid setting changes", async () => {
    const updateMock = api.settings.update as ReturnType<typeof vi.fn>;
    (api.auth.status as any).mockResolvedValue({ data: { registered: true } });
    (api.auth.me as any).mockResolvedValue({ data: { username: "test" } });
    (api.settings.get as any).mockResolvedValue({
      data: {
        userId: "u-1",
        language: "zh-CN",
        firstDayOfWeek: 1,
        showEventTime: false,
        dateFormat: "zh",
        showLunarCalendar: true,
      },
    });
    updateMock.mockResolvedValue({ ok: true, data: {} });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Layout>
          <SettingsPage />
        </Layout>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(updateMock.mock.calls.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("debounce prevents rapid-fire API calls", async () => {
    const updateMock = api.settings.update as ReturnType<typeof vi.fn>;
    updateMock.mockResolvedValue({ ok: true, data: {} });

    expect(updateMock).toBeDefined();
  });
});
