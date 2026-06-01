import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { setCookie, deleteCookie } from "hono/cookie";
import { register, login, validateSession, logout, changePassword, hasUsers } from "./auth.service.js";
import { authMiddleware } from "./middleware.js";

export const authRouter = new Hono();

const SESSION_COOKIE = "session_token";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};

authRouter.get("/auth/status", async (c) => {
  const exists = await hasUsers();
  return c.json({ ok: true, data: { registered: exists } });
});

const registerSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(4).max(200),
});

authRouter.post("/auth/register", zValidator("json", registerSchema), async (c) => {
  const exists = await hasUsers();
  if (exists) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "User already exists" } }, 403);
  }

  const { username, password } = c.req.valid("json");
  const result = await register(username, password);
  if (!result) {
    return c.json({ ok: false, error: { code: "INTERNAL", message: "Registration failed" } }, 500);
  }

  const loginResult = await login(username, password);
  if (loginResult) {
    setCookie(c, SESSION_COOKIE, loginResult.sessionId, COOKIE_OPTS);
  }

  return c.json({ ok: true, data: { userId: result.userId } }, 201);
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/auth/login", zValidator("json", loginSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const result = await login(username, password);
  if (!result) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } }, 401);
  }

  setCookie(c, SESSION_COOKIE, result.sessionId, COOKIE_OPTS);
  return c.json({ ok: true, data: { userId: result.userId } });
});

authRouter.post("/auth/logout", async (c) => {
  const sessionId = c.req.header("Authorization")?.replace("Bearer ", "") ?? undefined;
  if (sessionId) {
    await logout(sessionId);
  }
  deleteCookie(c, SESSION_COOKIE);
  return c.json({ ok: true, data: null });
});

authRouter.get("/auth/me", authMiddleware, async (c) => {
  const perm = c.get("permission");
  return c.json({ ok: true, data: { userId: perm.userId } });
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(4).max(200),
});

authRouter.post("/auth/change-password", authMiddleware, zValidator("json", changePasswordSchema), async (c) => {
  const perm = c.get("permission");
  const { oldPassword, newPassword } = c.req.valid("json");
  const ok = await changePassword(perm.userId, oldPassword, newPassword);
  if (!ok) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid old password" } }, 401);
  }
  return c.json({ ok: true, data: null });
});
