// File: TaskCard.tsx

import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cva } from "class-variance-authority";
import { ColumnId } from "./KanbanBoard";
import { Badge } from "./ui/badge";

export interface Task {
  id: UniqueIdentifier;
  columnId: ColumnId;
  content: number;
  dateISO?: string;
  isProjection: boolean;
}

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
}

export type TaskType = "Task";

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, isOverlay }: TaskCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    } satisfies TaskDragData,
    attributes: {
      roleDescription: "Task",
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva("", {
    variants: {
      dragging: {
        over: "ring-2 opacity-30",
        overlay: "ring-2 ring-primary",
      },
    },
  });

  const formattedDate = task.dateISO
    ? new Date(task.dateISO).toLocaleDateString()
    : "--";

  const formattedAmount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(task.content);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`
        ${variants({ dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined })}
        ${task.isProjection ? "opacity-60" : ""}
      `}
    >
      <CardHeader
        {...attributes}
        {...listeners}
        className="px-3 py-3 border-b-2 border-secondary relative cursor-grab"
      >

        <div className="flex">

          <div className="text-xl">{formattedAmount}</div>

          <Badge variant={"outline"} className="ml-auto font-semibold h-6">
            {task.isProjection ? "Projeção" : "Saldo"}
          </Badge>

        </div>

      </CardHeader>

      <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap">
        <p className="text-gray-400">{formattedDate}</p>
      </CardContent>

    </Card>
  );
}