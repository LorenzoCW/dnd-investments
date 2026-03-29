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

export type Column = {
  id: string;
  title: string;
  meta?: number | null | undefined;
  placeId?: string | null | undefined;
};

export type Task = {
  id: string;
  columnId: string;
  content: number;
  dateISO?: string | null;
  isProjection?: boolean;
};

export type Place = {
  id: string;
  name: string;
  color: string;
  expectedValue?: number | null;
};

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function toArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === "object") return Object.values(val) as T[];
  return [];
}

function normalizeOrder(val: any): string[] {
  return toArray<any>(val)
    .map((x) => String(x))
    .filter(Boolean);
}

function normalizePlace(raw: any): Place {
  return {
    id: String(raw?.id ?? genId("place")),
    name: String(raw?.name ?? ""),
    color: String(raw?.color ?? "#06b6d4"),
    expectedValue:
      raw?.expectedValue === undefined ||
        raw?.expectedValue === null ||
        raw?.expectedValue === ""
        ? null
        : Number(raw.expectedValue) || null,
  };
}

function normalizeColumn(raw: any): Column {
  return {
    id: String(raw?.id ?? genId("col")),
    title: String(raw?.title ?? ""),
    meta:
      raw?.meta === undefined || raw?.meta === null || raw?.meta === ""
        ? undefined
        : Number(raw.meta) || 0,
    placeId:
      raw?.placeId === undefined || raw?.placeId === null || raw?.placeId === ""
        ? undefined
        : String(raw.placeId),
  };
}

function normalizeTask(raw: any): Task {
  return {
    id: String(raw?.id ?? genId("task")),
    columnId: String(raw?.columnId ?? ""),
    content: typeof raw?.content === "number" ? raw.content : Number(raw?.content) || 0,
    dateISO: raw?.dateISO ?? undefined,
    isProjection: !!raw?.isProjection,
  };
}

// subscribes to /columns, /columnsOrder, /tasks, /places and /placesOrder
export function subscribeAll(
  cb: (params: {
    columns: Column[];
    columnsOrder: string[];
    tasks: Task[];
    places: Place[];
    placesOrder: string[];
  }) => void
) {
  const columnsRef = ref(db, "columns");
  const columnsOrderRef = ref(db, "columnsOrder");
  const tasksRef = ref(db, "tasks");
  const placesRef = ref(db, "places");
  const placesOrderRef = ref(db, "placesOrder");

  let latestColumns: Record<string, Column> = {};
  let latestColumnsOrder: string[] = [];
  let latestTasks: Record<string, Task> = {};
  let latestPlaces: Record<string, Place> = {};
  let latestPlacesOrder: string[] = [];

  const runCb = () => {
    const colsArr = Object.values(latestColumns || {}).map(normalizeColumn);
    const orderedCols = latestColumnsOrder
      .map((id) => colsArr.find((c) => c.id === id))
      .filter(Boolean) as Column[];
    const remainingCols = colsArr.filter((c) => !latestColumnsOrder.includes(c.id));
    const finalCols = [...orderedCols, ...remainingCols];

    const tasksArr: Task[] = Object.values(latestTasks || {}).map(normalizeTask);

    const placesArr = Object.values(latestPlaces || {}).map(normalizePlace);
    const orderedPlaces = latestPlacesOrder
      .map((id) => placesArr.find((p) => p.id === id))
      .filter(Boolean) as Place[];
    const remainingPlaces = placesArr.filter((p) => !latestPlacesOrder.includes(p.id));
    const finalPlaces = [...orderedPlaces, ...remainingPlaces];

    cb({
      columns: finalCols,
      columnsOrder: latestColumnsOrder,
      tasks: tasksArr,
      places: finalPlaces,
      placesOrder: latestPlacesOrder,
    });
  };

  const unsubCols = onValue(columnsRef, (snap) => {
    latestColumns = snap.val() || {};
    runCb();
  });

  const unsubColumnsOrder = onValue(columnsOrderRef, (snap) => {
    latestColumnsOrder = normalizeOrder(snap.val());
    runCb();
  });

  const unsubTasks = onValue(tasksRef, (snap) => {
    latestTasks = snap.val() || {};
    runCb();
  });

  const unsubPlaces = onValue(placesRef, (snap) => {
    latestPlaces = snap.val() || {};
    runCb();
  });

  const unsubPlacesOrder = onValue(placesOrderRef, (snap) => {
    latestPlacesOrder = normalizeOrder(snap.val());
    runCb();
  });

  return () => {
    unsubCols();
    unsubColumnsOrder();
    unsubTasks();
    unsubPlaces();
    unsubPlacesOrder();
  };
}

// CRUD helpers

export async function addColumn(title: string) {
  const id = genId("col");
  const updates: Record<string, any> = {};
  updates[`columns/${id}`] = { id, title };

  const orderSnap = await get(ref(db, "columnsOrder"));
  const orderVal = orderSnap.val();
  const arr = normalizeOrder(orderVal);
  arr.push(id);
  updates["columnsOrder"] = arr;

  await update(ref(db, "/"), updates);
  return id;
}

export async function removeColumn(id: string) {
  const tasksSnap = await get(ref(db, "tasks"));
  const tasksVal: Record<string, Task> = tasksSnap.val() || {};
  const updates: Record<string, any> = {};

  Object.entries(tasksVal).forEach(([taskId, task]) => {
    if (task && task.columnId === id) {
      updates[`tasks/${taskId}`] = null;
    }
  });

  updates[`columns/${id}`] = null;

  const orderSnap = await get(ref(db, "columnsOrder"));
  const orderVal = orderSnap.val();
  const arr = normalizeOrder(orderVal);
  updates["columnsOrder"] = arr.filter((x) => x !== id);

  await update(ref(db, "/"), updates);
}

export async function updateColumnsOrder(newOrder: UniqueIdentifier[]) {
  await set(ref(db, "columnsOrder"), newOrder);
}

export async function addTask(newTask: Omit<Task, "id">) {
  const id = genId("task");
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
export async function transferTask(
  sourceId: string,
  amount: number,
  targetColumnId: string,
  dateISO?: string | null
) {
  const snap = await get(ref(db, `tasks/${sourceId}`));
  const source: Task | null = snap.val() || null;
  if (!source) throw new Error("source not found");

  const remaining = Math.round((source.content - amount) * 100) / 100;
  const newId = genId("task");

  const updates: Record<string, any> = {};
  if (remaining <= 0) {
    updates[`tasks/${sourceId}`] = null;
  } else {
    updates[`tasks/${sourceId}/content`] = remaining;
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

export async function editColumn(
  id: string,
  payload: Partial<{ title: string; meta: number | null | undefined; placeId: string | null }>
) {
  await update(ref(db, `columns/${id}`), payload as any);
}

// Places
export async function addPlace(place: Omit<Place, "id"> & { id?: string }) {
  const id = place.id ?? genId("place");
  await set(ref(db, `places/${id}`), {
    id,
    name: place.name,
    color: place.color,
    expectedValue:
      place.expectedValue === undefined ? null : place.expectedValue,
  });

  const orderSnap = await get(ref(db, "placesOrder"));
  const orderVal = orderSnap.val();
  const arr = normalizeOrder(orderVal);
  if (!arr.includes(id)) {
    arr.push(id);
    await set(ref(db, "placesOrder"), arr);
  }

  return id;
}

export async function editPlace(
  id: string,
  payload: Partial<{ name: string; color: string; expectedValue: number | null }>
) {
  await update(ref(db, `places/${id}`), payload as any);
}

export async function removePlace(id: string) {
  const updates: Record<string, any> = {};
  updates[`places/${id}`] = null;

  const orderSnap = await get(ref(db, "placesOrder"));
  const orderVal = orderSnap.val();
  const arr = normalizeOrder(orderVal);
  updates["placesOrder"] = arr.filter((x) => x !== id);

  await update(ref(db, "/"), updates);
}

export async function reorderPlaces(newOrder: UniqueIdentifier[]) {
  await set(ref(db, "placesOrder"), newOrder);
}

// Optional helper for replacing all places at once
export async function upsertPlaces(places: Place[]) {
  const updates: Record<string, any> = {};
  const order = places.map((p) => p.id);

  places.forEach((place) => {
    updates[`places/${place.id}`] = {
      id: place.id,
      name: place.name,
      color: place.color,
      expectedValue:
        place.expectedValue === undefined ? null : place.expectedValue,
    };
  });

  await update(ref(db, "/"), {
    ...updates,
    placesOrder: order,
  });
}