// File: KanbanBoard.tsx

import { useEffect, useMemo, useRef, useState } from "react";
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
  type Announcements,
  type UniqueIdentifier,
  TouchSensor,
  MouseSensor,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { type Task, TaskCard } from "./TaskCard";
import { hasDraggableData } from "./utils";
import { coordinateGetter } from "./multipleContainersKeyboardPreset";

import * as db from "../lib/db";
import { PiggyBank } from "lucide-react";

export type ColumnId = Column["id"] | string;

type Place = {
  id: string;
  name: string;
  color: string;
  expectedValue?: number | null;
  dateTimeISO?: string | null;
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

function toDateTimeLocalInputValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInputValue(value: string): string | null {
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "Sem data/hora";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [showPlacesModal, setShowPlacesModal] = useState(false);
  const [placesModalInitialPlaceId, setPlacesModalInitialPlaceId] = useState<string | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

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
    setColumns(DEFAULT_COLUMNS);
    setTasks([]);
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
    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? {
            ...t,
            ...(patch.content !== undefined ? { content: round2(patch.content) } : {}),
            ...(patch.dateISO !== undefined ? { dateISO: patch.dateISO ?? undefined } : {}),
            ...(patch.columnId ? { columnId: patch.columnId } : {}),
            ...(patch.isProjection !== undefined ? { isProjection: !!patch.isProjection } : {}),
          }
          : t
      )
    );
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

  function normalizePlace(raw: any): Place {
    return {
      id: String(raw?.id ?? uid("place")),
      name: String(raw?.name ?? ""),
      color: String(raw?.color ?? "#06b6d4"),
      expectedValue:
        raw?.expectedValue === undefined || raw?.expectedValue === null || raw?.expectedValue === ""
          ? null
          : Number(raw.expectedValue) || null,
      dateTimeISO:
        raw?.dateTimeISO === undefined || raw?.dateTimeISO === null || raw?.dateTimeISO === ""
          ? null
          : String(raw.dateTimeISO),
    };
  }

  // subscribe to DB (or fall back to test-mode)
  useEffect(() => {
    let unsub: (() => void) | undefined;

    try {
      unsub = db.subscribeAll((snapshot: any) => {
        const cols = Array.isArray(snapshot?.columns) ? snapshot.columns : [];
        const ts = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
        const pls = Array.isArray(snapshot?.places) ? snapshot.places : [];

        setColumns(cols as any);

        const mappedTasks: Task[] = ts.map((t: any) => ({
          id: t.id,
          columnId: t.columnId,
          content: typeof t.content === "number" ? t.content : Number(t.content) || 0,
          dateISO: t.dateISO ?? undefined,
          isProjection: !!t.isProjection,
        }));
        setTasks(mappedTasks);
        setPlaces(pls.map(normalizePlace).filter((p: Place) => p.name.trim()));
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
      console.error("failed to update column meta, switching to test mode", err);
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
      if (!hasDraggableData(active)) {
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

  async function savePlacesToDb(next: Place[]) {
    const normalized = next.map(normalizePlace).filter((p) => p.name.trim());
    setPlaces(normalized);

    if (testMode) return;

    try {
      await db.upsertPlaces?.(normalized);
    } catch (err) {
      console.error("Failed to persist places", err);
      enterTestMode();
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  async function createPlace(data: Omit<Place, "id">) {
    const nextPlace: Place = {
      id: uid("place"),
      name: data.name,
      color: data.color,
      expectedValue: data.expectedValue ?? null,
      dateTimeISO: data.dateTimeISO ?? null,
    };

    const next = [...places, nextPlace];
    await savePlacesToDb(next);
    return nextPlace.id;
  }

  async function updatePlace(id: string, patch: Partial<Pick<Place, "name" | "color" | "expectedValue" | "dateTimeISO">>) {
    const next = places.map((p) => (p.id === id ? { ...p, ...patch } : p));
    await savePlacesToDb(next);
  }

  async function movePlace(id: string, direction: "up" | "down") {
    const index = places.findIndex((p) => p.id === id);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= places.length) return;

    const next = arrayMove(places, index, targetIndex);
    await savePlacesToDb(next);
  }

  async function removePlace(id: string) {
    const next = places.filter((p) => p.id !== id);
    await savePlacesToDb(next);

    setColumns((cols) => cols.map((c) => (String(c.placeId) === id ? { ...c, placeId: undefined } : c)));
    setSelectedPlaceIds((curr) => curr.filter((item) => item !== id));
    if (hoveredPlaceId === id) setHoveredPlaceId(null);

    if (testMode) return;

    try {
      const affectedColumns = columns.filter((c) => String(c.placeId) === id);
      await Promise.all(affectedColumns.map((c) => db.editColumn(String(c.id), { placeId: null })));
      await db.removePlace?.(id);
    } catch (err) {
      console.error(err);
      enterTestMode();
      alert("Erro ao acessar Firestore. Entrando em modo de teste. Os dados não serão salvos permanentemente.");
    }
  }

  const placeTotals = useMemo(() => {
    const totals = new Map<string, number>();
    places.forEach((p) => totals.set(p.id, 0));

    columns.forEach((col) => {
      if (!col.placeId) return;

      const totalForColumn = tasks
        .filter((t) => t.columnId === col.id && !t.isProjection)
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

  function openPlacesManager(placeId: string | null = null) {
    setPlacesModalInitialPlaceId(placeId);
    setShowPlacesModal(true);
  }

  function handleClosePlacesManager() {
    setShowPlacesModal(false);
    setPlacesModalInitialPlaceId(null);
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

      {typeof document !== "undefined" &&
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

      {showPlacesModal && (
        <PlacesManagerModal
          places={places}
          initialPlaceId={placesModalInitialPlaceId}
          onClose={handleClosePlacesManager}
          onCreate={createPlace}
          onUpdate={updatePlace}
          onDelete={removePlace}
          onMove={movePlace}
        />
      )}

      {/* Places bar */}
      <div className="fixed left-0 bottom-5 w-screen flex items-center justify-center">
        <div className="p-1 flex items-center gap-2 overflow-x-auto pr-2">
          <button
            onClick={() => openPlacesManager(null)}
            aria-label="Gerenciar lugares"
            className="w-8 h-8 p-6 flex items-center justify-center rounded-full bg-sky-700 text-white hover:opacity-90 transition"
          >
            <div>
              <PiggyBank size={24} />
            </div>
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
                onToggle={() => setSelectedPlaceIds((current) => (current.includes(p.id) ? current.filter((item) => item !== p.id) : [...current, p.id]))}
                onHoverStart={() => setHoveredPlaceId(p.id)}
                onHoverEnd={() => setHoveredPlaceId((current) => (current === p.id ? null : current))}
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
        console.error("failed to edit task column, switching to test mode", e);
        enterTestMode();
        localEditTask(String(taskId), { columnId: String(targetColumnId), dateISO: dateISO ?? undefined });
      }
    }

    // dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      // if changing column, update task columnId
      if (overData.task.columnId !== activeData.task.columnId) {
        updateTaskColumn(activeId, overData.task.columnId, activeData.task.dateISO ?? new Date().toISOString());
      }
    }

    const isOverAColumn = overData?.type === "Column";

    // dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      updateTaskColumn(activeId, overId, activeData.task.dateISO ?? new Date().toISOString());
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
      <button
        type="submit"
        className="text-xs lg:text-base px-3 py-1 rounded bg-sky-700 text-white hover:ring ring-sky-700 transition-all duration-300 cursor-pointer"
      >
        Adicionar investimento
      </button>
    </form>
  );
}

function PlaceChip({
  place,
  total,
  isActive,
  onToggle,
  onHoverStart,
  onHoverEnd,
}: {
  place: Place;
  total: number;
  isActive: boolean;
  onToggle: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  return (
    <button
      type="button"
      className="flex-shrink-0 px-3 py-2 rounded-full bg-slate-200 dark:bg-slate-700 text-sm font-medium cursor-pointer select-none min-w-[170px] text-left"
      title={place.name}
      onClick={onToggle}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        color: isActive ? place.color : undefined,
        border: isActive ? `1px solid ${place.color}` : "1px solid transparent",
        background: isActive ? `${place.color}18` : undefined,
      }}
    >
      <div className="flex flex-col leading-tight">
        <span className="truncate max-w-[220px]">{place.name}</span>
        <span className="text-[11px] opacity-80">
          Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
          {place.expectedValue !== undefined && place.expectedValue !== null
            ? ` / ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(place.expectedValue)}`
            : ""}
        </span>
      </div>
    </button>
  );
}

function PlacesManagerModal({
  places,
  initialPlaceId,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onMove,
}: {
  places: Place[];
  initialPlaceId: string | null;
  onClose: () => void;
  onCreate: (data: Omit<Place, "id">) => Promise<string> | string;
  onUpdate: (id: string, patch: Partial<Pick<Place, "name" | "color" | "expectedValue" | "dateTimeISO">>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onMove: (id: string, direction: "up" | "down") => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPlaceId);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#06b6d4");
  const [expectedText, setExpectedText] = useState("");
  const [dateTimeLocal, setDateTimeLocal] = useState("");

  const selectedPlace = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId]
  );

  useEffect(() => {
    if (initialPlaceId && places.some((p) => p.id === initialPlaceId)) {
      setSelectedId(initialPlaceId);
      return;
    }

    setSelectedId(null);
  }, [initialPlaceId, places]);

  useEffect(() => {
    if (selectedPlace) {
      setName(selectedPlace.name);
      setColor(selectedPlace.color);
      setExpectedText(
        selectedPlace.expectedValue !== undefined && selectedPlace.expectedValue !== null
          ? selectedPlace.expectedValue.toFixed(2)
          : ""
      );
      setDateTimeLocal(toDateTimeLocalInputValue(selectedPlace.dateTimeISO));
    } else {
      setName("");
      setColor("#06b6d4");
      setExpectedText("");
      setDateTimeLocal("");
    }
  }, [selectedPlace]);

  function clearFormForNewPlace() {
    setSelectedId(null);
    setName("");
    setColor("#06b6d4");
    setExpectedText("");
    setDateTimeLocal("");
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Informe um nome");
      return;
    }

    let expectedValue: number | null = null;
    if (expectedText.trim() !== "") {
      try {
        expectedValue = parseCurrencyInput(expectedText);
      } catch (e: any) {
        alert(e?.message ?? "Valor esperado inválido");
        return;
      }
    }

    const dateTimeISO = fromDateTimeLocalInputValue(dateTimeLocal);

    if (selectedId) {
      await Promise.resolve(
        onUpdate(selectedId, {
          name: trimmed,
          color,
          expectedValue,
          dateTimeISO,
        })
      );
    } else {
      const newId = await Promise.resolve(
        onCreate({
          name: trimmed,
          color,
          expectedValue,
          dateTimeISO,
        })
      );
      setSelectedId(newId);
    }
  }

  async function handleDelete(id: string) {
    const place = places.find((p) => p.id === id);
    if (!place) return;

    if (!window.confirm(`Excluir o lugar "${place.name}"?`)) return;

    await Promise.resolve(onDelete(id));

    const idx = places.findIndex((p) => p.id === id);
    const next = places[idx + 1] ?? places[idx - 1] ?? null;
    setSelectedId(next?.id ?? null);
  }

  async function handleMove(id: string, direction: "up" | "down") {
    await Promise.resolve(onMove(id, direction));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold">Gerenciar lugares</h3>
            <p className="text-sm text-slate-500">Visualize, adicione, edite, exclua e reorganize os lugares.</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Lista de lugares</h4>
              <button
                onClick={clearFormForNewPlace}
                className="px-3 py-2 rounded-lg bg-sky-700 text-white hover:opacity-90"
              >
                Novo lugar
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {places.length === 0 ? (
                <div className="text-sm text-slate-500 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                  Nenhum lugar cadastrado.
                </div>
              ) : (
                places.map((place, index) => {
                  const isSelected = place.id === selectedId;
                  return (
                    <div
                      key={place.id}
                      className={[
                        "rounded-xl border p-3 transition",
                        isSelected
                          ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => setSelectedId(place.id)}
                          className="text-left flex-1 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-block w-3 h-3 rounded-full shrink-0"
                              style={{ background: place.color }}
                            />
                            <span className="font-medium truncate">{place.name}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {place.expectedValue !== undefined && place.expectedValue !== null
                              ? `Meta: ${new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(place.expectedValue)}`
                              : "Sem meta"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {place.dateTimeISO ? `Data/hora: ${formatDateTime(place.dateTimeISO)}` : ""}
                          </div>
                        </button>

                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => handleMove(place.id, "up")}
                            disabled={index === 0}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                            title="Mover para cima"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMove(place.id, "down")}
                            disabled={index === places.length - 1}
                            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                            title="Mover para baixo"
                          >
                            ↓
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => setSelectedId(place.id)}
                          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(place.id)}
                          className="px-3 py-2 rounded-lg bg-rose-600 text-white hover:opacity-90"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-5">
            <h4 className="font-semibold mb-3">{selectedId ? "Editar " + selectedPlace?.name : "Criar novo lugar"}</h4>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Nome</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Caixa, Reserva, Carteira..."
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Cor</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-10 p-0 border-0 bg-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1">Valor esperado</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  value={expectedText}
                  onChange={(e) => setExpectedText(e.target.value)}
                  placeholder="Ex: 1500,00"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Data e hora</label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
                  value={dateTimeLocal}
                  onChange={(e) => setDateTimeLocal(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button onClick={handleSave} className="px-3 py-2 rounded-lg bg-sky-700 text-white hover:opacity-90">
                  {selectedId ? "Atualizar" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}