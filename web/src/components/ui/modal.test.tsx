import { fireEvent, render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

describe("Modal", () => {
  it("renders title and children when open", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>Hidden</p>
      </Modal>,
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT close on Escape when focus is inside INPUT", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <input type="text" data-testid="field" />
      </Modal>,
    );
    const input = screen.getByTestId("field");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close on Escape when focus is inside TEXTAREA", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <textarea data-testid="ta" />
      </Modal>,
    );
    const ta = screen.getByTestId("ta");
    ta.focus();
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape from non-input elements like BUTTON", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <button type="button">Click me</button>
      </Modal>,
    );
    const btn = screen.getByText("Click me");
    btn.focus();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders footer when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test" footer={<button type="button">Save</button>}>
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("closes on close button click", async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    await userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
