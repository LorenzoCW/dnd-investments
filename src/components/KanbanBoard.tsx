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

const DEFAULT_COLUMNS: Column[] = [
  { id: "col-1", title: "A Fazer" },
  { id: "col-2", title: "Fazendo" },
  { id: "col-3", title: "Feito" },
];

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [testMode, setTestMode] = useState(false);

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

  // subscribe to DB (or fall back to test-mode)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      // try to subscribe using the external db implementation
      unsub = db.subscribeAll(({ columns: cols, tasks: ts }) => {
        setColumns(cols);

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
      <div className="flex gap-2 items-center mb-4">
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
                onAddTask={(amount, dateISO, isProjection) => addTask(col.id, amount, dateISO, isProjection)}
                onRemoveTask={(taskId) => removeTask(taskId)}
                onRemoveColumn={() => removeColumn(col.id)}
                onTransferTask={(taskId, amount, targetColumnId, dateISO) => transferTask(taskId, amount, targetColumnId, dateISO)}
                onToggleProjection={(taskId) => toggleProjection(taskId)}
                onEditTask={(taskId, amount, dateISO, isProjection) => editTask(taskId, amount, dateISO, isProjection)}
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
      className="flex gap-2 w-full justify-center"
    >
      <input
        className="border rounded px-2 py-1"
        value={value}
        maxLength={18}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="px-3 py-1 rounded bg-sky-700 text-white hover:ring ring-sky-700 transition-all duration-300 cursor-pointer">
        Adicionar investimento
      </button>
    </form>
  );
}