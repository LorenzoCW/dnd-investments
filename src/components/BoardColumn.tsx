// File: BoardColumn.tsx

import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDndContext, type UniqueIdentifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useRef, useEffect } from "react";
import { Task, TaskCard } from "./TaskCard";
import { cva } from "class-variance-authority";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { ArrowLeftRight, Plus, SquareCheck, X, CalendarCheck, Edit, Trash, Goal } from "lucide-react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { useModalHotkeys } from "../hooks/useModalHotkeys";

export interface Column {
  id: UniqueIdentifier;
  title: string;
  meta?: number | null | undefined;
  placeId?: string | null;
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
  allPlaces?: { id: string; name: string; color: string; }[];
  hoveredPlaceId?: string | null;
  selectedPlaceIds?: string[];
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
  onSetMeta?: (value: number | null | undefined) => void;
  onSetPlace?: (placeId?: string | null) => void;
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

function AddCardForm({
  onCancel,
  onAdd
}: {
  onCancel: () => void; onAdd: (amount: number, dateISO?: string | null, isProjection?: boolean) => void
}) {

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

  useModalHotkeys({
    onCancel,
    onConfirm: handleAdd,
  });

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <div>
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

  useModalHotkeys({
    onCancel,
    onConfirm: handleSave,
  });

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <div>
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

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => {
              setDateTimeLocal(
                initialDateISO
                  ? toLocalDateTimeInputValue(new Date(initialDateISO))
                  : toLocalDateTimeInputValue()
              );
            }}
            className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer text-sm"
          >
            Usar data original
          </button>

          <button
            type="button"
            onClick={() => setDateTimeLocal(toLocalDateTimeInputValue())}
            className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer text-sm"
          >
            Usar data atual
          </button>
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

function MetaModal({
  initialMeta,
  onCancel,
  onSave,
}: {
  initialMeta?: number | undefined | null;
  onCancel: () => void;
  onSave: (value: number | null) => void;
}) {
  const [valueText, setValueText] = useState(() => (initialMeta !== undefined && initialMeta !== null ? initialMeta.toFixed(2) : ""));
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    try {
      if (valueText.trim() === "") {
        onSave(null);
        return;
      }
      const v = parseCurrencyInput(valueText);
      onSave(v);
    } catch (e: any) {
      alert(e?.message ?? "Valor inválido");
    }
  };

  useModalHotkeys({
    onCancel,
    onConfirm: handleSave,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Modal onClose={onCancel}>
      <div>
        <h3 className="text-xl font-semibold mb-3">{initialMeta ? "Editar meta" : "Definir meta"}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm">Valor da meta</label>
            <input
              ref={inputRef}
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              placeholder="Ex: 600 ou 600,00 ou 1.000,00"
              className="w-full px-3 py-2 rounded border"
            />
            <div className="text-sm text-gray-500 mt-1">Deixe vazio para remover a meta.</div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleSave} className="px-3 py-2 rounded bg-orange-600 text-white hover:ring ring-orange-600 transition-all duration-300 cursor-pointer">
              Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {

  useModalHotkeys({
    onCancel,
    onConfirm,
  });

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

function ProjectionModal({
  onClose,
  onCreate,
  currentBalance = 0,
}: {
  onClose: () => void; currentBalance?: number; onCreate: (
    value: number,
    startMonthISO: string | null,
    endMonthISO: string,
    dayNumber: number,
    useExistingBalance: boolean
  ) => void;
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
  const [useExistingBalance, setUseExistingBalance] = useState(false);

  const valueInputRef = useRef<HTMLInputElement>(null);

  function buildISO(monthStr: string, yearStr: string) {
    const m = Number(monthStr);
    const y = Number(yearStr);
    if (!Number.isFinite(m) || !Number.isFinite(y)) return null;
    const mm = String(m).padStart(2, "0");
    return `${y}-${mm}`;
  }

  function computePreview(value: number, startISO: string | null, endISO: string) {
    // returns array of amounts (with cents) where first N-1 are equal and last may differ
    try {
      const startParts = (startISO ?? `${defaultYear}-${String(defaultMonthNum).padStart(2, "0")}`).split("-");
      const endParts = endISO.split("-");
      const startY = Number(startParts[0]);
      const startM = Number(startParts[1]);
      const endY = Number(endParts[0]);
      const endM = Number(endParts[1]);

      const monthsCount = (endY - startY) * 12 + (endM - startM) + 1; // inclusive
      if (!monthsCount || monthsCount <= 0) return null;
      // base in cents to avoid floating errors
      const totalCents = Math.round(value * 100);
      const baseCents = Math.floor(totalCents / monthsCount);
      const amounts: number[] = [];
      for (let i = 0; i < monthsCount; i++) {
        if (i < monthsCount - 1) {
          amounts.push(baseCents / 100);
        } else {
          const lastCents = totalCents - baseCents * (monthsCount - 1);
          amounts.push(lastCents / 100);
        }
      }
      return amounts;
    } catch (e) {
      return null;
    }
  }

  const effectiveValue = useMemo(() => {
    try {
      const total = parseCurrencyInput(valueText);

      return useExistingBalance
        ? total - currentBalance
        : total;
    } catch {
      return null;
    }
  }, [valueText, useExistingBalance, currentBalance]);

  const previewAmounts = useMemo(() => {
    try {
      if (effectiveValue === null || effectiveValue <= 0) {
        return null;
      }

      const startISO = useCustomStart
        ? buildISO(startMonthNum, startYear)
        : null;

      const endISO = buildISO(endMonthNum, endYear);

      return computePreview(
        effectiveValue,
        startISO,
        endISO!
      );
    } catch {
      return null;
    }
  }, [
    effectiveValue,
    useCustomStart,
    startMonthNum,
    startYear,
    endMonthNum,
    endYear
  ]);

  const handleCreate = () => {
    try {
      const v = parseCurrencyInput(valueText);
      const adjustedValue = useExistingBalance ? (v - currentBalance) : v;

      if (useExistingBalance && adjustedValue < 0) {
        alert("O saldo atual já ultrapassa o valor total informado.");
        return;
      }

      const startISO = useCustomStart ? buildISO(startMonthNum, startYear) : null;
      const endISO = buildISO(endMonthNum, endYear);
      const day = Math.max(1, Math.min(31, Number(dayNum) || 1));

      if (!endISO) {
        alert("Escolha a data limite corretamente");
        return;
      }

      onCreate(v, startISO ?? null, endISO, day, useExistingBalance);
    } catch (err: any) {
      alert(err?.message ?? "Valor inválido");
    }
  };

  const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useModalHotkeys({
    onCancel() { },
    onConfirm: handleCreate,
  });

  useEffect(() => {
    valueInputRef.current?.focus();
  }, []);

  return (
    <Modal onClose={onClose}>
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            handleCreate();
          }
        }}
      >
        <h3 className="text-xl font-semibold mb-3">Criar projeção</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm">Valor total da projeção</label>
            <input
              ref={valueInputRef}
              type="number"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              placeholder="Ex: 2000,00"
              className="w-full px-3 py-2 rounded border"
            />

            <label className="inline-flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={useExistingBalance}
                onChange={(e) => setUseExistingBalance(e.target.checked)}
              />
              <span className="text-sm">
                Usar valor já existente no investimento
              </span>
            </label>

            {useExistingBalance && currentBalance > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Saldo atual da lista: {formatter.format(currentBalance)}
              </div>
            )}
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


          <div>
            <div className="text-sm">Pré-visualização das parcelas</div>

            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded h-52">
              {effectiveValue !== null && effectiveValue <= 0 ? (
                <div className="text-sm text-amber-600">
                  O saldo atual já atingiu ou ultrapassou o valor informado.
                </div>
              ) : previewAmounts ? (
                <div>
                  {(() => {
                    const effectiveValue = (() => {
                      try {
                        const total = parseCurrencyInput(valueText);
                        return useExistingBalance
                          ? Math.max(0, total - currentBalance)
                          : total;
                      } catch {
                        return null;
                      }
                    })();
                    const monthsCount = previewAmounts.length;
                    const totalCents =
                      effectiveValue !== null
                        ? Math.round(effectiveValue * 100)
                        : null;

                    if (monthsCount <= 0) return null;

                    // check if total is exactly divisible into cents
                    const divisibleIntoEqualCents = totalCents !== null && (totalCents % monthsCount === 0);

                    if (divisibleIntoEqualCents) {
                      const installmentCents = Math.round((totalCents as number) / monthsCount);
                      const installment = installmentCents / 100;
                      return (
                        <div>
                          <div>Total de parcelas: {monthsCount}</div>
                          <div className="mt-2 font-semibold">{monthsCount}x de {formatter.format(installment)}</div>
                        </div>
                      );
                    }

                    // otherwise show grouped (first N-1 + last) and round option
                    const firstValue = previewAmounts[0];
                    const lastValue = previewAmounts[previewAmounts.length - 1];
                    const firstCount = previewAmounts.length - 1;

                    const valueNum = effectiveValue;

                    let ceilInstallment = null as number | null;
                    let newTotal = null as number | null;
                    if (valueNum !== null) {
                      const cents = Math.round(valueNum * 100);
                      const ceilInstallmentCents = Math.ceil(cents / monthsCount);
                      ceilInstallment = ceilInstallmentCents / 100;
                      newTotal = Math.round(ceilInstallment * monthsCount * 100) / 100;
                    }

                    return (
                      <div>
                        <div>Total de parcelas: {monthsCount}</div>

                        {firstCount > 0 && (
                          <div className="mt-2 font-semibold">{firstCount}x de {formatter.format(firstValue)}</div>
                        )}

                        <div className="text-center">+</div>

                        <div className="font-semibold">1x de {formatter.format(lastValue)}</div>

                        {newTotal !== null && (
                          <div className="mt-8 items-center justify-center">
                            <button
                              onClick={() => {
                                // set the value text to the new rounded total so the form shows equal installments
                                setValueText((newTotal as number).toFixed(2));
                              }}
                              className="px-2 py-1 rounded bg-blue-800 text-white hover:ring ring-blue-800 transition-all duration-200"
                            >
                              Arredondar
                            </button>

                            <div className="text-sm text-gray-500 mt-1">{monthsCount}x de {formatter.format(ceilInstallment as number)} = {formatter.format(newTotal as number)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          </div>

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

function TransferModal({
  task,
  columns,
  currentColumnId,
  onClose,
  onConfirm,
}: {
  task: Task;
  columns: Column[];
  currentColumnId: UniqueIdentifier;
  onClose: () => void;
  onConfirm: (amount: number, targetColumnId: UniqueIdentifier, dateISO?: string | null) => void;
}) {
  const maxAmount = useMemo(
    () => (typeof task.content === "number" ? task.content : Number(task.content) || 0),
    [task.content]
  );

  const [amount, setAmount] = useState<number>(maxAmount);
  const [targetColumnId, setTargetColumnId] = useState<UniqueIdentifier>(currentColumnId);
  const [dateTimeLocal, setDateTimeLocal] = useState(toLocalDateTimeInputValue());

  const amountInputRef = useRef<HTMLInputElement>(null);

  const originalDateLocal = useMemo(() => {
    return task.dateISO ? toLocalDateTimeInputValue(new Date(task.dateISO)) : toLocalDateTimeInputValue();
  }, [task.dateISO]);

  useEffect(() => {
    setAmount(maxAmount);
  }, [maxAmount]);

  const clampAmount = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round(value * 100) / 100;
    return Math.max(0, Math.min(maxAmount, rounded));
  };

  useModalHotkeys({
    onCancel: onClose,
    onConfirm: () => {
      const safeAmount = clampAmount(amount);

      if (safeAmount <= 0) return alert("Informe um valor maior que zero");
      if (safeAmount > maxAmount) return alert("Valor maior do que o disponível");

      const dateISO = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : null;
      onConfirm(safeAmount, targetColumnId, dateISO);
    },
  });

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <Modal onClose={onClose}>
      <div>
        <h3 className="text-xl font-semibold mb-3">Transferir valor</h3>

        <div className="space-y-3">
          <div className="border border-slate-700 rounded-md text-sm flex justify-center gap-10 py-2">
            <span>
              <span className="text-neutral-400">Lista atual:</span>{" "}
              <span className="font-semibold">
                {columns.find(c => c.id === currentColumnId)?.title}
              </span>
            </span>
            <span>
              <span className="text-neutral-400">Valor disponível:</span>{" "}
              <span className="font-semibold">R$ {maxAmount.toFixed(2)}</span>
            </span>
          </div>

          <div>
            <label className="block text-sm">Lista de destino</label>
            <select
              value={targetColumnId}
              onChange={(e) => setTargetColumnId(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-white dark:bg-slate-800"
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm">Valor a transferir</label>
            <input
              ref={amountInputRef}
              type="number"
              min={0}
              max={maxAmount}
              step={0.01}
              value={amount}
              onChange={(e) => {
                const next = Number(e.target.value);
                setAmount(clampAmount(Number.isFinite(next) ? next : 0));
              }}
              className="w-full px-3 py-2 rounded border"
            />

            <input
              type="range"
              min={0}
              max={maxAmount}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(clampAmount(Number(e.target.value)))}
              className="w-full mt-2"
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

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setDateTimeLocal(originalDateLocal)}
                className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer text-sm"
              >
                Usar data original
              </button>

              <button
                type="button"
                onClick={() => setDateTimeLocal(toLocalDateTimeInputValue())}
                className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer text-sm"
              >
                Usar data atual
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded border hover:ring ring-slate-800 transition-all duration-300 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={() => {
                const safeAmount = clampAmount(amount);

                if (safeAmount <= 0) return alert("Informe um valor maior que zero");
                if (safeAmount > maxAmount) return alert("Valor maior do que o disponível");

                const dateISO = dateTimeLocal ? new Date(dateTimeLocal).toISOString() : null;
                onConfirm(safeAmount, targetColumnId, dateISO);
              }}
              className="px-3 py-2 rounded bg-indigo-600 text-white hover:ring ring-indigo-600 transition-all duration-300 cursor-pointer"
            >
              Transferir
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
  allPlaces = [],
  hoveredPlaceId,
  selectedPlaceIds = [],
  onAddTask,
  onRemoveTask,
  onRemoveColumn,
  onTransferTask,
  onToggleProjection,
  onEditTask,
  onSetMeta,
  onSetPlace,
}: BoardColumnProps) {
  const tasksIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const [isDeleteCardOpen, setIsDeleteCardOpen] = useState(false);
  const [isDeleteListOpen, setIsDeleteListOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProjectionOpen, setIsProjectionOpen] = useState(false);

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

  const [isMetaOpen, setIsMetaOpen] = useState(false);

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

  const formattedMeta = useMemo(() => {
    if (column.meta === undefined || column.meta === null) return null;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(column.meta);
  }, [column.meta]);

  // decide what to show under the title:
  // if meta exists -> show "balance / meta"
  // else if projections exist -> show "balance / projections"
  // else -> show "balance"
  const headerValueText = column.meta !== undefined && column.meta !== null
    ? `${formattedBalance} / ${formattedMeta}`
    : (sumProjections > 0 ? `${formattedBalance} / ${formattedAll}` : formattedBalance);

  const style = { transition, transform: CSS.Translate.toString(transform) };

  // columns
  const variants = cva(
    "h-[650px] lg:h-[726px] w-[300px] lg:w-[340px] max-w-full bg-primary-foreground flex flex-col flex-shrink-0 snap-center",
    {
      variants: {
        dragging: {
          default: "border-1 border-transparent",
          over: "ring-1 ring-primary opacity-30",
          overlay: "ring-1 ring-primary",
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

  function createProjections(
    totalValue: number,
    startMonthISO: string | null,
    endMonthISO: string,
    dayNumber: number,
    useExistingBalance: boolean = false
  ) {
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

    const remainingValue = useExistingBalance ? (totalValue - sumBalance) : totalValue;

    if (useExistingBalance && remainingValue <= 0) {
      alert('O saldo atual já cobre ou ultrapassa o valor total informado.');
      return;
    }

    const base = Math.floor((remainingValue / monthsCount) * 100) / 100;
    const projections: { amount: number; dateISO: string }[] = [];

    for (let i = 0; i < monthsCount; i++) {
      const amt = i < monthsCount - 1
        ? base
        : Math.round((remainingValue - base * (monthsCount - 1)) * 100) / 100;

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

  const isThisPlaceHovered = !!(hoveredPlaceId && column.placeId && hoveredPlaceId === column.placeId);
  const isThisPlaceSelected = !!(column.placeId && selectedPlaceIds.includes(column.placeId));
  const isThisPlaceActive = isThisPlaceHovered || isThisPlaceSelected;

  const hoveredPlace = (allPlaces ?? []).find((p) => p.id === (hoveredPlaceId ?? column.placeId));
  const thisPlace = (allPlaces ?? []).find((p) => p.id === column.placeId);
  const highlightColor = hoveredPlace?.color ?? thisPlace?.color;

  const combinedStyle = {
    ...style,
    boxShadow: isThisPlaceActive ? `0 0 10px 0px ${highlightColor}99` : undefined,
  } as React.CSSProperties;

  return (
    <Card
      ref={setNodeRef}
      style={combinedStyle}
      className={variants({ dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined })}
      onMouseEnter={() => {
        window.dispatchEvent(new CustomEvent("kanban:place-hover", { detail: { placeId: column.placeId ?? null } }));
      }}
      onMouseLeave={() => {
        window.dispatchEvent(new CustomEvent("kanban:place-hover", { detail: { placeId: null } }));
      }}
    >
      <CardHeader
        {...attributes}
        {...listeners}
        className="px-3 py-5 font-semibold border-b-2 flex flex-row justify-between cursor-grab group relative"
      >

        <div className="flex items-center">
          <div className="ml-2 text-left">
            <div className="flex items-center gap-3">
              <div>{column.title}</div>

              {/* Select place */}
              <div>
                <select
                  value={column.placeId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (typeof onSetPlace === "function") {
                      onSetPlace(val === "" ? null : val);
                    }
                  }}
                  aria-label="Atribuir lugar à lista"
                  className="text-sm rounded border px-2 py-1 bg-white dark:bg-slate-800 w-40 truncate"
                >
                  <option value="">Sem lugar</option>
                  {(allPlaces ?? []).map((p: { id: string; name: string; color: string }) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-sm font-medium text-gray-500 mt-1">
              {headerValueText}
            </div>
          </div>
        </div>

        <div className="-translate-x-3 absolute w-full z-10 -bottom-2 flex justify-center opacity-0 group-hover:opacity-100 gap-0.5 group-hover:gap-1.5 transition-all duration-300">

          {onAddTask && (
            <button
              className={`${actionButtonsStyle} bg-emerald-600 hover:ring ring-emerald-600`}
              onClick={() => setIsModalOpen(true)}
              title="Adicionar cartão"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <Plus size={14} />
            </button>
          )}

          <button
            className={`${actionButtonsStyle} bg-blue-600 hover:ring ring-blue-600`}
            onClick={() => setIsProjectionOpen(true)}
            title="Criar projeção"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <CalendarCheck size={14} />
          </button>

          <button
            className={`${actionButtonsStyle} bg-orange-600 hover:ring ring-orange-600`}
            onClick={() => setIsMetaOpen(true)}
            title={column.meta ? "Editar meta" : "Definir meta"}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Goal size={14} />
          </button>

          {onRemoveColumn && (
            <button
              className={`${actionButtonsStyle} bg-rose-600 hover:ring ring-rose-600`}
              onClick={handleOpenDeleteColumnModal}
              title="Remover lista"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <X size={14} />
            </button>
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
                          amount: typeof task.content === "number" ? task.content : Number(task.content) || 0,
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
                      className={`${actionButtonsStyle} bg-amber-600 hover:ring ring-amber-600`}
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

      {isProjectionOpen && (
        <ProjectionModal
          currentBalance={sumBalance}
          onClose={() => setIsProjectionOpen(false)}
          onCreate={(value, startMonthISO, endMonthISO, dayNumber, useExistingBalance) => {
            createProjections(value, startMonthISO, endMonthISO, dayNumber, useExistingBalance);
            setIsProjectionOpen(false);
          }}
        />
      )}

      {isMetaOpen && onSetMeta && (
        <Modal onClose={() => setIsMetaOpen(false)}>
          <MetaModal
            initialMeta={column.meta}
            onCancel={() => setIsMetaOpen(false)}
            onSave={(value) => {
              onSetMeta(value);
              setIsMetaOpen(false);
            }}
          />
        </Modal>
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
        <TransferModal
          task={transferState.task}
          columns={allColumns ?? []}
          currentColumnId={column.id}
          onClose={() =>
            setTransferState({
              open: false,
              task: null,
              amount: 0,
              targetColumnId: column.id,
              dateTimeLocal: toLocalDateTimeInputValue(),
            })
          }
          onConfirm={(value, targetId, dateISO) => {
            onTransferTask(transferState.task!.id, value, targetId, dateISO ?? undefined);

            setTransferState({
              open: false,
              task: null,
              amount: 0,
              targetColumnId: column.id,
              dateTimeLocal: toLocalDateTimeInputValue(),
            });
          }}
        />
      )}

      {isDeleteCardOpen && taskToDelete && (
        <DeleteModal
          message={`Excluir o cartão "${taskToDelete.content}"?`}
          onConfirm={handleConfirmDeleteCard}
          onCancel={() => setIsDeleteCardOpen(false)}
        />
      )}

      {isDeleteListOpen && (
        <DeleteModal
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

  // columns container
  const variations = cva("px-2 md:px-0 flex lg:justify-center h-[80%] lg:h-[78%]", {
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