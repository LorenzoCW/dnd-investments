// KanbanBoard.tsx

import { useMemo, useRef, useState } from "react";
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

const defaultCols: Column[] = [
  { id: "investment1", title: "Investment 1" },
  { id: "investment2", title: "Investment 2" },
  { id: "investment3", title: "Investment 3" },
];

export type ColumnId = (typeof defaultCols)[number]["id"] | string;

const initialTasks: Task[] = [
  { id: "card1", columnId: "investment3", content: 50, dateISO: new Date('2025-11-01T12:00:00Z').toISOString() },
  { id: "card2", columnId: "investment2", content: 60, dateISO: new Date('2025-11-02T12:00:00Z').toISOString() },
  { id: "card3", columnId: "investment1", content: 70, dateISO: new Date('2025-11-03T12:00:00Z').toISOString() },
  { id: "card4", columnId: "investment1", content: 80, dateISO: new Date('2025-11-04T12:00:00Z').toISOString() },
];

export function KanbanBoard() {

  const [columns, setColumns] = useState<Column[]>(defaultCols); // teste
  // const [columns, setColumns] = useState<Column[]>([]);

  const [tasks, setTasks] = useState<Task[]>(() => initialTasks); // teste
  // const [tasks, setTasks] = useState<Task[]>([]);

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

  function normalizeTasks(inputTasks: Task[], colsOrder: ColumnId[]) {
    const byColumn: Task[] = [];
    for (const colId of colsOrder) {
      const tasksForCol = inputTasks
        .filter((t) => t.columnId === colId)
        .slice()
        .sort((a, b) => {
          const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
          const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
          return tb - ta;
        });
      byColumn.push(...tasksForCol);
    }

    // fallback
    const remaining = inputTasks.filter((t) => !colsOrder.includes(t.columnId));
    remaining.sort((a, b) => {
      const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return tb - ta;
    });
    byColumn.push(...remaining);
    return byColumn;
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
    onDragEnd({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        pickedUpTaskColumn.current = null;
        return;
      }
      if (active.data.current?.type === "Column" && over.data.current?.type === "Column") {
        const overColumnPosition = columnsId.findIndex((id) => id === over.id);
        return `Column ${active.data.current.column.title} was dropped into position ${overColumnPosition + 1} of ${columnsId.length}`;
      } else if (active.data.current?.type === "Task" && over.data.current?.type === "Task") {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(over.id, over.data.current.task.columnId);
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task was dropped into column ${column?.title} in position ${taskPosition + 1} of ${tasksInColumn.length}`;
        }
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

  function addColumn(title: string) {
    const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setColumns((cols) => [...cols, { id, title }]);
  }

  function removeColumn(id: ColumnId) {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    setTasks((ts) => normalizeTasks(ts.filter((t) => t.columnId !== id), columnsId));
  }

  function addTask(columnId: ColumnId, amount: number, dateISO?: string | null) {
    if (isNaN(amount) || amount <= 0) {
      alert("Informe um valor maior que zero");
      return;
    }
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTask: Task = { id, columnId: columnId as string, content: amount, dateISO: dateISO ?? new Date().toISOString() } as Task;
    setTasks((ts) => normalizeTasks([...ts, newTask], columnsId));
  }

  function removeTask(taskId: string) {
    setTasks((ts) => normalizeTasks(ts.filter((t) => t.id !== taskId), columnsId));
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
                onAddTask={(amount, dateISO) => addTask(col.id, amount, dateISO)}
                onRemoveTask={(taskId) => removeTask(taskId)}
                onRemoveColumn={() => removeColumn(col.id)}
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

    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === activeId);

      const overColumnIndex = columns.findIndex((col) => col.id === overId);

      return arrayMove(columns, activeColumnIndex, overColumnIndex);
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
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        const activeTask = tasks[activeIndex];
        const overTask = tasks[overIndex];
        let newTasks = tasks.slice();
        if (activeTask && overTask && activeTask.columnId !== overTask.columnId) {
          const updatedActive = { ...activeTask, columnId: overTask.columnId };
          newTasks[activeIndex] = updatedActive;
          newTasks = arrayMove(newTasks, activeIndex, overIndex - 1);
        } else {
          newTasks = arrayMove(newTasks, activeIndex, overIndex);
        }
        return normalizeTasks(newTasks, columnsId);
      });
    }

    const isOverAColumn = overData?.type === "Column";

    // dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const activeTask = tasks[activeIndex];
        if (activeTask) {
          const updated = tasks.slice();
          updated[activeIndex] = { ...activeTask, columnId: overId as ColumnId };
          return normalizeTasks(updated, columnsId);
        }
        return tasks;
      });
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
      className="flex gap-2"
    >
      <input
        className="border rounded px-2 py-1"
        placeholder="Nome da lista..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white">
        Adicionar lista
      </button>
    </form>
  );
}