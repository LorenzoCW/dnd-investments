import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDndContext, type UniqueIdentifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useRef, useEffect } from "react";
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
  onAddTask?: (amount: number, dateISO?: string | null) => void;
  onRemoveTask?: (taskId: string) => void;
  onRemoveColumn?: () => void;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl p-6 w-11/12 max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function toLocalDateTimeInputValue(d = new Date()) {
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 19);
}

function parseCurrencyInput(input: string): number {
  const s = String(input).trim();
  if (s.length === 0) throw new Error("Entrada vazia");

  const hasComma = s.indexOf(",") !== -1;
  const hasDot = s.indexOf(".") !== -1;

  let normalized = s;

  if (hasComma && hasDot) {
    // Ambiguous: decide decimal separator by which appears last
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // comma is decimal separator: remove dots (thousands), replace comma -> dot
      normalized = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // dot is decimal separator: remove commas (thousands)
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // only comma -> decimal separator
    normalized = s.replace(/,/g, ".");
  } else {
    normalized = s;
  }

  // At this point normalized should be digits and at most one dot
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Formato numérico inválido");
  }

  const parts = normalized.split(".");
  if (parts.length > 2) throw new Error("Formato numérico inválido");

  const integerPart = parts[0];
  const decimalPart = parts[1] ?? "";

  if (decimalPart.length > 2) {
    throw new Error("Apenas até 2 casas decimais");
  }

  // build a string with exactly two decimals
  let finalStr: string;
  if (decimalPart.length === 0) {
    finalStr = `${integerPart}.00`;
  } else if (decimalPart.length === 1) {
    finalStr = `${integerPart}.${decimalPart}0`;
  } else {
    finalStr = `${integerPart}.${decimalPart}`;
  }

  // Convert to number safely and round to 2 decimals
  const n = Math.round(Number(finalStr) * 100) / 100;
  if (Number.isNaN(n)) throw new Error("Número inválido");
  return n;
}

function AddCardForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (amount: number, dateISO?: string | null) => void }) {
  const [amountText, setAmountText] = useState("");
  const [dateTimeLocal, setDateTimeLocal] = useState<string>(toLocalDateTimeInputValue());
  const amountInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    try {
      const amt = parseCurrencyInput(amountText);
      const dateISO = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : undefined;
      onAdd(amt, dateISO ?? undefined);
    } catch (err: any) {
      alert(err?.message ?? "Valor inválido");
    }
  };

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [amountText, dateTimeLocal]);

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleAdd();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <h3 className="text-xl font-semibold mb-3">Adicionar cartão</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm">Valor</label>
          <input
            ref={amountInputRef}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="Ex: 500 ou 500,00 ou 1.234,56"
            className="w-full px-3 py-2 rounded border"
          />
        </div>
        <div>
          <label className="block text-sm">Data e hora</label>
          <input
            type="datetime-local"
            step={1}
            value={dateTimeLocal}
            onChange={(e) => setDateTimeLocal(e.target.value)}
            className="w-full px-3 py-2 rounded border"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded border cursor-pointer">
            Cancelar
          </button>
          <button onClick={handleAdd} className="px-3 py-2 rounded bg-green-600 text-white cursor-pointer">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardColumn({ column, tasks, isOverlay, onAddTask, onRemoveTask, onRemoveColumn }: BoardColumnProps) {
  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    } satisfies ColumnDragData,
    attributes: {
      roleDescription: `Column: ${column.title}`,
    },
  });

  const style = { transition, transform: CSS.Translate.toString(transform) };

  const variants = cva(
    "h-[750px] max-h-[750px] w-[350px] max-w-full bg-primary-foreground flex flex-col flex-shrink-0 snap-center",
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

  const [isModalOpen, setIsModalOpen] = useState(false);

  const actionButtonsStyle = "text-sm bg-rose-500/75 hover:bg-rose-600 -translate-x-1 p-1 rounded-md transform duration-200";

  return (
    <Card ref={setNodeRef} style={style} className={variants({ dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined })}>
      <CardHeader className="p-4 font-semibold border-b-2 text-left flex flex-row space-between items-center">
        <Button variant={"ghost"} {...attributes} {...listeners} className="p-1 text-primary/50 -ml-2 h-auto cursor-grab relative">
          <span className="sr-only">{`Move column: ${column.title}`}</span>
          <GripVertical />
        </Button>

        <span className="ml-auto">{column.title}</span>

        {onRemoveColumn && (
          <Button variant="ghost" onClick={() => onRemoveColumn()} className="ml-2" title="Remover lista">
            <X size={16} />
          </Button>
        )}
      </CardHeader>

      <ScrollArea>
        <CardContent className="flex flex-grow flex-col gap-2 p-2">

          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <div key={task.id} className="relative group">
                <TaskCard task={task} />

                <div className="absolute w-full z-10 -bottom-1 space-x-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {onRemoveTask && (
                    <button
                      className={actionButtonsStyle}
                      onClick={() => onRemoveTask(task.id.toString())}
                      aria-label={`Remover cartão ${task.content}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

              </div>
            ))}
          </SortableContext>

          {onAddTask && (
            <div className="mt-auto flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(true)}>
                <div className="flex items-center gap-2 justify-center">
                  <Plus size={16} /> <span>Adicionar cartão</span>
                </div>
              </Button>
            </div>
          )}
        </CardContent>
      </ScrollArea>

      {isModalOpen && onAddTask && (
        <Modal onClose={() => setIsModalOpen(false)}>
          <AddCardForm
            onCancel={() => setIsModalOpen(false)}
            onAdd={(amount, dateISO) => {
              onAddTask(amount, dateISO);
              setIsModalOpen(false);
            }}
          />
        </Modal>
      )}
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
    <ScrollArea className={variations({ dragging: dndContext.active ? "active" : "default" })}>
      <div className="flex gap-4 items-center flex-row justify-center">{children}</div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}