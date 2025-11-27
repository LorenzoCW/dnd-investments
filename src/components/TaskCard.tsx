// File: TaskCard.tsx

import { useEffect, useState } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { cva } from "class-variance-authority";
import { ColumnId } from "./KanbanBoard";
import { Badge } from "./ui/badge";
import { GripVertical } from "lucide-react";
import { Button } from "./ui/button";

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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

export function TaskCard({ task, isOverlay }: TaskCardProps) {
  const isMobile = useIsMobile();

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "Task", task },
    attributes: { roleDescription: "Task" },
  });

  const style = { transition, transform: CSS.Translate.toString(transform) };

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
        {...(!isMobile ? { ...attributes, ...listeners, className: "p-3 border-b-2 border-secondary relative cursor-grab" } : {})}
      >

        <div className="flex">

          {isMobile && (
            <Button
              variant="ghost"
              {...attributes}
              {...listeners}
              className="absolute left-2 top-2 p-1.5 text-secondary-foreground/50 h-auto cursor-grab"
            >
              <span className="sr-only">Mover tarefa</span>
              <GripVertical />
            </Button>
          )}

          <div className={`text-xl ${isMobile ? "ml-10" : ""}`}>{formattedAmount}</div>

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