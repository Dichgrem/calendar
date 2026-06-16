import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { EventEditor } from "./EventEditor";

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const calendars = [{ id: "c1", name: "Test Calendar", color: "#3b82f6" } as any];

describe("EventEditor create mode", () => {
  it("renders create title", () => {
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText("新建事件")).toBeInTheDocument();
  });

  it("shows date and time inputs for start and end", () => {
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} />
      </Wrapper>,
    );
    const dateInputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateInputs).toHaveLength(2);
  });

  it("shows allDay checkbox", () => {
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByLabelText("全天事件")).toBeInTheDocument();
  });

  it("hides time inputs when allDay is checked", async () => {
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} />
      </Wrapper>,
    );
    await userEvent.click(screen.getByLabelText("全天事件"));
    const timeInputs = screen.queryAllByDisplayValue(/^\d{2}:\d{2}$/);
    expect(timeInputs).toHaveLength(0);
  });

  it("accepts defaultStart prop", () => {
    const defaultStart = new Date("2026-12-25T00:00:00");
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} defaultStart={defaultStart} />
      </Wrapper>,
    );
    const dates = screen.getAllByDisplayValue("2026-12-25");
    expect(dates).toHaveLength(2);
  });

  it("shows save and cancel buttons", () => {
    render(
      <Wrapper>
        <EventEditor mode="create" calendars={calendars} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText("保存")).toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
  });
});

describe("EventEditor edit mode", () => {
  const fakeEvent = {
    id: "evt-1",
    calendarId: "c1",
    title: "Edited Event",
    startAt: "2026-06-15T14:00:00.000Z",
    endAt: "2026-06-15T15:00:00.000Z",
    allDay: false,
    description: "Edit me",
    location: "Room B",
    color: null,
    deleted: false,
    parentId: null,
    originalDate: null,
    rrule: null,
    rawIcs: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastModified: 0,
  } as any;

  it("renders edit title", () => {
    render(
      <Wrapper>
        <EventEditor mode="edit" event={fakeEvent} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText("编辑事件")).toBeInTheDocument();
  });

  it("pre-fills event data", () => {
    render(
      <Wrapper>
        <EventEditor mode="edit" event={fakeEvent} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue("Edited Event")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Room B")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Edit me")).toBeInTheDocument();
  });

  it("shows delete button in edit mode", () => {
    render(
      <Wrapper>
        <EventEditor mode="edit" event={fakeEvent} open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText("删除")).toBeInTheDocument();
  });
});
