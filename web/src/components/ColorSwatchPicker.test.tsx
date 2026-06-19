import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

function Wrapper({ children }: { children: preact.ComponentChildren }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ColorSwatchPicker", () => {
  it("renders all predefined colors as buttons", () => {
    render(
      <Wrapper>
        <ColorSwatchPicker value="#3b82f6" onChange={() => {}} />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(12);
  });

  it("calls onChange with selected color", async () => {
    const onChange = vi.fn();
    render(
      <Wrapper>
        <ColorSwatchPicker value="#3b82f6" onChange={onChange} />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[0]);
    expect(onChange).toHaveBeenCalled();
  });

  it("shows custom color picker", () => {
    render(
      <Wrapper>
        <ColorSwatchPicker value="#3b82f6" onChange={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByTitle("自定义颜色")).toBeInTheDocument();
  });
});
