// File: KanbanBoard.tsx

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";

import { BoardColumn, BoardContainer, type Column } from "./BoardColumn";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  useSensor,
  useSensors,
  KeyboardSensor,
  Announcements,
  UniqueIdentifier,
  TouchSensor,
  MouseSensor,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { type Task, TaskCard } from "./TaskCard";
import { hasDraggableData } from "./utils";
import { coordinateGetter } from "./multipleContainersKeyboardPreset";

import * as db from "../lib/db";

export type ColumnId = Column["id"] | string;

type Place = {
  id: string;
  name: string;
  color: string;
  expectedValue?: number | null;
};

const DEFAULT_COLUMNS: Column[] = [
  { id: "col-1", title: "A Fazer" },
  { id: "col-2", title: "Fazendo" },
  { id: "col-3", title: "Feito" },
];

function parseCurrencyInput(input: string): number {
  const s = String(input).trim();
  if (!s) throw new Error("Entrada vazia");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized = s;

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      normalized = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = s.replace(/,/g, ".");
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Formato numérico inválido");
  }

  const parts = normalized.split(".");
  if (parts[1] && parts[1].length > 2) {
    throw new Error("Apenas até 2 casas decimais");
  }

  const finalStr =
    parts.length === 1
      ? `${parts[0]}.00`
      : parts[1].length === 1
        ? `${parts[0]}.${parts[1]}0`
        : normalized;

  const n = Math.round(Number(finalStr) * 100) / 100;
  if (Number.isNaN(n)) throw new Error("Número inválido");
  return n;
}

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);

  const PLACES_KEY = "kanban:places";
  const SELECTED_PLACES_KEY = "kanban:selected-places";

  const pickedUpTaskColumn = useRef<ColumnId | null>(null);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  // local in-memory helpers for test mode
  function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  function enterTestMode() {
    console.warn("Entering test mode: Firestore inaccessible. Data will not be saved.");
    setTestMode(true);
    // initialize sensible defaults so the app remains usable
    setColumns(DEFAULT_COLUMNS);
    setTasks([]);
    // Note: we intentionally do not persist anything to any backend
  }

  // local operations mirror the db.* API used in this component
  function localAddColumn(title: string) {
    const newCol: Column = { id: uid("col"), title };
    setColumns((c) => [...c, newCol]);
  }

  function localRemoveColumn(id: string) {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    setTasks((ts) => ts.filter((t) => t.columnId !== id));
  }

  function localAddTask(payload: { columnId: string; content: number; dateISO: string; isProjection?: boolean }) {
    const newTask: Task = {
      id: uid("task"),
      columnId: payload.columnId,
      content: round2(payload.content),
      dateISO: payload.dateISO,
      isProjection: !!payload.isProjection,
    };
    setTasks((ts) => [...ts, newTask]);
  }

  function localRemoveTask(taskId: string) {
    setTasks((ts) => ts.filter((t) => t.id !== taskId));
  }

  function localTransferTask(taskId: string, amount: number, targetColumnId: string, dateISO?: string | null) {
    setTasks((ts) => {
      const tasksCopy = ts.slice();
      const idx = tasksCopy.findIndex((t) => t.id === taskId);
      const nowISO = dateISO ?? new Date().toISOString();
      if (idx === -1) {
        // just create a new task in target
        tasksCopy.push({ id: uid("task"), columnId: targetColumnId, content: round2(amount), dateISO: nowISO, isProjection: false });
        return tasksCopy;
      }
      const original = { ...tasksCopy[idx] };
      // subtract amount from original, remove if <= 0
      const remaining = round2(Number(original.content) - amount);
      if (remaining > 0) {
        tasksCopy[idx] = { ...original, content: remaining };
      } else {
        tasksCopy.splice(idx, 1);
      }
      // create new task in target
      tasksCopy.push({ id: uid("task"), columnId: targetColumnId, content: round2(amount), dateISO: nowISO, isProjection: false });
      return tasksCopy;
    });
  }

  function localEditTask(taskId: string, patch: Partial<{ content: number; dateISO: string | null; columnId: string; isProjection: boolean }>) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...(patch.content !== undefined ? { content: round2(patch.content) } : {}), ...(patch.dateISO !== undefined ? { dateISO: patch.dateISO ?? undefined } : {}), ...(patch.columnId ? { columnId: patch.columnId } : {}), ...(patch.isProjection !== undefined ? { isProjection: !!patch.isProjection } : {}) } : t)));
  }

  function localUpdateColumnsOrder(newOrder: UniqueIdentifier[]) {
    setColumns((cols) => {
      const map = new Map(cols.map((c) => [c.id, c]));
      return newOrder.map((id) => map.get(id)).filter(Boolean) as Column[];
    });
  }

  // local update for column.meta
  function localUpdateColumnMeta(id: string | ColumnId, meta: number | null | undefined) {
    setColumns((cols) => cols.map((c) => (c.id === String(id) ? { ...c, meta: meta ?? undefined } : c)));
  }

  // subscribe to DB (or fall back to test-mode)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      // try to subscribe using the external db implementation
      unsub = db.subscribeAll(({ columns: cols, tasks: ts }) => {
        setColumns(cols as any);

        const mappedTasks: Task[] = ts.map((t) => ({
          id: t.id,
          columnId: t.columnId,
          content: typeof t.content === "number" ? t.content : Number(t.content) || 0,
          dateISO: t.dateISO ?? undefined,
          isProjection: !!t.isProjection,
        }));
        setTasks(mappedTasks);
      });

    } catch (err) {
      console.error("Failed to connect to Firestore, entering test mode:", err);
      enterTestMode();
    }

    return () => {
      try {
        if (unsub) unsub();
      } catch (e) {
        console.error("Error clearing subscription:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helpers that try real DB first, but fall back to test-mode on error
  async function addColumn(title: string) {
    if (testMode) {
      localAddColumn(title);
      return;
    }
    try {
      await db.addColumn(title);
    } catch (err) {
      console.error(err);
      // switch to test-mode and apply change locally so the user can keep working
      enterTestMode();
      localAddColumn(title);
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function removeColumn(id: ColumnId) {
    if (testMode) {
      localRemoveColumn(String(id));
      return;
    }
    try {
      await db.removeColumn(String(id));
    } catch (err) {
      console.error(err);
      enterTestMode();
      localRemoveColumn(String(id));
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function addTask(columnId: ColumnId, amount: number, dateISO?: string | null, isProjection: boolean = false) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero");
      return;
    }

    if (testMode) {
      localAddTask({ columnId: columnId as string, content: amount, dateISO: dateISO ?? new Date().toISOString(), isProjection });
      return;
    }

    try {
      await db.addTask({
        columnId: columnId as string,
        content: Math.round(amount * 100) / 100,
        dateISO: dateISO ?? new Date().toISOString(),
        isProjection,
      });
    } catch (err) {
      console.error(err);
      enterTestMode();
      localAddTask({ columnId: columnId as string, content: amount, dateISO: dateISO ?? new Date().toISOString(), isProjection });
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function removeTask(taskId: string) {
    if (testMode) {
      localRemoveTask(taskId);
      return;
    }
    try {
      await db.removeTask(taskId);
    } catch (err) {
      console.error(err);
      enterTestMode();
      localRemoveTask(taskId);
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function transferTask(taskId: UniqueIdentifier, amount: number, targetColumnId: ColumnId, dateISO?: string | null) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero para transferir");
      return;
    }

    if (testMode) {
      localTransferTask(String(taskId), amount, String(targetColumnId), dateISO);
      return;
    }

    try {
      await db.transferTask(String(taskId), amount, String(targetColumnId), dateISO);
    } catch (err: any) {
      console.error(err);
      enterTestMode();
      localTransferTask(String(taskId), amount, String(targetColumnId), dateISO);
      alert(err?.message ?? "Erro ao transferir. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function toggleProjection(taskId: UniqueIdentifier) {
    if (testMode) {
      localEditTask(String(taskId), { isProjection: false });
      return;
    }
    try {
      await db.editTask(String(taskId), { isProjection: false });
    } catch (err) {
      console.error(err);
      enterTestMode();
      localEditTask(String(taskId), { isProjection: false });
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function editTask(taskId: UniqueIdentifier, amount: number, dateISO?: string | null, isProjection: boolean = false) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero");
      return;
    }

    if (testMode) {
      localEditTask(String(taskId), { content: amount, dateISO: dateISO ?? new Date().toISOString(), isProjection });
      return;
    }

    try {
      await db.editTask(String(taskId), {
        content: Math.round(amount * 100) / 100,
        dateISO: dateISO ?? new Date().toISOString(),
        isProjection,
      });
    } catch (err) {
      console.error(err);
      enterTestMode();
      localEditTask(String(taskId), { content: amount, dateISO: dateISO ?? new Date().toISOString(), isProjection });
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function updateColumnsOrder(newOrder: UniqueIdentifier[]) {
    if (testMode) {
      localUpdateColumnsOrder(newOrder);
      return;
    }
    try {
      await db.updateColumnsOrder(newOrder);
    } catch (err) {
      console.error(err);
      enterTestMode();
      localUpdateColumnsOrder(newOrder);
      // keep silent to avoid spamming alerts on reorder, but log
      console.warn("Falha ao atualizar ordem das colunas no Firestore. Modo de teste ativado.");
    }
  }

  // set/clear meta for a column
  async function setColumnMeta(columnId: ColumnId, value: number | null | undefined) {
    if (testMode) {
      localUpdateColumnMeta(columnId, value);
      return;
    }

    try {
      await db.editColumn(String(columnId), { meta: value });
    } catch (err) {
      console.error('failed to update column meta, switching to test mode', err);
      enterTestMode();
      localUpdateColumnMeta(columnId, value);
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  function getDraggingTaskData(taskId: UniqueIdentifier, columnId: ColumnId) {
    const tasksInColumn = tasks.filter((task) => task.columnId === columnId);
    const taskPosition = tasksInColumn.findIndex((task) => task.id === taskId);
    const column = columns.find((col) => col.id === columnId);
    return {
      tasksInColumn,
      taskPosition,
      column,
    };
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      if (!hasDraggableData(active)) return;
      if (active.data.current?.type === "Column") {
        const startColumnIdx = columnsId.findIndex((id) => id === active.id);
        const startColumn = columns[startColumnIdx];
        return `Picked up Column ${startColumn?.title} at position: ${startColumnIdx + 1} of ${columnsId.length}`;
      } else if (active.data.current?.type === "Task") {
        pickedUpTaskColumn.current = active.data.current.task.columnId;
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(active.id, pickedUpTaskColumn.current);
        return `Picked up Task ${active.data.current.task.content} at position: ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.title}`;
      }
    },
    onDragOver({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) return;

      if (active.data.current?.type === "Column" && over.data.current?.type === "Column") {
        const overColumnIdx = columnsId.findIndex((id) => id === over.id);
        return `Column ${active.data.current.column.title} was moved over ${over.data.current.column.title} at position ${overColumnIdx + 1} of ${columnsId.length}`;
      } else if (active.data.current?.type === "Task" && over.data.current?.type === "Task") {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id, over.data.current.task.columnId);
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task ${active.data.current.task.content} was moved over column ${column?.title} in position ${taskPosition + 1} of ${tasksInColumn.length}`;
        }
        return `Task was moved over position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.title}`;
      }
    },
    onDragEnd({ active }) {
      if (!hasDraggableData(active) || !hasDraggableData(active)) {
        pickedUpTaskColumn.current = null;
        return;
      }
      if (active.data.current?.type === "Column") {
        const overColumnPosition = columnsId.findIndex((id) => id === active.id);
        return `Column ${active.data.current.column.title} was dropped into position ${overColumnPosition + 1} of ${columnsId.length}`;
      } else if (active.data.current?.type === "Task") {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(active.id, active.data.current.task.columnId);
        return `Task was dropped into position ${taskPosition + 1} of ${tasksInColumn.length} in column ${column?.title}`;
      }
      pickedUpTaskColumn.current = null;
    },
    onDragCancel({ active }) {
      pickedUpTaskColumn.current = null;
      if (!hasDraggableData(active)) return;
      return `Dragging ${active.data.current?.type} cancelled.`;
    },
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLACES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPlaces(parsed.map(normalizePlace).filter((p) => p.name.trim()));
        }
      }
    } catch (e) {
      console.warn("Failed to load places", e);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_PLACES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSelectedPlaceIds(parsed.map(String));
        }
      }
    } catch (e) {
      console.warn("Failed to load selected places", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_PLACES_KEY, JSON.stringify(selectedPlaceIds));
    } catch (e) {
      console.warn("Failed to save selected places", e);
    }
  }, [selectedPlaceIds]);

  function normalizePlace(raw: any): Place {
    return {
      id: String(raw?.id ?? uid("place")),
      name: String(raw?.name ?? ""),
      color: String(raw?.color ?? "#06b6d4"),
      expectedValue:
        raw?.expectedValue === undefined || raw?.expectedValue === null || raw?.expectedValue === ""
          ? null
          : Number(raw.expectedValue) || null,
    };
  }

  function savePlaces(next: Place[]) {
    try {
      const normalized = next.map(normalizePlace);
      localStorage.setItem(PLACES_KEY, JSON.stringify(normalized));
      setPlaces(normalized);
    } catch (e) {
      console.warn("Failed to save places", e);
    }
  }

  function togglePlaceSelection(id: string) {
    setSelectedPlaceIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function updatePlace(
    id: string,
    patch: Partial<Pick<Place, "name" | "color" | "expectedValue">>
  ) {
    const next = places.map((p) => (p.id === id ? { ...p, ...patch } : p));
    savePlaces(next);
  }

  function removePlace(id: string) {
    const next = places.filter((p) => p.id !== id);
    savePlaces(next);
    setColumns((cols) => cols.map((c) => (String(c.placeId) === id ? { ...c, placeId: undefined } : c)));
    setSelectedPlaceIds((curr) => curr.filter((item) => item !== id));
    if (hoveredPlaceId === id) setHoveredPlaceId(null);
    if (editingPlace?.id === id) setEditingPlace(null);
  }

  // const activePlaceIds = hoveredPlaceId ?? selectedPlaceIds;

  // const moneyFormatter = useMemo(
  //   () =>
  //     new Intl.NumberFormat("pt-BR", {
  //       style: "currency",
  //       currency: "BRL",
  //       minimumFractionDigits: 2,
  //       maximumFractionDigits: 2,
  //     }),
  //   []
  // );

  // function formatMoney(value?: number | null) {
  //   if (value === undefined || value === null || Number.isNaN(value)) return "—";
  //   return moneyFormatter.format(value);
  // }

  const placeTotals = useMemo(() => {
    const totals = new Map<string, number>();
    places.forEach((p) => totals.set(p.id, 0));

    columns.forEach((col) => {
      if (!col.placeId) return;

      const totalForColumn = tasks
        .filter((t) => t.columnId === col.id)
        .reduce((sum, t) => sum + (typeof t.content === "number" ? t.content : Number(t.content) || 0), 0);

      totals.set(col.placeId, (totals.get(col.placeId) ?? 0) + totalForColumn);
    });

    return totals;
  }, [places, columns, tasks]);

  function setColumnPlace(columnId: ColumnId, placeId?: string | null) {
    setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, placeId: placeId ?? undefined } : c)));
    if (!testMode) {
      try {
        // @ts-ignore
        db.editColumn(String(columnId), { placeId: placeId ?? null }).catch(() => { });
      } catch (e) { }
    }
  }

  // useEffect(() => {
  //   function onAddPlace(e: any) {
  //     const name = e?.detail?.name;
  //     const color = e?.detail?.color ?? "#06b6d4";
  //     if (name) addPlace(name, color);
  //   }
  //   function onPlaceHover(e: any) {
  //     const placeId = e?.detail?.placeId ?? null;
  //     setHoveredPlaceId(placeId);
  //   }

  //   window.addEventListener("kanban:add-place", onAddPlace as EventListener);
  //   window.addEventListener("kanban:place-hover", onPlaceHover as EventListener);

  //   function onStorage(ev: StorageEvent) {
  //     if (ev.key === PLACES_KEY) {
  //       try {
  //         if (ev.newValue) setPlaces(JSON.parse(ev.newValue));
  //         else setPlaces([]);
  //       } catch (e) {
  //         console.warn("Failed to parse places from storage event", e);
  //       }
  //     }
  //   }
  //   window.addEventListener("storage", onStorage as any);

  //   return () => {
  //     window.removeEventListener("kanban:add-place", onAddPlace as EventListener);
  //     window.removeEventListener("kanban:place-hover", onPlaceHover as EventListener);
  //     window.removeEventListener("storage", onStorage as any);
  //   };
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [places, testMode]);

  function handleOpenAddModal() {
    setShowAddModal(true);
  }

  function handleCreatePlace(name: string, color: string) {
    const next = [...places, { id: uid("place"), name, color, expectedValue: null }];
    savePlaces(next);
    setShowAddModal(false);
  }

  {
    editingPlace && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setEditingPlace(null)}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-xl p-6 w-11/12 max-w-md border-2 border-slate-800 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-4">Editar lugar</h3>

          <PlaceEditorForm
            place={editingPlace}
            onCancel={() => setEditingPlace(null)}
            onSave={(patch) => {
              updatePlace(editingPlace.id, patch);
              setEditingPlace(null);
            }}
            onDelete={() => {
              removePlace(editingPlace.id);
              setEditingPlace(null);
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <DndContext
      accessibility={{ announcements }}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      {testMode && (
        <div className="mb-2 px-3 py-2 rounded bg-yellow-100 text-yellow-800 border border-yellow-200 text-sm">
          <strong>Modo de teste:</strong> o Firestore não está acessível. Os dados não serão salvos quando fechar a janela.
        </div>
      )}

      {/* top toolbar to add a column */}
      <div className="flex gap-2 items-center justify-center lg:mb-4 relative">
        <AddColumnForm onAdd={addColumn} />
      </div>

      <BoardContainer>
        <SortableContext items={columnsId}>
          {columns.map((col) => {
            const tasksForCol = tasks
              .filter((task) => task.columnId === col.id)
              .slice()
              .sort((a, b) => {
                const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
                const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
                return tb - ta;
              });
            return (
              <BoardColumn
                key={col.id}
                column={col}
                tasks={tasksForCol}
                allColumns={columns}
                allPlaces={places}
                hoveredPlaceId={hoveredPlaceId}
                selectedPlaceIds={selectedPlaceIds}
                onSetPlace={(placeId) => setColumnPlace(col.id, placeId)}
                onAddTask={(amount, dateISO, isProjection) => addTask(col.id, amount, dateISO, isProjection)}
                onRemoveTask={(taskId) => removeTask(taskId)}
                onRemoveColumn={() => removeColumn(col.id)}
                onTransferTask={(taskId, amount, targetColumnId, dateISO) => transferTask(taskId, amount, targetColumnId, dateISO)}
                onToggleProjection={(taskId) => toggleProjection(taskId)}
                onEditTask={(taskId, amount, dateISO, isProjection) => editTask(taskId, amount, dateISO, isProjection)}
                onSetMeta={(value) => setColumnMeta(col.id, value)}
              />
            );
          })}
        </SortableContext>
      </BoardContainer>

      {"document" in window &&
        createPortal(
          <DragOverlay>
            {activeColumn && (
              <BoardColumn
                isOverlay
                column={activeColumn}
                tasks={tasks.filter((task) => task.columnId === activeColumn.id)}
                onAddTask={() => { }}
                onRemoveTask={() => { }}
                onRemoveColumn={() => { }}
              />
            )}
            {activeTask && <TaskCard task={activeTask} isOverlay />}
          </DragOverlay>,
          document.body
        )}

      {/* Add Place modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowAddModal(false)}
        >
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-11/12 max-w-md border-2 border-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Criar lugar</h3>
            <AddPlaceForm onCancel={() => setShowAddModal(false)} onCreate={handleCreatePlace} />
          </div>
        </div>
      )}

      {/* Places bar */}
      <div className="fixed left-0 bottom-5 w-screen flex items-center justify-center">

        <div className="p-1 flex items-center gap-2 overflow-x-auto pr-2">

          <button
            onClick={handleOpenAddModal}
            aria-label="Adicionar lugar"
            className="w-8 h-8 p-6 flex items-center justify-center rounded-full bg-sky-700 text-white hover:opacity-90 transition"
          >
            +
          </button>

          {places.length === 0 ? (
            <div className="text-sm text-gray-500">Nenhum lugar</div>
          ) : (
            places.map((p) => (
              <PlaceChip
                key={p.id}
                place={p}
                total={placeTotals.get(p.id) ?? 0}
                isActive={selectedPlaceIds.includes(p.id) || hoveredPlaceId === p.id}
                onToggle={() => togglePlaceSelection(p.id)}
                onEdit={() => setEditingPlace(p)}
              />
            ))
          )}
        </div>

      </div>
    </DndContext>
  );

  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const data = event.active.data.current;
    if (data?.type === "Column") {
      setActiveColumn(data.column);
      return;
    }

    if (data?.type === "Task") {
      setActiveTask(data.task);
      return;
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (!hasDraggableData(active)) return;

    const activeData = active.data.current;

    if (activeId === overId) return;

    const isActiveAColumn = activeData?.type === "Column";
    if (!isActiveAColumn) return;

    // local reorder for immediate feedback
    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === activeId);
      const overColumnIndex = columns.findIndex((col) => col.id === overId);

      const newCols = arrayMove(columns, activeColumnIndex, overColumnIndex);

      // persist order to DB (or local fallback)
      const newOrder = newCols.map((c) => c.id);
      updateColumnsOrder(newOrder).catch((e) => {
        console.error("fail updateColumnsOrder", e);
      });

      return newCols;
    });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    if (!hasDraggableData(active) || !hasDraggableData(over)) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    const isActiveATask = activeData?.type === "Task";
    const isOverATask = overData?.type === "Task";

    if (!isActiveATask) return;

    async function updateTaskColumn(taskId: UniqueIdentifier, targetColumnId: ColumnId, dateISO?: string | null) {
      const patch: any = { columnId: String(targetColumnId) };
      if (dateISO) patch.dateISO = dateISO;

      if (testMode) {
        localEditTask(String(taskId), { columnId: String(targetColumnId), dateISO: dateISO ?? undefined });
        return;
      }

      try {
        await db.editTask(String(taskId), patch);
      } catch (e) {
        console.error('failed to edit task column, switching to test mode', e);
        enterTestMode();
        localEditTask(String(taskId), { columnId: String(targetColumnId), dateISO: dateISO ?? undefined });
      }
    }

    // dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      // if changing column, update task columnId
      if (overData.task.columnId !== activeData.task.columnId) {
        updateTaskColumn(
          activeId,
          overData.task.columnId,
          activeData.task.dateISO ?? new Date().toISOString()
        );
      }
    }

    const isOverAColumn = overData?.type === "Column";

    // dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      updateTaskColumn(
        activeId,
        overId,
        activeData.task.dateISO ?? new Date().toISOString()
      );
    }
  }
}

function AddColumnForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setValue("");
      }}
      className="flex gap-2 w-1/2 lg:w-full justify-center mx-1"
    >
      <input
        className="border rounded px-0 lg:px-2 py-1"
        value={value}
        maxLength={18}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="text-xs lg:text-base px-3 py-1 rounded bg-sky-700 text-white hover:ring ring-sky-700 transition-all duration-300 cursor-pointer">
        Adicionar investimento
      </button>
    </form>
  );
}

function AddPlaceForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#06b6d4");

  return (
    <div>
      <div className="space-y-3">
        <div>
          <label className="block text-sm">Nome</label>
          <input className="w-full px-3 py-2 rounded border" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm">Cor</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <div className="text-sm text-gray-500">Escolha uma cor para identificar o lugar</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-2 rounded border">Cancelar</button>
          <button
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) return alert("Informe um nome");
              onCreate(trimmed, color);
            }}
            className="px-3 py-2 rounded bg-sky-700 text-white"
          >
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceChip({
  place,
  total,
  isActive,
  onToggle,
  onEdit,
}: {
  place: Place;
  total: number;
  isActive: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const pressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return (
    <button
      type="button"
      className="flex-shrink-0 px-3 py-2 rounded-full bg-slate-200 dark:bg-slate-700 text-sm font-medium cursor-pointer select-none min-w-[170px] text-left"
      title={place.name}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        longPressedRef.current = false;
        clearTimer();
        pressTimerRef.current = window.setTimeout(() => {
          longPressedRef.current = true;
          onEdit();
        }, 2000);
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onClick={() => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onToggle();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        color: isActive ? place.color : undefined,
        border: isActive ? `1px solid ${place.color}` : "1px solid transparent",
        boxShadow: isActive ? `0 0 0 6px ${place.color}22` : undefined,
        background: isActive ? `${place.color}18` : undefined,
      }}
    >
      <div className="flex flex-col leading-tight">
        <span className="truncate max-w-[220px]">{place.name}</span>
        <span className="text-[11px] opacity-80">
          Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
          {place.expectedValue !== undefined && place.expectedValue !== null
            ? ` · Esperado: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(place.expectedValue)}`
            : ""}
        </span>
      </div>
    </button>
  );
}

function PlaceEditorForm({
  place,
  onCancel,
  onSave,
  onDelete,
}: {
  place: Place;
  onCancel: () => void;
  onSave: (patch: Partial<Pick<Place, "name" | "color" | "expectedValue">>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [color, setColor] = useState(place.color);
  const [expectedText, setExpectedText] = useState(
    place.expectedValue !== undefined && place.expectedValue !== null ? place.expectedValue.toFixed(2) : ""
  );

  useEffect(() => {
    setName(place.name);
    setColor(place.color);
    setExpectedText(
      place.expectedValue !== undefined && place.expectedValue !== null ? place.expectedValue.toFixed(2) : ""
    );
  }, [place]);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Editar lugar</h3>

      <div>
        <label className="block text-sm mb-1">Nome</label>
        <input
          className="w-full px-3 py-2 rounded border"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Cor</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm mb-1">Valor esperado</label>
        <input
          className="w-full px-3 py-2 rounded border"
          value={expectedText}
          onChange={(e) => setExpectedText(e.target.value)}
          placeholder="Ex: 1500,00"
        />
        <div className="text-xs text-gray-500 mt-1">Deixe vazio para remover o valor esperado.</div>
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <button
          onClick={() => {
            if (window.confirm(`Excluir o lugar "${place.name}"?`)) onDelete();
          }}
          className="px-3 py-2 rounded bg-rose-600 text-white"
        >
          Excluir
        </button>

        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded border">
            Cancelar
          </button>
          <button
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) return alert("Informe um nome");

              let expectedValue: number | null = null;
              if (expectedText.trim() !== "") {
                expectedValue = parseCurrencyInput(expectedText);
              }

              onSave({
                name: trimmed,
                color,
                expectedValue,
              });
            }}
            className="px-3 py-2 rounded bg-sky-700 text-white"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}