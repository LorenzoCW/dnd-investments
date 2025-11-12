// BoardColumn.tsx

import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDndContext, type UniqueIdentifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { Task, TaskCard } from "./TaskCard";
import { cva } from "class-variance-authority";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { GripVertical, Plus, X } from "lucide-react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";

export interface Column {
  id: UniqueIdentifier;
  title: string;
}

export type ColumnType = "Column";

export interface ColumnDragData {
  type: ColumnType;
  column: Column;
}

interface BoardColumnProps {
  column: Column;
  tasks: Task[];
  isOverlay?: boolean;
  onAddTask?: (value: string) => void;
  onRemoveTask?: (taskId: string) => void;
  onRemoveColumn?: () => void;
}

export function BoardColumn({ column, tasks, isOverlay, onAddTask, onRemoveTask, onRemoveColumn }: BoardColumnProps) {
  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    } satisfies ColumnDragData,
    attributes: {
      roleDescription: `Column: ${column.title}`,
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva(
    "h-[800px] max-h-[800px] w-[350px] max-w-full bg-primary-foreground flex flex-col flex-shrink-0 snap-center",
    {
      variants: {
        dragging: {
          default: "border-2 border-transparent",
          over: "ring-2 opacity-30",
          overlay: "ring-2 ring-primary",
        },
      },
    }
  );

  const [newTaskValue, setNewTaskValue] = useState("");

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined,
      })}
    >
      <CardHeader className="p-4 font-semibold border-b-2 text-left flex flex-row space-between items-center">
        <Button
          variant={"ghost"}
          {...attributes}
          {...listeners}
          className=" p-1 text-primary/50 -ml-2 h-auto cursor-grab relative"
        >
          <span className="sr-only">{`Move column: ${column.title}`}</span>
          <GripVertical />
        </Button>

        <span className="ml-auto"> {column.title}</span>

        {/* remove column button */}
        {onRemoveColumn && (
          <Button
            variant="ghost"
            onClick={() => onRemoveColumn()}
            className="ml-2"
            title="Remover lista"
          >
            <X size={16} />
          </Button>
        )}
      </CardHeader>
      <ScrollArea>
        <CardContent className="flex flex-grow flex-col gap-2 p-2">
          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <div key={task.id} className="relative">
                <TaskCard task={task} />
                {/* delete task button positioned at top-right of the card */}
                {onRemoveTask && (
                  <button
                    className="absolute top-1 right-1 p-1 rounded bg-white/80 text-sm"
                    onClick={() => onRemoveTask(task.id.toString())}
                    aria-label={`Remover cartão ${task.content}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </SortableContext>

          {/* add new task form */}
          {onAddTask && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = newTaskValue.trim();
                if (!v) return;
                onAddTask(v);
                setNewTaskValue("");
              }}
              className="mt-auto flex gap-2"
            >
              <input
                value={newTaskValue}
                onChange={(e) => setNewTaskValue(e.target.value)}
                placeholder="Valor do investimento"
                className="flex-1 rounded border px-2 py-1"
              />
              <Button type="submit" variant="ghost" className="p-1">
                <Plus size={16} />
              </Button>
            </form>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  const dndContext = useDndContext();

  const variations = cva("px-2 md:px-0 flex lg:justify-center pb-4", {
    variants: {
      dragging: {
        default: "snap-x snap-mandatory",
        active: "snap-none",
      },
    },
  });

  return (
    <ScrollArea
      className={variations({
        dragging: dndContext.active ? "active" : "default",
      })}
    >
      <div className="flex gap-4 items-center flex-row justify-center">
        {children}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}