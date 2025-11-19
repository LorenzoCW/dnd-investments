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

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

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

  useEffect(() => {
    const unsub = db.subscribeAll(({ columns: cols, tasks: ts }) => {
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

    return () => {
      unsub();
    };
  }, []);

  // function normalizeTasks(inputTasks: Task[], colsOrder: ColumnId[]) {
  //   const byColumn: Task[] = [];
  //   for (const colId of colsOrder) {
  //     const tasksForCol = inputTasks
  //       .filter((t) => t.columnId === colId)
  //       .slice()
  //       .sort((a, b) => {
  //         const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
  //         const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
  //         return tb - ta;
  //       });
  //     byColumn.push(...tasksForCol);
  //   }

  //   // fallback
  //   const remaining = inputTasks.filter((t) => !colsOrder.includes(t.columnId));
  //   remaining.sort((a, b) => {
  //     const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
  //     const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
  //     return tb - ta;
  //   });
  //   byColumn.push(...remaining);
  //   return byColumn;
  // }

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


  async function addColumn(title: string) {
    try {
      await db.addColumn(title);
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar coluna");
    }
  }

  async function removeColumn(id: ColumnId) {
    try {
      await db.removeColumn(String(id));
    } catch (err) {
      console.error(err);
      alert("Erro ao remover coluna");
    }
  }

  async function addTask(columnId: ColumnId, amount: number, dateISO?: string | null, isProjection: boolean = false) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero");
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
      alert("Erro ao adicionar cartão");
    }
  }

  async function removeTask(taskId: string) {
    try {
      await db.removeTask(taskId);
    } catch (err) {
      console.error(err);
      alert("Erro ao remover cartão");
    }
  }

  async function transferTask(taskId: UniqueIdentifier, amount: number, targetColumnId: ColumnId, dateISO?: string | null) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero para transferir");
      return;
    }
    try {
      await db.transferTask(String(taskId), amount, String(targetColumnId), dateISO);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Erro ao transferir");
    }
  }

  async function toggleProjection(taskId: UniqueIdentifier) {
    try {
      await db.editTask(String(taskId), { isProjection: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao alternar projeção");
    }
  }

  async function editTask(taskId: UniqueIdentifier, amount: number, dateISO?: string | null, isProjection: boolean = false) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero");
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
      alert("Erro ao editar cartão");
    }
  }

  return (
    <DndContext
      accessibility={{ announcements }}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
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

      // persist order to DB
      const newOrder = newCols.map((c) => c.id);
      db.updateColumnsOrder(newOrder).catch((e) => {
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

    // dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      // if changing column, update task columnId & dateISO so it appears properly ordered
      if (overData.task.columnId !== activeData.task.columnId) {
        const nowISO = new Date().toISOString();
        db.editTask(String(activeId), { columnId: String(overData.task.columnId), dateISO: nowISO }).catch(console.error);
      }
    }

    const isOverAColumn = overData?.type === "Column";

    // dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      const nowISO = new Date().toISOString();
      db.editTask(String(activeId), { columnId: String(overId), dateISO: nowISO }).catch(console.error);
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