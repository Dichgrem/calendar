import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
  listSubtasks,
  createSubtask,
  listTodoLists,
  createTodoList,
  updateTodoList,
  deleteTodoList,
} from "../services/todo.service.js";

const todosRouter = new Hono().use(authMiddleware);

const listQuerySchema = z.object({
  list_id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "completed"]).optional(),
  priority: z.enum(["high", "medium", "low", "none"]).optional(),
  due_date: z.string().optional(),
});

todosRouter.get("/calendars/:calendarId/todos", zValidator("query", listQuerySchema), async (c) => {
  const perm = c.get("permission");
  const { calendarId } = c.req.param();
  const list = await listTodos(calendarId, c.req.valid("query"), perm.userId);
  return c.json({ ok: true, data: list });
});

todosRouter.get("/todos/:id", async (c) => {
  const perm = c.get("permission");
  const todo = await getTodo(c.req.param("id"), perm.userId);
  if (!todo) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Todo not found" } }, 404);
  }
  return c.json({ ok: true, data: todo });
});

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  listId: z.string().optional(),
  priority: z.enum(["high", "medium", "low", "none"]).optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  rrule: z.string().optional(),
  parentId: z.string().optional(),
});

todosRouter.post("/calendars/:calendarId/todos", zValidator("json", createSchema), async (c) => {
  const perm = c.get("permission");
  const { calendarId } = c.req.param();
  const todo = await createTodo(calendarId, c.req.valid("json"), perm.userId);
  if (!todo) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: todo }, 201);
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  listId: z.string().nullable().optional(),
  priority: z.enum(["high", "medium", "low", "none"]).optional(),
  status: z.enum(["todo", "in_progress", "completed"]).optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  rrule: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

todosRouter.patch("/todos/:id", zValidator("json", updateSchema), async (c) => {
  const perm = c.get("permission");
  const todo = await updateTodo(c.req.param("id"), c.req.valid("json"), perm.userId);
  if (!todo) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: todo });
});

todosRouter.delete("/todos/:id", async (c) => {
  const perm = c.get("permission");
  const ok = await deleteTodo(c.req.param("id"), perm.userId);
  if (!ok) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: null });
});

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number(),
    }),
  ),
});

todosRouter.patch("/todos/reorder", zValidator("json", reorderSchema), async (c) => {
  const perm = c.get("permission");
  const ok = await reorderTodos(c.req.valid("json").items, perm.userId);
  if (!ok) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: null });
});

todosRouter.get("/todos/:id/subtasks", async (c) => {
  const perm = c.get("permission");
  const list = await listSubtasks(c.req.param("id"), perm.userId);
  return c.json({ ok: true, data: list });
});

const subtaskSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z.enum(["high", "medium", "low", "none"]).optional(),
  dueDate: z.string().optional(),
});

todosRouter.post("/todos/:id/subtasks", zValidator("json", subtaskSchema), async (c) => {
  const perm = c.get("permission");
  const sub = await createSubtask(c.req.param("id"), c.req.valid("json"), perm.userId);
  if (!sub) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: sub }, 201);
});

todosRouter.get("/todo-lists", async (c) => {
  const perm = c.get("permission");
  const list = await listTodoLists(perm.userId);
  return c.json({ ok: true, data: list });
});

const createListSchema = z.object({
  name: z.string().min(1).max(200),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

todosRouter.post("/todo-lists", zValidator("json", createListSchema), async (c) => {
  const perm = c.get("permission");
  const list = await createTodoList(c.req.valid("json"), perm.userId);
  return c.json({ ok: true, data: list }, 201);
});

const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

todosRouter.patch("/todo-lists/:id", zValidator("json", updateListSchema), async (c) => {
  const perm = c.get("permission");
  const list = await updateTodoList(c.req.param("id"), c.req.valid("json"), perm.userId);
  if (!list) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "List not found" } }, 404);
  }
  return c.json({ ok: true, data: list });
});

todosRouter.delete("/todo-lists/:id", async (c) => {
  const perm = c.get("permission");
  const ok = await deleteTodoList(c.req.param("id"), perm.userId);
  if (!ok) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "List not found" } }, 404);
  }
  return c.json({ ok: true, data: null });
});

export { todosRouter };
