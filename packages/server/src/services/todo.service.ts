import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  todos,
  todoLists,
  calendarMembers,
  events,
  syncSequence,
} from "../db/schema.js";
import type { ID, Todo, TodoList, TodoStatus, Priority } from "@calendar/shared";

async function logSync(tableName: string, recordId: ID, op: string) {
  await db.insert(syncSequence).values({
    tableName,
    recordId,
    op,
    syncedAt: new Date().toISOString(),
  });
}

function ensureMemberJoin(calendarId: ID, userId: ID) {
  return db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(
      and(
        eq(calendarMembers.calendarId, calendarId),
        eq(calendarMembers.userId, userId),
      ),
    )
    .limit(1);
}

export async function listTodos(
  calendarId: ID,
  filters: {
    listId?: ID;
    status?: TodoStatus;
    priority?: Priority;
    dueDate?: string;
  },
  userId: ID,
): Promise<Todo[]> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return [];

  const conditions = [eq(todos.calendarId, calendarId)];

  if (filters.listId) conditions.push(eq(todos.listId, filters.listId));
  if (filters.status) conditions.push(eq(todos.status, filters.status));
  if (filters.priority) conditions.push(eq(todos.priority, filters.priority));
  if (filters.dueDate) conditions.push(eq(todos.dueDate, filters.dueDate));

  const rows = await db
    .select()
    .from(todos)
    .where(and(...conditions))
    .orderBy(asc(todos.sortOrder));

  return rows as Todo[];
}

export async function getTodo(
  todoId: ID,
  userId: ID,
): Promise<Todo | null> {
  const rows = await db
    .select()
    .from(todos)
    .innerJoin(calendarMembers, eq(todos.calendarId, calendarMembers.calendarId))
    .where(and(eq(todos.id, todoId), eq(calendarMembers.userId, userId)));

  if (!rows.length) return null;
  return rows[0].todos as Todo;
}

export async function createTodo(
  calendarId: ID,
  data: {
    title: string;
    description?: string;
    listId?: ID;
    priority?: Priority;
    dueDate?: string;
    dueTime?: string;
    rrule?: string;
    parentId?: ID;
  },
  userId: ID,
): Promise<Todo | null> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const lmod = Date.now();

  const [maxOrder] = await db
    .select({ max: sql<number>`COALESCE(MAX(${todos.sortOrder}), 0)` })
    .from(todos)
    .where(eq(todos.calendarId, calendarId));

  await db.insert(todos).values({
    id,
    calendarId,
    title: data.title,
    description: data.description ?? null,
    listId: data.listId ?? null,
    priority: data.priority ?? "none",
    status: "todo",
    dueDate: data.dueDate ?? null,
    dueTime: data.dueTime ?? null,
    rrule: data.rrule ?? null,
    parentId: data.parentId ?? null,
    sortOrder: (maxOrder?.max ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  });

  await logSync("todos", id, "created");

  return await getTodo(id, userId);
}

export async function updateTodo(
  todoId: ID,
  data: {
    title?: string;
    description?: string;
    listId?: ID | null;
    priority?: Priority;
    status?: TodoStatus;
    dueDate?: string | null;
    dueTime?: string | null;
    rrule?: string | null;
    parentId?: ID | null;
  },
  userId: ID,
): Promise<Todo | null> {
  const current = await getTodo(todoId, userId);
  if (!current) return null;

  const lmod = Date.now();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    lastModified: lmod,
  };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.listId !== undefined) updateData.listId = data.listId;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "completed") {
      updateData.completedAt = new Date().toISOString();
      await maybeLogCompletedTodo(current, userId, lmod);
    } else {
      updateData.completedAt = null;
    }
  }
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  if (data.dueTime !== undefined) updateData.dueTime = data.dueTime;
  if (data.rrule !== undefined) updateData.rrule = data.rrule;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;

  await db.update(todos).set(updateData).where(eq(todos.id, todoId));
  await logSync("todos", todoId, "updated");

  return await getTodo(todoId, userId);
}

async function maybeLogCompletedTodo(
  current: Todo,
  userId: ID,
  lmod: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  await db.insert(events).values({
    id: crypto.randomUUID(),
    calendarId: current.calendarId,
    title: `✓ ${current.title}`,
    description: current.description,
    startAt: today,
    endAt: today,
    allDay: true,
    parentId: current.id,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  });
}

export async function deleteTodo(
  todoId: ID,
  userId: ID,
): Promise<boolean> {
  const current = await getTodo(todoId, userId);
  if (!current) return false;

  await db.delete(todos).where(eq(todos.id, todoId));
  await logSync("todos", todoId, "deleted");

  return true;
}

export async function reorderTodos(
  items: { id: ID; sortOrder: number }[],
  userId: ID,
): Promise<boolean> {
  if (!items.length) return true;

  const ids = items.map((i) => i.id);
  const existing = await db
    .select({ id: todos.id, calendarId: todos.calendarId })
    .from(todos)
    .where(inArray(todos.id, ids));

  const validCalendarIds = new Set(existing.map((t) => t.calendarId));
  const memberChecks = await Promise.all(
    [...validCalendarIds].map((cid) => ensureMemberJoin(cid, userId)),
  );
  if (memberChecks.some((mc) => !mc.length)) return false;

  for (const item of items) {
    await db
      .update(todos)
      .set({
        sortOrder: item.sortOrder,
        updatedAt: new Date().toISOString(),
        lastModified: Date.now(),
      })
      .where(eq(todos.id, item.id));
  }

  return true;
}

export async function listSubtasks(
  parentId: ID,
  userId: ID,
): Promise<Todo[]> {
  const parent = await getTodo(parentId, userId);
  if (!parent) return [];

  const rows = await db
    .select()
    .from(todos)
    .where(eq(todos.parentId, parentId))
    .orderBy(asc(todos.sortOrder));

  return rows as Todo[];
}

export async function createSubtask(
  parentId: ID,
  data: {
    title: string;
    priority?: Priority;
    dueDate?: string;
  },
  userId: ID,
): Promise<Todo | null> {
  const parent = await getTodo(parentId, userId);
  if (!parent) return null;

  return await createTodo(
    parent.calendarId,
    { ...data, parentId, listId: parent.listId },
    userId,
  );
}

export async function listTodoLists(userId: ID): Promise<TodoList[]> {
  const rows = await db
    .select()
    .from(todoLists)
    .where(eq(todoLists.userId, userId))
    .orderBy(asc(todoLists.sortOrder));

  return rows as TodoList[];
}

export async function createTodoList(
  data: { name: string; color?: string },
  userId: ID,
): Promise<TodoList> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const lmod = Date.now();

  const [maxOrder] = await db
    .select({ max: sql<number>`COALESCE(MAX(${todoLists.sortOrder}), 0)` })
    .from(todoLists)
    .where(eq(todoLists.userId, userId));

  await db.insert(todoLists).values({
    id,
    name: data.name,
    color: data.color ?? null,
    userId,
    sortOrder: (maxOrder?.max ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  });

  return {
    id,
    name: data.name,
    color: data.color ?? null,
    userId,
    sortOrder: (maxOrder?.max ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  } as TodoList;
}

export async function updateTodoList(
  listId: ID,
  data: { name?: string; color?: string },
  userId: ID,
): Promise<TodoList | null> {
  const [existing] = await db
    .select()
    .from(todoLists)
    .where(and(eq(todoLists.id, listId), eq(todoLists.userId, userId)));

  if (!existing) return null;

  const lmod = Date.now();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    lastModified: lmod,
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.color !== undefined) updateData.color = data.color;

  await db.update(todoLists).set(updateData).where(eq(todoLists.id, listId));

  return {
    ...existing,
    ...updateData,
  } as TodoList;
}

export async function deleteTodoList(
  listId: ID,
  userId: ID,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(todoLists)
    .where(and(eq(todoLists.id, listId), eq(todoLists.userId, userId)));

  if (!existing) return false;

  await db
    .update(todos)
    .set({ listId: null })
    .where(eq(todos.listId, listId));

  await db.delete(todoLists).where(eq(todoLists.id, listId));

  return true;
}
