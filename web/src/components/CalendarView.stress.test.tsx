import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "../components/CalendarView";
import { Layout } from "../components/Layout";

vi.mock("../lib/api", () => ({
  api: {
    settings: { get: vi.fn(), update: vi.fn() },
    calendars: { list: vi.fn(), update: vi.fn(), remove: vi.fn(), create: vi.fn() },
    events: { list: vi.fn(), all: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), get: vi.fn() },
    auth: { me: vi.fn(), status: vi.fn(), logout: vi.fn() },
    logs: vi.fn(),
    backup: { create: vi.fn(), download: vi.fn() },
    ics: { exportUrl: vi.fn(), preview: vi.fn(), fetchUrl: vi.fn(), import: vi.fn() },
    sync: { pull: vi.fn(), push: vi.fn() },
  },
}));

import { api } from "../lib/api";

type MockFn = ReturnType<typeof vi.fn>;

describe("CalendarView stress", () => {
  it("survives 30 rapid month flips without unmounting", async () => {
    (api.auth.me as MockFn).mockResolvedValue({ data: { userId: "u-1", username: "test" } });
    (api.settings.get as MockFn).mockResolvedValue({
      data: {
        userId: "u-1",
        language: "zh-CN",
        firstDayOfWeek: 1,
        showEventTime: false,
        dateFormat: "zh",
        showLunarCalendar: true,
      },
    });
    (api.calendars.list as MockFn).mockResolvedValue({
      data: [{ id: "c1", name: "默认", color: "#3b82f6", sourceType: "local" }],
    });
    (api.events.list as MockFn).mockResolvedValue({ data: [] });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={qc}>
        <Layout>
          <CalendarView />
        </Layout>
      </QueryClientProvider>,
    );

    // Wait for weekday header grid to appear
    await waitFor(() => {
      const grid = document.querySelector(".grid.grid-cols-7");
      expect(grid).toBeTruthy();
    });

    const prevBtn = screen.getByLabelText("上一月") as HTMLButtonElement;
    const nextBtn = screen.getByLabelText("下一月") as HTMLButtonElement;

    for (let i = 0; i < 30; i++) {
      const btn = i % 2 === 0 ? prevBtn : nextBtn;
      if (btn.isConnected) await user.click(btn);
    }

    // Calendar still rendered
    expect(document.querySelector(".grid.grid-cols-7")).toBeTruthy();
  });

  it("survives rapid flips while events query is pending", async () => {
    let resolveLater: ((v: unknown) => void) | null = null;
    (api.events.list as MockFn).mockImplementation(
      () =>
        new Promise((r) => {
          resolveLater = r;
        }),
    );

    (api.auth.me as MockFn).mockResolvedValue({ data: { userId: "u-1", username: "test" } });
    (api.settings.get as MockFn).mockResolvedValue({
      data: {
        userId: "u-1",
        language: "zh-CN",
        firstDayOfWeek: 1,
        showEventTime: false,
        dateFormat: "zh",
        showLunarCalendar: true,
      },
    });
    (api.calendars.list as MockFn).mockResolvedValue({
      data: [{ id: "c1", name: "默认", color: "#3b82f6", sourceType: "local" }],
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={qc}>
        <Layout>
          <CalendarView />
        </Layout>
      </QueryClientProvider>,
    );

    // Wait for weekday header grid to appear
    await waitFor(() => {
      expect(document.querySelector(".grid.grid-cols-7")).toBeTruthy();
    });

    const prevBtn = screen.getByLabelText("上一月") as HTMLButtonElement;
    const nextBtn = screen.getByLabelText("下一月") as HTMLButtonElement;

    for (let i = 0; i < 15; i++) {
      const btn = i % 2 === 0 ? prevBtn : nextBtn;
      if (btn.isConnected) await user.click(btn);
    }

    if (resolveLater) (resolveLater as (v: unknown) => void)({ data: [] });
    await waitFor(() => {
      expect(document.querySelector(".grid.grid-cols-7")).toBeTruthy();
    });
  });
});
