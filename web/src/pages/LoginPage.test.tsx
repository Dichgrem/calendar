import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { LoginPage } from "../pages/LoginPage";

vi.mock("../lib/api", () => ({
  api: {
    auth: {
      status: vi.fn().mockResolvedValue({ ok: true, data: { registered: true } }),
      login: vi.fn().mockResolvedValue({ ok: true, data: { userId: "u1", sessionId: "s1" } }),
      register: vi.fn().mockResolvedValue({ ok: true, data: { userId: "u1", sessionId: "s1" } }),
    },
  },
}));

import { api } from "../lib/api";

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  it("shows username and password fields", async () => {
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByText("用户名")).toBeInTheDocument());
    expect(screen.getByText("密码")).toBeInTheDocument();
  });

  it("shows login title when user exists", async () => {
    (api.auth.status as any).mockResolvedValue({ ok: true, data: { registered: true } });
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument());
  });

  it("shows create account title for first user", async () => {
    (api.auth.status as any).mockResolvedValue({ ok: true, data: { registered: false } });
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "创建账户" })).toBeInTheDocument());
  });

  it("shows hint text for first-time users", async () => {
    (api.auth.status as any).mockResolvedValue({ ok: true, data: { registered: false } });
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByText("首次使用，请设置用户名和密码。")).toBeInTheDocument());
  });

  it("shows loading state during auth check", () => {
    (api.auth.status as any).mockReturnValue(new Promise(() => {}));
    render(<Wrapper><LoginPage /></Wrapper>);
    expect(screen.getByText("加载...")).toBeInTheDocument();
  });

  it("submits login form", async () => {
    (api.auth.status as any).mockResolvedValue({ ok: true, data: { registered: true } });
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument());
    await userEvent.type(screen.getByText("用户名").nextElementSibling as HTMLElement, "admin");
    await userEvent.type(screen.getByText("密码").nextElementSibling as HTMLElement, "pass");
    await userEvent.click(screen.getAllByText("登录").pop()!);
    await waitFor(() => expect(api.auth.login).toHaveBeenCalledWith({ username: "admin", password: "pass" }));
  });

  it("submits registration form", async () => {
    (api.auth.status as any).mockResolvedValue({ ok: true, data: { registered: false } });
    render(<Wrapper><LoginPage /></Wrapper>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "创建账户" })).toBeInTheDocument());
    await userEvent.type(screen.getByText("用户名").nextElementSibling as HTMLElement, "newuser");
    await userEvent.type(screen.getByText("密码").nextElementSibling as HTMLElement, "newpass");
    await userEvent.click(screen.getByText("创建"));
    await waitFor(() => expect(api.auth.register).toHaveBeenCalledWith({ username: "newuser", password: "newpass" }));
  });
});
