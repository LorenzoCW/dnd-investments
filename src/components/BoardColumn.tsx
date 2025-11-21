// File: BoardColumn.tsx

import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDndContext, type UniqueIdentifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useRef, useEffect } from "react";
import { Task, TaskCard } from "./TaskCard";
import { cva } from "class-variance-authority";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { ArrowLeftRight, Plus, SquareCheck, X, CalendarCheck, Edit, Trash } from "lucide-react";
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
  allColumns?: Column[];
  onAddTask?: (amount: number, dateISO?: string | null, isProjection?: boolean) => void;
  onRemoveTask?: (taskId: string) => void;
  onRemoveColumn?: () => void;
  onTransferTask?: (
    taskId: UniqueIdentifier,
    amount: number,
    targetColumnId: UniqueIdentifier,
    dateISO?: string | null
  ) => void;
  onToggleProjection?: (taskId: UniqueIdentifier) => void;
  onEditTask?: (taskId: UniqueIdentifier, amount: number, dateISO?: string | null, isProjection?: boolean) => void;
}

function Modal({ children }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl p-6 w-11/12 max-w-xl border-2 border-slate-800 shadow-2xl shadow-neutral-500/5"
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

function AddCardForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (amount: number, dateISO?: string | null, isProjection?: boolean) => void }) {
  const [amountText, setAmountText] = useState("");
  const [dateTimeLocal, setDateTimeLocal] = useState<string>(toLocalDateTimeInputValue());
  const [isProjection, setIsProjection] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    try {
      const amt = parseCurrencyInput(amountText);
      const dateISO = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : undefined;
      onAdd(amt, dateISO ?? undefined, isProjection ?? false);
    } catch (err: any) {
      alert(err?.message ?? "Valor inválido");
    }
  };

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

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

        <div>
          <span className="text-sm">Tipo</span>
          <div className="flex items-center gap-3 bg-neutral-700 h-11 rounded-sm border p-4 text-white">
            <div className="flex items-center gap-2 justify-around w-full">
              <span className="w-16">Saldo</span>
              <label className="inline-flex items-center justify-center cursor-pointer w-16">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isProjection}
                  onChange={(e) => setIsProjection(e.target.checked)}
                  aria-label="Adicionar como projeção"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${isProjection ? 'bg-blue-500' : 'bg-gray-500'}`}>
                  <div
                    className={`transform transition-transform rounded-full bg-white w-5 h-5 m-0.5 ${isProjection ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </div>
              </label>
              <span className="w-16">Projeção</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded border cursor-pointer hover:ring ring-slate-800 transition-all duration-300">
            Cancelar
          </button>
          <button onClick={handleAdd} className="px-3 py-2 rounded bg-green-600 text-white hover:ring ring-green-600 transition-all duration-300 cursor-pointer">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCardForm({
  initialAmount,
  initialDateISO,
  initialIsProjection,
  onCancel,
  onSave,
}: {
  initialAmount: number;
  initialDateISO?: string | null;
  initialIsProjection?: boolean;
  onCancel: () => void;
  onSave: (amount: number, dateISO?: string | null, isProjection?: boolean) => void;
}) {
  const [amountText, setAmountText] = useState<string>(() => {
    // Use dot as decimal separator which parseCurrencyInput accepts; show 2 decimals
    return initialAmount.toFixed(2);
  });
  const [dateTimeLocal, setDateTimeLocal] = useState<string>(() => {
    return initialDateISO ? toLocalDateTimeInputValue(new Date(initialDateISO)) : toLocalDateTimeInputValue();
  });
  const [isProjection, setIsProjection] = useState<boolean>(!!initialIsProjection);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    try {
      const amt = parseCurrencyInput(amountText);
      const dateISO = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : undefined;
      onSave(amt, dateISO ?? undefined, isProjection ?? false);
    } catch (err: any) {
      alert(err?.message ?? "Valor inválido");
    }
  };

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSave();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <h3 className="text-xl font-semibold mb-3">Editar cartão</h3>
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

        <div>
          <span className="text-sm">Tipo</span>
          <div className="flex items-center gap-3 bg-neutral-700 h-11 rounded-sm border p-4 text-white">
            <div className="flex items-center gap-2 justify-around w-full">
              <span className="w-16">Saldo</span>
              <label className="inline-flex items-center justify-center cursor-pointer w-16">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isProjection}
                  onChange={(e) => setIsProjection(e.target.checked)}
                  aria-label="Marcar como projeção"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${isProjection ? 'bg-blue-500' : 'bg-gray-500'}`}>
                  <div
                    className={`transform transition-transform rounded-full bg-white w-5 h-5 m-0.5 ${isProjection ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </div>
              </label>
              <span className="w-16">Projeção</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer">
            Cancelar
          </button>
          <button onClick={handleSave} className="px-3 py-2 rounded bg-amber-600 text-white hover:ring ring-amber-600 transition-all duration-300 cursor-pointer">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmationModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <div>
        <h3 className="text-xl font-semibold mb-3">Confirmar exclusão</h3>
        <p>{message}</p>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded bg-rose-600 text-white hover:ring ring-rose-600 transition-all duration-300 cursor-pointer"
          >
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MetaModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (value: number, startMonthISO: string | null, endMonthISO: string, dayNumber: number) => void;
}) {
  const [valueText, setValueText] = useState("");
  const [useCustomStart, setUseCustomStart] = useState(false);
  const now = new Date();
  const defaultMonthNum = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  const [startMonthNum, setStartMonthNum] = useState<string>(String(defaultMonthNum));
  const [startYear, setStartYear] = useState<string>(String(defaultYear));
  const [endMonthNum, setEndMonthNum] = useState<string>(String(defaultMonthNum));
  const [endYear, setEndYear] = useState<string>(String(defaultYear));
  const [dayNum, setDayNum] = useState<string>("1");

  function buildISO(monthStr: string, yearStr: string) {
    const m = Number(monthStr);
    const y = Number(yearStr);
    if (!Number.isFinite(m) || !Number.isFinite(y)) return null;
    const mm = String(m).padStart(2, "0");
    return `${y}-${mm}`; // YYYY-MM
  }

  function computePreview(value: number, startISO: string | null, endISO: string) {
    // returns array of amounts and last amount
    try {
      const startParts = (startISO ?? `${defaultYear}-${String(defaultMonthNum).padStart(2, "0")}`).split("-");
      const endParts = endISO.split("-");
      const startY = Number(startParts[0]);
      const startM = Number(startParts[1]);
      const endY = Number(endParts[0]);
      const endM = Number(endParts[1]);

      const monthsCount = (endY - startY) * 12 + (endM - startM) + 1; // inclusive
      if (!monthsCount || monthsCount <= 0) return null;
      const base = Math.floor((value / monthsCount) * 100) / 100;
      const amounts: number[] = [];
      for (let i = 0; i < monthsCount; i++) {
        const amt = i < monthsCount - 1 ? base : Math.round((value - base * (monthsCount - 1)) * 100) / 100;
        amounts.push(amt);
      }
      return amounts;
    } catch (e) {
      return null;
    }
  }

  const previewAmounts = useMemo(() => {
    try {
      const v = parseCurrencyInput(valueText);
      const startISO = useCustomStart ? buildISO(startMonthNum, startYear) : null;
      const endISO = buildISO(endMonthNum, endYear);
      return computePreview(v, startISO, endISO!);
    } catch (e) {
      return null;
    }
  }, [valueText, useCustomStart, startMonthNum, startYear, endMonthNum, endYear, dayNum]);

  const handleCreate = () => {
    try {
      const v = parseCurrencyInput(valueText);
      const startISO = useCustomStart ? buildISO(startMonthNum, startYear) : null;
      const endISO = buildISO(endMonthNum, endYear);
      const day = Math.max(1, Math.min(31, Number(dayNum) || 1));
      if (!endISO) {
        alert("Escolha a data limite corretamente");
        return;
      }
      onCreate(v, startISO ?? null, endISO, day);
    } catch (err: any) {
      alert(err?.message ?? "Valor inválido");
    }
  };

  const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Modal onClose={onClose}>
      <div>
        <h3 className="text-xl font-semibold mb-3">Criar projeção</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm">Valor total da meta</label>
            <input
              type="number"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              placeholder="Ex: 2000,00"
              className="w-full px-3 py-2 rounded border"
            />
          </div>

          <div>
            <label className="block text-sm">Data limite</label>
            <div className="flex gap-2">
              <input type="number" min={1} max={12} value={endMonthNum} onChange={(e) => setEndMonthNum(e.target.value)} className="w-1/3 px-3 py-2 rounded border" placeholder="MM" />
              <input type="number" min={1900} value={endYear} onChange={(e) => setEndYear(e.target.value)} className="w-2/3 px-3 py-2 rounded border" placeholder="YYYY" />
            </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={useCustomStart} onChange={(e) => setUseCustomStart(e.target.checked)} />
              <span className="text-sm">Escolher mês inicial (opcional)</span>
            </label>
            {useCustomStart && (
              <div className="flex gap-2 mt-2">
                <input type="number" min={1} max={12} value={startMonthNum} onChange={(e) => setStartMonthNum(e.target.value)} className="w-1/3 px-3 py-2 rounded border" placeholder="MM" />
                <input type="number" min={1900} value={startYear} onChange={(e) => setStartYear(e.target.value)} className="w-2/3 px-3 py-2 rounded border" placeholder="YYYY" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm">Dia do mês para as parcelas</label>
            <input type="number" min={1} max={31} value={dayNum} onChange={(e) => setDayNum(e.target.value)} className="w-full px-3 py-2 rounded border" />
          </div>

          {previewAmounts && (
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded">
              <div className="text-sm font-medium mb-1">Pré-visualização das parcelas</div>
              <div className="text-sm">
                {previewAmounts.map((a, idx) => (
                  <div key={idx}>{`Parcela ${idx + 1}: ${formatter.format(a)}`}</div>
                ))}
                <div className="mt-2 text-xs text-gray-500">Total parcelas: {previewAmounts.length} — última parcela: {formatter.format(previewAmounts[previewAmounts.length - 1])}</div>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <button onClick={onClose} className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleCreate} className="px-3 py-2 rounded bg-blue-600 text-white hover:ring ring-blue-600 transition-all duration-300 cursor-pointer">
              Criar projeção
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function BoardColumn({
  column,
  tasks,
  isOverlay,
  allColumns,
  onAddTask,
  onRemoveTask,
  onRemoveColumn,
  onTransferTask,
  onToggleProjection,
  onEditTask,
}: BoardColumnProps) {
  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const [isDeleteCardOpen, setIsDeleteCardOpen] = useState(false);
  const [isDeleteListOpen, setIsDeleteListOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMetaOpen, setIsMetaOpen] = useState(false);

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    } satisfies ColumnDragData,
    attributes: { roleDescription: `Column: ${column.title}` },
  });

  const [transferState, setTransferState] = useState<TransferState>({
    open: false,
    task: null,
    amount: 0,
    targetColumnId: column.id,
    dateTimeLocal: toLocalDateTimeInputValue(),
  });

  const [editState, setEditState] = useState<{
    open: boolean;
    task: Task | null;
  }>({ open: false, task: null });

  const handleOpenDeleteCardModal = (task: Task) => {
    setTaskToDelete(task);
    setIsDeleteCardOpen(true);
  };

  const handleOpenDeleteColumnModal = () => {
    setIsDeleteListOpen(true);
  };

  const handleConfirmDeleteCard = () => {
    if (taskToDelete && onRemoveTask) {
      onRemoveTask(taskToDelete.id.toString());
    }
    setTaskToDelete(null);
    setIsDeleteCardOpen(false);
  };

  const handleConfirmDeleteColumn = () => {
    if (onRemoveColumn) {
      onRemoveColumn();
    }
    setIsDeleteListOpen(false);
  };

  // total balance (does not include projections)
  const sumBalance = useMemo(() => {
    return tasks.reduce((sum, t) => sum + (t.isProjection ? 0 : (typeof t.content === 'number' ? t.content : Number(t.content) || 0)), 0);
  }, [tasks]);

  // sum of all projections
  const sumProjections = useMemo(() => {
    return tasks.reduce((sum, t) => sum + (t.isProjection ? (typeof t.content === 'number' ? t.content : Number(t.content) || 0) : 0), 0);
  }, [tasks]);

  const sumAll = useMemo(() => sumBalance + sumProjections, [sumBalance, sumProjections]);

  const formattedBalance = useMemo(() => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(sumBalance);
  }, [sumBalance]);

  const formattedAll = useMemo(() => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(sumAll);
  }, [sumAll]);

  const style = { transition, transform: CSS.Translate.toString(transform) };

  const variants = cva(
    "h-[530px] lg:h-[750px] max-h-[750px] w-[300px] lg:w-[340px] max-w-full bg-primary-foreground flex flex-col flex-shrink-0 snap-center",
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

  const actionButtonsStyle = "text-sm p-1.5 rounded-md transform duration-200";

  type TransferState = {
    open: boolean;
    task?: Task | null;
    amount: number;
    targetColumnId?: UniqueIdentifier | null;
    dateTimeLocal?: string;
  };

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
  }

  function createProjections(totalValue: number, startMonthISO: string | null, endMonthISO: string, dayNumber: number) {
    // startMonthISO and endMonthISO are in format 'YYYY-MM'
    const now = new Date();
    const startParts = (startMonthISO ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-');
    const endParts = endMonthISO.split('-');
    const startYear = Number(startParts[0]);
    const startMonth = Number(startParts[1]);
    const endYear = Number(endParts[0]);
    const endMonth = Number(endParts[1]);

    const monthsCount = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

    if (!monthsCount || monthsCount <= 0) {
      alert('O mês limite deve ser igual ou posterior ao mês inicial.');
      return;
    }

    const base = Math.floor((totalValue / monthsCount) * 100) / 100;
    const projections: { amount: number; dateISO: string }[] = [];

    for (let i = 0; i < monthsCount; i++) {
      const amt = i < monthsCount - 1 ? base : Math.round((totalValue - base * (monthsCount - 1)) * 100) / 100;
      const year = startYear + Math.floor((startMonth - 1 + i) / 12);
      const month = ((startMonth - 1 + i) % 12) + 1;
      // clamp day to last day of that month
      const day = Math.max(1, Math.min(dayNumber, getDaysInMonth(year, month)));
      const date = new Date(year, month - 1, day, 12, 0, 0);

      projections.push({ amount: amt, dateISO: date.toISOString() });
    }

    // call onAddTask for each projection
    if (!onAddTask) return;
    projections.forEach((p) => onAddTask(p.amount, p.dateISO, true));
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({ dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined })}
    >
      <CardHeader
        {...attributes}
        {...listeners}
        className="px-3 py-5 font-semibold border-b-2 flex flex-row justify-between cursor-grab"
      >

        <div className="flex items-center">
          <div className="ml-2 text-left">
            <div>{column.title}</div>
            <div className="text-sm font-medium text-gray-500">
              {formattedBalance}{sumProjections > 0 ? ` / ${formattedAll}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          {onAddTask && (
            <Button variant="ghost" className="hover:text-green-500" onClick={() => setIsModalOpen(true)} title="Adicionar cartão" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}>
              <Plus size={16} />
            </Button>
          )}

          <Button variant="ghost" className="hover:text-blue-500" onClick={() => setIsMetaOpen(true)} title="Criar projeção" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}>
            <CalendarCheck size={16} />
          </Button>

          {onRemoveColumn && (
            <Button variant="ghost" className="hover:text-rose-500" onClick={handleOpenDeleteColumnModal} title="Remover lista" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}>
              <X size={16} />
            </Button>
          )}

        </div>
      </CardHeader>

      <ScrollArea>
        <CardContent className="flex flex-grow flex-col gap-2 p-2">
          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <div key={task.id} className="relative group">

                <TaskCard task={task} />

                <div className="absolute w-full z-10 -bottom-1 flex justify-center opacity-0 group-hover:opacity-100 gap-0.5 group-hover:gap-1.5 transition-all duration-300">
                  {task.isProjection && onToggleProjection && (
                    <button
                      title="Transformar em saldo"
                      className={`${actionButtonsStyle} bg-emerald-600 hover:ring ring-emerald-600`}
                      onClick={() => onToggleProjection(task.id)}
                      aria-label={`Transformar projeção ${task.content} em saldo`}
                    >
                      <SquareCheck size={14} />
                    </button>
                  )}

                  {onTransferTask && (
                    <button
                      title="Transferir valor"
                      className={`${actionButtonsStyle} bg-indigo-600 hover:ring ring-indigo-600`}
                      onClick={() => {
                        setTransferState({
                          open: true,
                          task,
                          amount: Math.min(task.content, Math.floor(task.content)),
                          targetColumnId: column.id as UniqueIdentifier,
                          dateTimeLocal: toLocalDateTimeInputValue(new Date()),
                        });
                      }}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  )}

                  {onEditTask && (
                    <button
                      title="Editar cartão"
                      className={`${actionButtonsStyle} bg-yellow-600 hover:ring ring-yellow-600`}
                      onClick={() => setEditState({ open: true, task })}
                    >
                      <Edit size={14} />
                    </button>
                  )}

                  {onRemoveTask && (
                    <button
                      title="Remover cartão"
                      className={`${actionButtonsStyle} bg-rose-600 hover:ring ring-rose-600`}
                      onClick={() => handleOpenDeleteCardModal(task)}
                      aria-label={`Remover cartão ${task.content}`}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </SortableContext>

          {onAddTask && (
            <div className="mt-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsModalOpen(true)}
              >
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
            onAdd={(amount, dateISO, isProjection) => {
              onAddTask(amount, dateISO, isProjection);
              setIsModalOpen(false);
            }}
          />
        </Modal>
      )}

      {isMetaOpen && (
        <MetaModal
          onClose={() => setIsMetaOpen(false)}
          onCreate={(value, startMonthISO, endMonthISO, dayNumber) => {
            createProjections(value, startMonthISO, endMonthISO, dayNumber);
            setIsMetaOpen(false);
          }}
        />
      )}

      {editState.open && editState.task && onEditTask && (
        <Modal
          onClose={() => setEditState({ open: false, task: null })}
        >
          <EditCardForm
            initialAmount={typeof editState.task.content === 'number' ? editState.task.content : Number(editState.task.content) || 0}
            initialDateISO={editState.task.dateISO ?? undefined}
            initialIsProjection={!!editState.task.isProjection}
            onCancel={() => setEditState({ open: false, task: null })}
            onSave={(amount, dateISO, isProjection) => {
              onEditTask(editState.task!.id, amount, dateISO ?? undefined, isProjection ?? false);
              setEditState({ open: false, task: null });
            }}
          />
        </Modal>
      )}

      {transferState.open && transferState.task && onTransferTask && (
        <Modal
          onClose={() =>
            setTransferState({
              open: false,
              task: null,
              amount: 0,
              targetColumnId: column.id,
              dateTimeLocal: toLocalDateTimeInputValue(),
            })
          }
        >
          <div>
            <h3 className="text-xl font-semibold mb-3">Transferir valor</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm">Cartão</label>
                <div className="py-2 text-sm">{`${transferState.task.content.toFixed(
                  2
                )} — lista atual: ${column.title}`}</div>
              </div>

              <div>
                <label className="block text-sm">Lista de destino</label>
                <select
                  value={transferState.targetColumnId ?? column.id}
                  onChange={(e) =>
                    setTransferState((s) => ({
                      ...s,
                      targetColumnId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded border bg-white dark:bg-slate-800"
                >
                  {allColumns?.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm">Valor a transferir</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={transferState.amount}
                  onChange={(e) =>
                    setTransferState((s) => ({
                      ...s,
                      amount: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-3 py-2 rounded border"
                />
                <input
                  type="range"
                  min={0}
                  max={transferState.task.content}
                  step={1}
                  value={transferState.amount}
                  onChange={(e) =>
                    setTransferState((s) => ({
                      ...s,
                      amount: Math.min(
                        transferState.task!.content,
                        Number(e.target.value)
                      ),
                    }))
                  }
                  className="w-full mt-2"
                />
                <div className="text-xs mt-1">
                  Disponível: {transferState.task.content.toFixed(2)}
                </div>
              </div>

              <div>
                <label className="block text-sm">Data e hora</label>
                <input
                  type="datetime-local"
                  step={1}
                  value={transferState.dateTimeLocal}
                  onChange={(e) =>
                    setTransferState((s) => ({ ...s, dateTimeLocal: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded border"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() =>
                    setTransferState({
                      open: false,
                      task: null,
                      amount: 0,
                      targetColumnId: column.id,
                      dateTimeLocal: toLocalDateTimeInputValue(),
                    })
                  }
                  className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  onClick={() => {
                    const amt = transferState.amount;
                    if (!transferState.task) return;
                    if (!Number.isFinite(amt) || amt <= 0) {
                      alert("Informe um valor maior que zero");
                      return;
                    }
                    if (amt > transferState.task.content) {
                      alert("Valor maior do que o disponível no cartão");
                      return;
                    }
                    const targetId = transferState.targetColumnId ?? column.id;
                    const dateISO = transferState.dateTimeLocal
                      ? new Date(transferState.dateTimeLocal).toISOString()
                      : undefined;

                    onTransferTask(
                      transferState.task.id,
                      amt,
                      targetId,
                      dateISO ?? undefined
                    );

                    setTransferState({
                      open: false,
                      task: null,
                      amount: 0,
                      targetColumnId: column.id,
                      dateTimeLocal: toLocalDateTimeInputValue(),
                    });
                  }}
                  className="px-3 py-2 rounded bg-indigo-600 text-white hover:ring ring-indigo-600 transition-all duration-300 cursor-pointer"
                >
                  Transferir
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {isDeleteCardOpen && taskToDelete && (
        <ConfirmationModal
          message={`Excluir o cartão "${taskToDelete.content}"?`}
          onConfirm={handleConfirmDeleteCard}
          onCancel={() => setIsDeleteCardOpen(false)}
        />
      )}

      {isDeleteListOpen && (
        <ConfirmationModal
          message={`Excluir a lista "${column.title}"? Isso removerá todos os cartões nela.`}
          onConfirm={handleConfirmDeleteColumn}
          onCancel={() => setIsDeleteListOpen(false)}
        />
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