import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { EventEditor } from "./EventEditor";

vi.mock("../hooks/use-i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, lang: "zh-CN" }),
}));

const qc = new QueryClient();

describe("EventEditor date bounds", () => {
  it("start and end date inputs have min=1970-01-01 and max=2100-12-31", () => {
    const { container } = render(
      <QueryClientProvider client={qc}>
        <EventEditor mode="create" open onClose={() => {}} calendars={[{ id: "a", name: "C", color: "#000" } as any]} />
      </QueryClientProvider>,
    );
    const dates = container.querySelectorAll('input[type="date"]');
    expect(dates.length).toBeGreaterThanOrEqual(2);
    for (const d of dates) {
      expect(d.getAttribute("min")).toBe("1970-01-01");
      expect(d.getAttribute("max")).toBe("2100-12-31");
    }
  });
});
