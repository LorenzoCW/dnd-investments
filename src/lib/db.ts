// src/lib/db.ts
import { UniqueIdentifier } from "@dnd-kit/core";
import { db } from "./firebase";
import {
  ref,
  onValue,
  set,
  update,
  remove,
  get,
} from "firebase/database";

export type Column = { id: string; title: string };
export type Task = {
  id: string;
  columnId: string;
  content: number;
  dateISO?: string | null;
  isProjection?: boolean;
};

// subscribes to /columns, /columnsOrder and /tasks and calls cb with arrays
export function subscribeAll(
  cb: (params: { columns: Column[]; columnsOrder: string[]; tasks: Task[] }) => void
) {
  const columnsRef = ref(db, "columns");
  const orderRef = ref(db, "columnsOrder");
  const tasksRef = ref(db, "tasks");

  let latestColumns: Record<string, Column> = {};
  let latestOrder: string[] = [];
  let latestTasks: Record<string, Task> = {};

  const runCb = () => {
    const colsArr = Object.values(latestColumns || {});
    // ensure order: put ordered ids first, fallback to any remaining columns
    const ordered = latestOrder
      .map((id) => colsArr.find((c) => c.id === id))
      .filter(Boolean) as Column[];
    const remaining = colsArr.filter((c) => !latestOrder.includes(c.id));
    const finalCols = [...ordered, ...remaining];

    const tasksArr: Task[] = Object.values(latestTasks || {});
    cb({ columns: finalCols, columnsOrder: latestOrder, tasks: tasksArr });
  };

  const unsubCols = onValue(columnsRef, (snap) => {
    const val = snap.val() || {};
    latestColumns = val;
    runCb();
  });

  const unsubOrder = onValue(orderRef, (snap) => {
    const val = snap.val();
    latestOrder = Array.isArray(val) ? val : (val ? Object.values(val) : []);
    runCb();
  });

  const unsubTasks = onValue(tasksRef, (snap) => {
    const val = snap.val() || {};
    latestTasks = val;
    runCb();
  });

  return () => {
    // detach listeners
    unsubCols();
    unsubOrder();
    unsubTasks();
  };
}

// CRUD helpers

export async function addColumn(title: string) {
  const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const updates: Record<string, any> = {};
  updates[`columns/${id}`] = { id, title };

  // append to order
  const orderSnap = await get(ref(db, "columnsOrder"));
  const orderVal = orderSnap.val();
  const arr = Array.isArray(orderVal) ? orderVal : (orderVal ? Object.values(orderVal) : []);
  arr.push(id);
  updates["columnsOrder"] = arr;
  await update(ref(db, "/"), updates);
  return id;
}

export async function removeColumn(id: string) {
  // remove column and all tasks with columnId === id, update order
  const tasksSnap = await get(ref(db, "tasks"));
  const tasksVal: Record<string, Task> = tasksSnap.val() || {};
  const updates: Record<string, any> = {};

  Object.entries(tasksVal).forEach(([taskId, task]) => {
    if (task && task.columnId === id) {
      updates[`tasks/${taskId}`] = null; // delete
    }
  });

  updates[`columns/${id}`] = null;
  // fix order
  const orderSnap = await get(ref(db, "columnsOrder"));
  const orderVal = orderSnap.val();
  const arr = Array.isArray(orderVal) ? orderVal : (orderVal ? Object.values(orderVal) : []);
  const newOrder = arr.filter((x) => x !== id);
  updates["columnsOrder"] = newOrder;
  await update(ref(db, "/"), updates);
}

export async function updateColumnsOrder(newOrder: UniqueIdentifier[]) {
  await set(ref(db, "columnsOrder"), newOrder);
}

export async function addTask(newTask: Omit<Task, "id">) {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await set(ref(db, `tasks/${id}`), { ...newTask, id });
  return id;
}

export async function removeTask(id: string) {
  await remove(ref(db, `tasks/${id}`));
}

export async function editTask(id: string, payload: Partial<Task>) {
  await update(ref(db, `tasks/${id}`), payload);
}

// transfer: decrease source content, maybe delete it, create destination task atomically
export async function transferTask(sourceId: string, amount: number, targetColumnId: string, dateISO?: string | null) {
  const snap = await get(ref(db, `tasks/${sourceId}`));
  const source: Task | null = snap.val() || null;
  if (!source) throw new Error("source not found");

  const remaining = Math.round((source.content - amount) * 100) / 100;
  const newId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const updates: Record<string, any> = {};
  if (remaining <= 0) {
    updates[`tasks/${sourceId}`] = null;
  } else {
    updates[`tasks/${sourceId}/content`] = remaining;
    // keep isProjection and other fields as-is
  }

  updates[`tasks/${newId}`] = {
    id: newId,
    columnId: targetColumnId,
    content: Math.round(amount * 100) / 100,
    dateISO: dateISO ?? new Date().toISOString(),
    isProjection: !!source.isProjection,
  };

  await update(ref(db, "/"), updates);
  return newId;
}