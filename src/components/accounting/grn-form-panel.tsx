"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Hash,
  Link2,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  Unlink,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type { PoProductOption } from "@/app/api/accounting/products/po-options/route";
import type { PoSupplierOption } from "@/app/api/accounting/suppliers/po-options/route";
import { SupplierQuickCreateModal } from "@/components/accounting/supplier-quick-create-modal";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GrnLineDraft = {
  id: string;
  itemId: string;
  itemLabel: string;
  description: string;
  orderedQty: string; // populated only when linked to a PO; "" otherwise
  receivedQty: string;
  unitPrice: string;
  // Flat-amount line discount allowed by the supplier on this line.
  // Always a string so the input field can hold "" / "0" / "12.50".
  // The line net = qty × unitPrice − discount (clamped at 0).
  discount: string;
  uomName: string;
  uomBase: string;
  condition: "Good" | "Damaged" | "Short" | "Excess";
  // Snapshot from product master at line-creation time
  requiresSerial: boolean;
  // Serial numbers entered for this line (only populated when requiresSerial)
  serials: string[];
  // Link back to the source PO line (only populated in withPo mode)
  purchaseOrderLineId?: string | null;
};

export type GrnSupplierOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

export type GrnItemOption = PoProductOption;

export type GrnPoOption = {
  id: string;
  poNumber: string;
  poDate: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  supplierContact: string;
  supplierCity: string;
  currency: string;
  status: string;
  lines: Array<{
    poLineId: string;
    itemId: string;
    itemLabel: string;
    description: string;
    orderedQty: string;
    unitPrice: string;
    uomName: string;
    uomBase: string;
    requiresSerial: boolean;
  }>;
};

export type GrnDraft = {
  grnNumber: string;
  mode: "withPo" | "withoutPo";
  poRef: GrnPoOption | null;
  supplier: GrnSupplierOption | null;
  openingBalanceMode: boolean;
  openingEquityAccount: { id: string; code: string; name: string } | null;
  receiptDate: string;
  receivedBy: string;
  deliveryNoteRef: string;
  vehicleRef: string;
  currency: string;
  notes: string;
  lines: GrnLineDraft[];
};

type GrnFormPanelProps = {
  formId: string;
  draft: GrnDraft;
  poOptions: GrnPoOption[];
  onChange: (draft: GrnDraft) => void;
  onSubmit: (draft: GrnDraft) => void;
};

// ─── Small helpers ──────────────────────────────────────────────────────────

function decimalAmount(value: string) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-2 block text-sm font-semibold text-[#4b433d]">{label}</label>;
}

const inputShellClass =
  "min-h-12 w-full rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-left text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]";

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`${inputShellClass} ${disabled ? "cursor-not-allowed bg-[#f7f3ef] text-[#9a8f85]" : ""}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

function NumericInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^0-9.]/g, "");
        const parts = raw.split(".");
        const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
        onChange(normalized);
      }}
      placeholder={placeholder}
      className={`${inputShellClass} ${disabled ? "cursor-not-allowed bg-[#f7f3ef] text-[#9a8f85]" : ""}`}
    />
  );
}

// ─── Generic select with optional search ────────────────────────────────────

type SelectOption = { label: string; value: string; detail?: string };

function SelectInput({
  value,
  onChange,
  options,
  placeholder = "Select",
  searchable = false,
  searchPlaceholder = "Search",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!searchable || !normalizedQuery) return options;
    return options.filter((option) =>
      [option.label, option.detail]
        .filter(Boolean)
        .some((part) => part?.toLowerCase().includes(normalizedQuery))
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        className={`${inputShellClass} flex items-center justify-between gap-3 ${
          disabled ? "cursor-not-allowed bg-[#f7f3ef] text-[#9a8f85]" : ""
        }`}
      >
        <span className={`truncate ${selectedOption ? "text-[#1f1d1c]" : "text-[#a1968c]"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[22px] border border-[#eadfd5] bg-white shadow-[0_22px_54px_rgba(42,34,28,0.15)]">
          {searchable ? (
            <div className="border-b border-[#f0e5dc] p-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
                />
              </label>
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto p-2">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                      selected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#4f4741] hover:bg-[#fff8f0]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{option.label}</span>
                      {option.detail ? (
                        <span className="mt-1 block truncate text-xs text-[#85786d]">{option.detail}</span>
                      ) : null}
                    </span>
                    {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No matches found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Date picker (same flavor as PO form) ───────────────────────────────────

// ─── Compact condition select ───────────────────────────────────────────────

type ConditionValue = GrnLineDraft["condition"];

const CONDITION_OPTIONS: ConditionValue[] = ["Good", "Damaged", "Short", "Excess"];

const CONDITION_PILL: Record<ConditionValue, string> = {
  Good: "bg-[#eaf6ee] text-[#176d39] border-[#bce0c6]",
  Damaged: "bg-[#fdecec] text-[#a4302a] border-[#f3c4bb]",
  Short: "bg-[#fff5e0] text-[#9b6f10] border-[#f0dfa1]",
  Excess: "bg-[#f1f5ff] text-[#3262c9] border-[#cee0f5]",
};

function ConditionSelect({
  value,
  onChange,
}: {
  value: ConditionValue;
  onChange: (next: ConditionValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${CONDITION_PILL[value]}`}
      >
        <span>{value}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border border-[#eadfd5] bg-white p-1 shadow-[0_12px_24px_rgba(42,34,28,0.12)]">
          {CONDITION_OPTIONS.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[11px] font-semibold transition ${
                  selected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#4f4741] hover:bg-[#fff8f0]"
                }`}
              >
                <span>{option}</span>
                {selected ? <Check className="h-3 w-3 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function parseDateValue(value: string) {
  const [yearValue, monthValue, dayValue] = value.split("-").map(Number);
  if (!yearValue || !monthValue || !dayValue) return null;
  const parsed = new Date(yearValue, monthValue - 1, dayValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function DatePickerInput({
  value,
  onChange,
  placement = "bottom",
  align = "left",
}: {
  value: string;
  onChange: (value: string) => void;
  placement?: "top" | "bottom";
  align?: "left" | "right";
}) {
  const selectedDate = parseDateValue(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    const initialDate = selectedDate ?? today;
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayValue = toDateValue(new Date());

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function moveMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }
  function moveYear(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1));
  }

  const navBtnClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadfd5] text-[#6d625a] transition hover:bg-[#fff7f0]";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && selectedDate) {
            setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
          }
          setOpen((current) => !current);
        }}
        className={`${inputShellClass} flex items-center justify-between gap-3`}
      >
        <span>{value || "Select date"}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#9a8f85]" />
      </button>

      {open ? (
        <div
          className={`absolute z-50 w-[min(21rem,calc(100vw-2rem))] rounded-[24px] border border-[#eadfd5] bg-white p-3 shadow-[0_22px_54px_rgba(42,34,28,0.15)] ${
            align === "right" ? "right-0" : "left-0"
          } ${placement === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
        >
          <div className="mb-3 flex items-center justify-between gap-1">
            <button type="button" onClick={() => moveYear(-1)} className={navBtnClass} aria-label="Previous year">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => moveMonth(-1)} className={navBtnClass} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="flex-1 text-center text-sm font-semibold text-[#1f1d1c]">{monthLabel}</p>
            <button type="button" onClick={() => moveMonth(1)} className={navBtnClass} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => moveYear(1)} className={navBtnClass} aria-label="Next year">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-[#95877c]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dayValue = toDateValue(day);
              const inVisibleMonth = day.getMonth() === visibleMonth.getMonth();
              const selected = dayValue === value;
              const today = dayValue === todayValue;
              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => {
                    onChange(dayValue);
                    setOpen(false);
                  }}
                  className={`h-9 rounded-xl text-sm font-semibold transition ${
                    selected
                      ? "bg-[#ff7a12] text-white shadow-[0_10px_18px_rgba(255,122,18,0.22)]"
                      : today
                        ? "border border-[#ffcfaa] bg-[#fff7f0] text-[#a95915]"
                        : inVisibleMonth
                          ? "text-[#3f3833] hover:bg-[#fff4e8]"
                          : "text-[#c0b5ab] hover:bg-[#fffaf5]"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Variance pill helper ───────────────────────────────────────────────────

function variancePill(orderedQty: string, receivedQty: string) {
  const ord = decimalAmount(orderedQty);
  const rec = decimalAmount(receivedQty);
  if (!orderedQty) {
    return { label: "—", className: "bg-[#f5f0eb] text-[#7c6f65] border-[#e2d8cf]" };
  }
  const diff = rec - ord;
  if (diff === 0) {
    return {
      label: "On target",
      className: "bg-[#eaf6ee] text-[#176d39] border-[#bce0c6]",
    };
  }
  if (diff < 0) {
    return {
      label: `Short ${Math.abs(diff)}`,
      className: "bg-[#fdecec] text-[#a4302a] border-[#f3c4bb]",
    };
  }
  return {
    label: `Excess +${diff}`,
    className: "bg-[#fff5e0] text-[#9b6f10] border-[#f0dfa1]",
  };
}

// ─── Serial entry helpers ───────────────────────────────────────────────────

// Splits a serial string into a leading non-digit prefix and a trailing
// digit run. Returns null if the string has no trailing digits.
function splitSerial(value: string): { prefix: string; number: number; width: number } | null {
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    width: match[2].length,
  };
}

function generateContinuousSerials(
  start: string,
  end: string,
  fallbackCount: number
): { values: string[]; effectiveCount: number; rangeMismatch: boolean } {
  const trimmedStart = start.trim();
  if (!trimmedStart) {
    return { values: [], effectiveCount: 0, rangeMismatch: false };
  }
  const startSplit = splitSerial(trimmedStart);
  if (!startSplit) {
    // No digit run — produce repeated copies up to fallback count.
    return {
      values: Array.from({ length: fallbackCount }, () => trimmedStart),
      effectiveCount: fallbackCount,
      rangeMismatch: false,
    };
  }

  const trimmedEnd = end.trim();
  let count = fallbackCount;
  let rangeMismatch = false;
  if (trimmedEnd) {
    const endSplit = splitSerial(trimmedEnd);
    if (endSplit && endSplit.prefix === startSplit.prefix) {
      const span = endSplit.number - startSplit.number + 1;
      if (span > 0) {
        count = span;
        rangeMismatch = span !== fallbackCount;
      }
    }
  }

  const values = Array.from({ length: Math.max(0, count) }, (_, i) => {
    const numText = String(startSplit.number + i).padStart(startSplit.width, "0");
    return `${startSplit.prefix}${numText}`;
  });
  return { values, effectiveCount: values.length, rangeMismatch };
}

type SerialEntryModalProps = {
  open: boolean;
  line: GrnLineDraft | null;
  onClose: () => void;
  onSave: (serials: string[]) => void;
};

function SerialEntryModal({ open, line, onClose, onSave }: SerialEntryModalProps) {
  const targetCount = line ? Math.max(0, Math.floor(decimalAmount(line.receivedQty))) : 0;
  const [tab, setTab] = useState<"mixed" | "continuous">("mixed");
  const [serials, setSerials] = useState<string[]>([]);
  const [startSerial, setStartSerial] = useState("");
  const [endSerial, setEndSerial] = useState("");

  // Reset whenever the modal opens for a new line.
  useEffect(() => {
    if (!open || !line) return;
    if (line.serials.length) {
      setSerials([...line.serials]);
    } else {
      setSerials(Array.from({ length: targetCount }, () => ""));
    }
    setTab("mixed");
    setStartSerial("");
    setEndSerial("");
    // We intentionally only re-run when the line id changes; rebuilding state
    // mid-edit would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.id]);

  // When received qty changes (or modal first opens) ensure the rows array
  // is sized to match in mixed mode.
  useEffect(() => {
    if (!open) return;
    if (tab !== "mixed") return;
    setSerials((current) => {
      if (current.length === targetCount) return current;
      const next = current.slice(0, targetCount);
      while (next.length < targetCount) next.push("");
      return next;
    });
  }, [open, tab, targetCount]);

  // Continuous mode — re-generate as start / end change in real time.
  const continuousResult = useMemo(
    () => generateContinuousSerials(startSerial, endSerial, targetCount),
    [startSerial, endSerial, targetCount]
  );

  useEffect(() => {
    if (!open) return;
    if (tab !== "continuous") return;
    setSerials(continuousResult.values);
  }, [open, tab, continuousResult.values]);

  if (!open || !line) return null;

  const filledCount = serials.filter((value) => value.trim().length > 0).length;
  const canSave = filledCount === targetCount && targetCount > 0;

  function updateRow(index: number, value: string) {
    setSerials((current) => current.map((row, i) => (i === index ? value : row)));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,16,12,0.45)] p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[#eadfd5] bg-white shadow-[0_30px_60px_rgba(20,16,12,0.25)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#f0e5dc] px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">
              Add Serials
            </p>
            <h3 className="mt-1 truncate font-sans text-lg font-semibold text-[#1f1d1c]">
              {line.itemLabel}
            </h3>
            <p className="mt-1 text-xs text-[#7a6f67]">
              {filledCount}/{targetCount} serial{targetCount === 1 ? "" : "s"} entered for received qty {targetCount}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e2d8cf] bg-white text-[#7a6f67] transition hover:bg-[#fff7f0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#f0e5dc] px-6 pt-4">
          <div className="inline-flex rounded-full border border-[#e7dccf] bg-[#fffaf5] p-1">
            <button
              type="button"
              onClick={() => setTab("mixed")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                tab === "mixed"
                  ? "bg-[#ff7a12] text-white shadow-[0_8px_18px_rgba(255,122,18,0.22)]"
                  : "text-[#7a6f67] hover:bg-white"
              }`}
            >
              Mixed
            </button>
            <button
              type="button"
              onClick={() => setTab("continuous")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                tab === "continuous"
                  ? "bg-[#ff7a12] text-white shadow-[0_8px_18px_rgba(255,122,18,0.22)]"
                  : "text-[#7a6f67] hover:bg-white"
              }`}
            >
              Continuous range
            </button>
          </div>
          {tab === "continuous" ? (
            <div className="mt-3 grid gap-3 pb-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#5e554f]">Start serial</label>
                <input
                  type="text"
                  value={startSerial}
                  onChange={(event) => setStartSerial(event.target.value)}
                  placeholder="e.g. ABC-100200"
                  className="h-10 w-full rounded-xl border border-[#dfd4ca] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#5e554f]">
                  End serial <span className="font-normal text-[#9a8f85]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={endSerial}
                  onChange={(event) => setEndSerial(event.target.value)}
                  placeholder="e.g. ABC-100214"
                  className="h-10 w-full rounded-xl border border-[#dfd4ca] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                />
              </div>
              {continuousResult.rangeMismatch ? (
                <div className="rounded-xl border border-[#f0dfa1] bg-[#fff5e0] px-3 py-2 text-[11px] text-[#9b6f10] sm:col-span-2">
                  Range generates {continuousResult.effectiveCount} serial
                  {continuousResult.effectiveCount === 1 ? "" : "s"} — received qty is {targetCount}.
                </div>
              ) : null}
              {!startSerial.trim() ? (
                <p className="text-[11px] text-[#7a6f67] sm:col-span-2">
                  Tip: leave the end blank and we&apos;ll generate {targetCount} serials starting at the value you type.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Body — list of serial rows */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {targetCount === 0 ? (
            <div className="rounded-xl border border-dashed border-[#e2d8cf] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#7a6f67]">
              Set the received qty before adding serials.
            </div>
          ) : (
            <div className="grid gap-2">
              {Array.from({ length: targetCount }, (_, index) => {
                const value = serials[index] ?? "";
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-xl border border-[#ece6df] bg-[#fffcf9] px-3 py-2"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff1e2] text-[11px] font-semibold text-[#a95915]">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={value}
                      onChange={(event) => updateRow(index, event.target.value)}
                      placeholder="Enter serial number"
                      className="flex-1 rounded-lg border border-transparent bg-white px-3 py-1.5 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#f0e5dc] bg-[#fcfbf9] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#e2d8cf] bg-white px-4 py-2 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              const cleaned = serials.map((s) => s.trim()).filter((s) => s.length > 0);
              onSave(cleaned);
              onClose();
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              canSave
                ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
            }`}
          >
            Save serials
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch / serial cell ───────────────────────────────────────────────────

function BatchSerialCell({
  line,
  onOpenSerialModal,
}: {
  line: GrnLineDraft;
  onOpenSerialModal: () => void;
}) {
  if (line.requiresSerial) {
    const target = Math.max(0, Math.floor(decimalAmount(line.receivedQty)));
    const filled = line.serials.length;
    const complete = target > 0 && filled === target;
    const colorClass = complete
      ? "border-[#bce0c6] bg-[#eaf6ee] text-[#176d39] hover:bg-[#dff0e6]"
      : "border-[#f3c4bb] bg-[#fdecec] text-[#a4302a] hover:bg-[#fde0e0]";

    return (
      <button
        type="button"
        onClick={onOpenSerialModal}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${colorClass}`}
      >
        <Hash className="h-3 w-3" />
        {complete ? `${filled} serials` : target ? `${filled}/${target} serials` : "Set qty first"}
      </button>
    );
  }

  // Non-serial items have nothing to capture in this column.
  return <span className="text-xs text-[#9a8f85]">—</span>;
}

// ─── Async item + supplier pickers ─────────────────────────────────────────

const ASYNC_PAGE = 20;

function AsyncItemSelect({
  selected,
  onSelect,
}: {
  selected: GrnItemOption | null;
  onSelect: (item: GrnItemOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GrnItemOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  async function fetchItems(search: string, skip: number, replace: boolean) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, skip: String(skip), take: String(ASYNC_PAGE) });
      const res = await fetch(`/api/accounting/products/po-options?${params}`);
      const json = await res.json();
      if (json.success) {
        const newItems: GrnItemOption[] = json.data.items;
        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setHasMore(json.data.hasMore);
        skipRef.current = skip + newItems.length;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    skipRef.current = 0;
    fetchItems(query, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      skipRef.current = 0;
      fetchItems(query, 0, true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      fetchItems(query, skipRef.current, false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className={`${inputShellClass} flex items-center justify-between gap-3`}
      >
        <span className={`truncate ${selected ? "text-[#1f1d1c]" : "text-[#a1968c]"}`}>
          {selected ? `${selected.code} – ${selected.name}` : "Select item"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[22px] border border-[#eadfd5] bg-white shadow-[0_22px_54px_rgba(42,34,28,0.15)]">
          <div className="border-b border-[#f0e5dc] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search items"
                autoFocus
                className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2" onScroll={handleScroll}>
            {items.length ? (
              <>
                {items.map((item) => {
                  const isSelected = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#4f4741] hover:bg-[#fff8f0]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {item.code} – {item.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#85786d]">
                          {item.uomName} · {item.uomBase}
                        </span>
                      </span>
                      {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
                {loading ? (
                  <div className="py-2 text-center text-xs text-[#9b8f87]">Loading more…</div>
                ) : null}
              </>
            ) : loading ? (
              <div className="px-3 py-8 text-center text-sm text-[#7f746d]">Loading…</div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No items found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AsyncSupplierPicker({
  selected,
  onSelect,
  onAddNew,
}: {
  selected: GrnSupplierOption | null;
  onSelect: (supplier: GrnSupplierOption) => void;
  // Parent-supplied "+ Add" handler. When provided we render an
  // Add button next to the search input so buyers can register a
  // new supplier without leaving the GRN form.
  onAddNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<PoSupplierOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  async function fetchSuppliers(search: string, skip: number, replace: boolean) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, skip: String(skip), take: String(ASYNC_PAGE) });
      const res = await fetch(`/api/accounting/suppliers/po-options?${params}`);
      const json = await res.json();
      if (json.success) {
        const newItems: PoSupplierOption[] = json.data.items;
        setSuppliers((prev) => (replace ? newItems : [...prev, ...newItems]));
        setHasMore(json.data.hasMore);
        skipRef.current = skip + newItems.length;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    skipRef.current = 0;
    fetchSuppliers("", 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      skipRef.current = 0;
      fetchSuppliers(query, 0, true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      fetchSuppliers(query, skipRef.current, false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
      <div className="border-b border-[#f0e5dc] p-3">
        <div className="flex items-center gap-2">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search suppliers"
              className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
          {onAddNew ? (
            <button
              type="button"
              onClick={onAddNew}
              title="Add new supplier"
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[#ff7101] px-3.5 text-xs font-semibold text-white transition hover:bg-[#ea6a08]"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto p-2" onScroll={handleScroll}>
        {suppliers.length ? (
          <>
            {suppliers.map((supplier) => {
              const isSelected = selected?.id === supplier.id;
              return (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: supplier.id,
                      code: supplier.code,
                      name: supplier.name,
                      contact: supplier.contact,
                      city: supplier.city,
                      currency: supplier.currency,
                    })
                  }
                  className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                    isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{supplier.name}</span>
                    <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">
                      {supplier.code} · {supplier.contact} · {supplier.city}
                    </span>
                  </span>
                  {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
            {loading ? (
              <div className="py-2 text-center text-xs text-[#9b8f87]">Loading more…</div>
            ) : null}
          </>
        ) : loading ? (
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">Loading…</div>
        ) : (
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No suppliers found.</div>
        )}
      </div>
    </div>
  );
}

// ─── Equity account picker (opening balance source) ───────────────────────

type EquityAccountOption = { id: string; code: string; name: string };

function EquityAccountPicker({
  selected,
  onSelect,
}: {
  selected: EquityAccountOption | null;
  onSelect: (account: EquityAccountOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<EquityAccountOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/accounting/reports/options/accounts?categoryCode=EQUITY&take=100", {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { items: Array<{ id: string; code: string; name: string }> } }) => {
        if (j.success && j.data) {
          setAccounts(j.data.items.map((a) => ({ id: a.id, code: a.code, name: a.name })));
        }
      })
      .catch(() => {/* silent */})
      .finally(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? accounts.filter(
        (a) =>
          a.code.toLowerCase().includes(query.toLowerCase()) ||
          a.name.toLowerCase().includes(query.toLowerCase()),
      )
    : accounts;

  return (
    <div className="mt-3 rounded-2xl border border-[#ece2d8] bg-white/80 p-2">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a59889]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search equity accounts"
          className="h-9 w-full rounded-xl border border-[#dfd4ca] bg-white pl-8 pr-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82]"
        />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {loading ? (
          <div className="py-4 text-center text-xs text-[#9a8f85]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-[#9a8f85]">
            {query ? `No accounts match "${query}".` : "No equity accounts found."}
          </div>
        ) : (
          filtered.map((acc) => {
            const isSelected = selected?.id === acc.id;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onSelect(acc)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#fff5ec] ${
                  isSelected ? "bg-[#fff0e3] text-[#c25f10]" : "text-[#1f1d1c]"
                }`}
              >
                <span className="font-mono text-xs font-semibold text-[#7b6e64]">{acc.code}</span>
                <span className="flex-1 truncate">{acc.name}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-[#ff7101]" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function GrnFormPanel({
  formId,
  draft,
  poOptions,
  onChange,
  onSubmit,
}: GrnFormPanelProps) {
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [supplierQuickOpen, setSupplierQuickOpen] = useState(false);
  const [showPoPicker, setShowPoPicker] = useState(false);
  const [poQuery, setPoQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<GrnItemOption | null>(null);
  const [lineDescription, setLineDescription] = useState("");
  const [lineReceivedQty, setLineReceivedQty] = useState("1");
  const [lineUnitPrice, setLineUnitPrice] = useState("0.00");
  const [lineDiscount, setLineDiscount] = useState("0.00");
  const [lineCondition, setLineCondition] = useState<GrnLineDraft["condition"]>("Good");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [serialModalLineId, setSerialModalLineId] = useState<string | null>(null);
  const serialModalLine = useMemo(
    () => draft.lines.find((line) => line.id === serialModalLineId) ?? null,
    [draft.lines, serialModalLineId]
  );

  const isInPoMode = draft.mode === "withPo";
  const itemEntryDisabled = isInPoMode;

  const poMatches = useMemo(() => {
    const query = poQuery.trim().toLowerCase();
    const filtered = query
      ? poOptions.filter((po) =>
          [po.poNumber, po.poDate, po.status].some((value) => value.toLowerCase().includes(query))
        )
      : poOptions;
    return filtered.slice(0, 8);
  }, [poOptions, poQuery]);

  const grossSubtotal = useMemo(
    () =>
      draft.lines.reduce(
        (sum, line) => sum + decimalAmount(line.receivedQty) * decimalAmount(line.unitPrice),
        0
      ),
    [draft.lines]
  );
  const totalDiscount = useMemo(
    () =>
      draft.lines.reduce(
        (sum, line) => sum + Math.max(0, decimalAmount(line.discount)),
        0
      ),
    [draft.lines]
  );
  const subtotal = Math.max(0, grossSubtotal - totalDiscount);
  const totalReceived = draft.lines.reduce((sum, l) => sum + decimalAmount(l.receivedQty), 0);
  const totalOrdered = draft.lines.reduce((sum, l) => sum + decimalAmount(l.orderedQty), 0);
  const variance = totalOrdered ? totalReceived - totalOrdered : 0;

  function updateDraft(patch: Partial<GrnDraft>) {
    onChange({ ...draft, ...patch });
  }

  // ── PO link / unlink ────────────────────────────────────────────────

  function pickPo(po: GrnPoOption) {
    const supplier: GrnSupplierOption = {
      id: po.supplierId,
      code: po.supplierCode,
      name: po.supplierName,
      contact: po.supplierContact,
      city: po.supplierCity,
      currency: po.currency,
    };
    const lines: GrnLineDraft[] = po.lines.map((l, idx) => ({
      id: `po-${po.id}-${idx}-${Date.now()}`,
      itemId: l.itemId,
      itemLabel: l.itemLabel,
      description: l.description,
      orderedQty: l.orderedQty,
      receivedQty: l.orderedQty,
      unitPrice: l.unitPrice,
      discount: "0.00",
      uomName: l.uomName,
      uomBase: l.uomBase,
      condition: "Good",
      requiresSerial: l.requiresSerial,
      serials: [],
      purchaseOrderLineId: l.poLineId,
    }));
    onChange({
      ...draft,
      mode: "withPo",
      poRef: po,
      supplier,
      currency: po.currency,
      lines,
    });
    setShowPoPicker(false);
    setPoQuery("");
  }

  function unlinkPo() {
    // Stay in linked-to-PO mode; just drop the linked PO + its data so the user
    // can pick another PO. Supplier is also cleared because it was driven by
    // the unlinked PO.
    onChange({
      ...draft,
      poRef: null,
      supplier: null,
      lines: [],
    });
  }

  function setMode(mode: "withPo" | "withoutPo") {
    if (mode === draft.mode) return;
    // Always reset lines + PO ref + supplier when switching modes — the prior
    // data is tied to the prior mode (PO-snapshot vs. manual entry).
    onChange({ ...draft, mode, poRef: null, supplier: null, openingBalanceMode: false, openingEquityAccount: null, lines: [] });
  }

  // ── Add / edit / remove a manual line (without PO) ──────────────────

  function resetLineEntry() {
    setSelectedItem(null);
    setLineDescription("");
    setLineReceivedQty("1");
    setLineUnitPrice("0.00");
    setLineDiscount("0.00");
    setLineCondition("Good");
  }

  function addLineItem() {
    if (!selectedItem) return;
    const effectiveUnitPrice = lineUnitPrice || selectedItem.price;
    // Opening Balance lines must carry a real cost basis — a zero-rate row
    // would corrupt weighted-average cost downstream. See accounting-theories.md
    // §1.2 "Form Constraints".
    if (draft.openingBalanceMode && decimalAmount(effectiveUnitPrice) <= 0) {
      window.alert("Rate must be greater than 0 for Opening Balance lines.");
      return;
    }
    const next: GrnLineDraft = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      itemLabel: `${selectedItem.code} · ${selectedItem.name}`,
      description: lineDescription,
      orderedQty: "",
      receivedQty: lineReceivedQty || "1",
      unitPrice: effectiveUnitPrice,
      discount: draft.openingBalanceMode ? "0" : lineDiscount || "0",
      uomName: selectedItem.uomName,
      uomBase: selectedItem.uomBase,
      condition: draft.openingBalanceMode ? "Good" : lineCondition,
      requiresSerial: selectedItem.serialTrackingEnabled,
      serials: [],
    };
    updateDraft({ lines: [...draft.lines, next] });
    resetLineEntry();
  }

  function startEditLine(line: GrnLineDraft) {
    const parts = line.itemLabel.split(" · ");
    setSelectedItem({
      id: line.itemId,
      code: parts[0] ?? "",
      name: parts.slice(1).join(" · ") || line.description,
      description: "",
      price: line.unitPrice,
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomCode: "",
      uomMinQty: "1",
      serialTrackingEnabled: line.requiresSerial,
    });
    setLineDescription(line.description);
    setLineReceivedQty(line.receivedQty);
    setLineUnitPrice(line.unitPrice);
    setLineDiscount(line.discount || "0");
    setLineCondition(line.condition);
    setEditingLineId(line.id);
  }

  function cancelEdit() {
    setEditingLineId(null);
    resetLineEntry();
  }

  function updateExistingLine() {
    if (!editingLineId) return;
    const item = selectedItem;
    const existingLine = draft.lines.find((l) => l.id === editingLineId);
    const effectiveUnitPrice = lineUnitPrice || existingLine?.unitPrice || "0";
    if (draft.openingBalanceMode && decimalAmount(effectiveUnitPrice) <= 0) {
      window.alert("Rate must be greater than 0 for Opening Balance lines.");
      return;
    }
    updateDraft({
      lines: draft.lines.map((line) =>
        line.id === editingLineId
          ? {
              ...line,
              itemId: item ? item.id : line.itemId,
              itemLabel: item ? `${item.code} · ${item.name}` : line.itemLabel,
              description: lineDescription,
              receivedQty: lineReceivedQty || "0",
              unitPrice: effectiveUnitPrice,
              discount: draft.openingBalanceMode ? "0" : lineDiscount || "0",
              uomName: item ? item.uomName : line.uomName,
              uomBase: item ? item.uomBase : line.uomBase,
              condition: draft.openingBalanceMode ? "Good" : lineCondition,
              requiresSerial: item ? item.serialTrackingEnabled : line.requiresSerial,
              serials:
                item && item.serialTrackingEnabled !== line.requiresSerial ? [] : line.serials,
            }
          : line
      ),
    });
    cancelEdit();
  }

  function removeLineItem(lineId: string) {
    updateDraft({ lines: draft.lines.filter((line) => line.id !== lineId) });
    if (editingLineId === lineId) cancelEdit();
  }

  // For PO-linked lines we only let the user edit received qty / condition / batch
  function patchLine(lineId: string, patch: Partial<GrnLineDraft>) {
    updateDraft({
      lines: draft.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    });
  }

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      {/* ── Header card: mode toggle + supplier + PO link + meta ── */}
      <SurfaceCard overflow="visible">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          {/* Left: PO/supplier */}
          <div className="flex h-full flex-col gap-4">
            {/* Mode segmented control */}
            <div className="rounded-[28px] border border-dashed border-[#ffd7b9] bg-[linear-gradient(135deg,#fffaf4_0%,#fff3e8_100%)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">
                Receipt source
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-[#ffd7b9] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setMode("withPo")}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    draft.mode === "withPo"
                      ? "bg-[#ff7a12] text-white shadow-[0_10px_18px_rgba(255,122,18,0.22)]"
                      : "text-[#7c6f65] hover:bg-[#fff7f0]"
                  }`}
                >
                  <Link2 className="h-4 w-4" />
                  Linked to PO
                </button>
                <button
                  type="button"
                  onClick={() => setMode("withoutPo")}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    draft.mode === "withoutPo"
                      ? "bg-[#ff7a12] text-white shadow-[0_10px_18px_rgba(255,122,18,0.22)]"
                      : "text-[#7c6f65] hover:bg-[#fff7f0]"
                  }`}
                >
                  <Unlink className="h-4 w-4" />
                  Without PO
                </button>
              </div>

              {/* PO chooser block (only when linked-to-PO) */}
              {draft.mode === "withPo" ? (
                <div className="mt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">
                        Purchase Order
                      </p>
                      <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                        {draft.poRef ? draft.poRef.poNumber : "Select Purchase Order"}
                      </h3>
                      {!draft.poRef ? (
                        <p className="mt-1 text-sm text-[#7f746d]">
                          Pick a PO to auto-load supplier + items. You can still adjust received qty.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {draft.poRef ? (
                        <button
                          type="button"
                          onClick={unlinkPo}
                          className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ecd7cb] bg-white px-3 text-sm font-semibold text-[#c16233] transition hover:bg-[#fff5ec]"
                        >
                          <Unlink className="h-4 w-4" />
                          Unlink
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowPoPicker((cur) => !cur)}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffcfaa] bg-white text-[#ff7101] transition hover:bg-[#fff5ec]"
                        aria-label="Select PO"
                      >
                        <ClipboardList className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {draft.poRef && !showPoPicker ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        { label: "PO Date", value: draft.poRef.poDate },
                        { label: "Status", value: draft.poRef.status },
                        { label: "Currency", value: draft.poRef.currency },
                        { label: "Lines", value: String(draft.poRef.lines.length) },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-[18px] border border-[#ece2d8] bg-white/70 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">{label}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-[#1f1d1c]">{value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {showPoPicker ? (
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
                      <div className="border-b border-[#f0e5dc] p-3">
                        <label className="relative block">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                          <input
                            value={poQuery}
                            onChange={(event) => setPoQuery(event.target.value)}
                            placeholder="Search purchase orders"
                            className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
                          />
                        </label>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-2">
                        {poMatches.length ? (
                          poMatches.map((po) => {
                            const selected = draft.poRef?.id === po.id;
                            return (
                              <button
                                key={po.id}
                                type="button"
                                onClick={() => pickPo(po)}
                                className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                                  selected
                                    ? "bg-[#fff1e2] text-[#a95915]"
                                    : "text-[#5c534d] hover:bg-[#fff8f0]"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold">{po.poNumber}</span>
                                  <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">
                                    {po.supplierName} · {po.poDate} · {po.status}
                                  </span>
                                </span>
                                {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No purchase orders found.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Supplier / Opening Balance card — only visible in Without-PO mode. */}
            {!isInPoMode ? (
              <div className="flex flex-1 flex-col rounded-[28px] border border-dashed border-[#ffd7b9] bg-[linear-gradient(135deg,#fffaf4_0%,#fff3e8_100%)] p-4">
                {/* Source toggle: Supplier | Opening Balance */}
                <div className="mb-3 flex gap-1 rounded-2xl border border-[#f0e4d8] bg-white/60 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (draft.openingBalanceMode) {
                        updateDraft({ openingBalanceMode: false, openingEquityAccount: null });
                        setShowSupplierPicker(false);
                      }
                    }}
                    className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      !draft.openingBalanceMode
                        ? "bg-[#ff7101] text-white shadow-sm"
                        : "text-[#7f746d] hover:text-[#1f1d1c]"
                    }`}
                  >
                    Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!draft.openingBalanceMode) {
                        updateDraft({ openingBalanceMode: true, supplier: null });
                        setShowSupplierPicker(false);
                      }
                    }}
                    className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      draft.openingBalanceMode
                        ? "bg-[#7c3aed] text-white shadow-sm"
                        : "text-[#7f746d] hover:text-[#1f1d1c]"
                    }`}
                  >
                    Opening Balance
                  </button>
                </div>

                {!draft.openingBalanceMode ? (
                  /* ── Supplier mode ── */
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">Supplier</p>
                        <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                          {draft.supplier ? draft.supplier.name : "Add Supplier"}
                        </h3>
                        {!draft.supplier ? (
                          <p className="mt-1 text-sm text-[#7f746d]">
                            Choose a supplier to identify who delivered the goods.
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSupplierPicker((cur) => !cur)}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffcfaa] bg-white text-[#ff7101] transition hover:bg-[#fff5ec]"
                        aria-label="Select supplier"
                      >
                        <UserPlus className="h-5 w-5" />
                      </button>
                    </div>

                    {draft.supplier && !showSupplierPicker ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                          { label: "Code", value: draft.supplier.code },
                          { label: "Contact", value: draft.supplier.contact },
                          { label: "City", value: draft.supplier.city },
                          { label: "Currency", value: draft.currency || "LKR" },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-[18px] border border-[#ece2d8] bg-white/70 px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">{label}</p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#1f1d1c]">{value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showSupplierPicker ? (
                      <AsyncSupplierPicker
                        selected={draft.supplier}
                        onSelect={(supplier) => {
                          updateDraft({ supplier, currency: supplier.currency });
                          setShowSupplierPicker(false);
                        }}
                        onAddNew={() => setSupplierQuickOpen(true)}
                      />
                    ) : null}
                  </>
                ) : (
                  /* ── Opening Balance mode ── */
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">Equity Account</p>
                      <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                        {draft.openingEquityAccount ? draft.openingEquityAccount.name : "Select Account"}
                      </h3>
                      {draft.openingEquityAccount ? (
                        <p className="mt-1 font-mono text-sm text-[#7f746d]">{draft.openingEquityAccount.code}</p>
                      ) : (
                        <p className="mt-1 text-sm text-[#7f746d]">
                          Pick the Owner&apos;s Equity account to credit for this opening stock.
                        </p>
                      )}
                    </div>
                    <EquityAccountPicker
                      selected={draft.openingEquityAccount}
                      onSelect={(acc) => updateDraft({ openingEquityAccount: acc })}
                    />
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Right: meta fields */}
          <div className="grid gap-4 rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel label="GRN Number" />
                <TextInput
                  value={draft.grnNumber}
                  onChange={() => {
                    /* GRN number is auto-generated from form-ID settings */
                  }}
                  placeholder="GRN-0001"
                  disabled
                />
              </div>
              <div>
                <FieldLabel label="Receipt Date" />
                <DatePickerInput
                  value={draft.receiptDate}
                  onChange={(value) => updateDraft({ receiptDate: value })}
                  align="right"
                />
              </div>
              <div>
                <FieldLabel label="Received By" />
                <TextInput
                  value={draft.receivedBy}
                  onChange={(value) => updateDraft({ receivedBy: value })}
                  placeholder="Receiving owner"
                />
              </div>
              <div>
                <FieldLabel label="Delivery Note Ref" />
                <TextInput
                  value={draft.deliveryNoteRef}
                  onChange={(value) => updateDraft({ deliveryNoteRef: value })}
                  placeholder="DN-1023"
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel label="Vehicle / Driver" />
                <TextInput
                  value={draft.vehicleRef}
                  onChange={(value) => updateDraft({ vehicleRef: value })}
                  placeholder="Vehicle number, driver name"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <PackageCheck className="h-4 w-4 text-[#18a66a]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Lines</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.lines.length}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <Truck className="h-4 w-4 text-[#2d6df6]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Received</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{totalReceived}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <CalendarDays className="h-4 w-4 text-[#ff7101]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Variance</span>
                </div>
                <p
                  className={`mt-2 text-lg font-semibold tabular-nums ${
                    variance === 0
                      ? "text-[#1f1d1c]"
                      : variance < 0
                        ? "text-[#a4302a]"
                        : "text-[#9b6f10]"
                  }`}
                >
                  {totalOrdered ? (variance === 0 ? "0" : (variance > 0 ? `+${variance}` : variance)) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* ── Items section ── */}
      <SurfaceCard
        title="Receipt items"
        description={
          isInPoMode
            ? "Lines come from the linked PO. Adjust the received qty, condition, and batch as goods are inspected."
            : "Add the items being received. Skip the price if the receipt is for a stock movement only."
        }
        overflow="visible"
      >
        <div className="grid gap-4">
          {/* Quick-add row (manual mode) */}
          {!itemEntryDisabled ? (
            <div
              className={`grid gap-3 rounded-[24px] border p-4 xl:grid-cols-[1.1fr_0.85fr_0.5fr_0.55fr_0.55fr_0.65fr_0.6fr_auto] ${
                editingLineId ? "border-[#ffba82] bg-[#fff8f0]" : "border-[#e9dfd5] bg-[#fffaf5]"
              }`}
            >
              <div>
                <FieldLabel label="Item" />
                <AsyncItemSelect
                  selected={selectedItem}
                  onSelect={(item) => {
                    setSelectedItem(item);
                    setLineUnitPrice(item.price);
                    setLineDescription(item.name);
                  }}
                />
              </div>
              <div>
                <FieldLabel label="Description" />
                <TextInput
                  value={lineDescription}
                  onChange={setLineDescription}
                  placeholder="Item description"
                />
              </div>
              <div>
                <FieldLabel label="Received Qty" />
                <NumericInput value={lineReceivedQty} onChange={setLineReceivedQty} placeholder="1" />
              </div>
              <div>
                <FieldLabel label="Rate" />
                <NumericInput value={lineUnitPrice} onChange={setLineUnitPrice} placeholder="0.00" />
              </div>
              {!draft.openingBalanceMode ? (
                <div>
                  <FieldLabel label="Discount" />
                  <NumericInput value={lineDiscount} onChange={setLineDiscount} placeholder="0.00" />
                </div>
              ) : null}
              {!draft.openingBalanceMode ? (
                <div>
                  <FieldLabel label="Condition" />
                  <SelectInput
                    value={lineCondition}
                    onChange={(v) => setLineCondition(v as GrnLineDraft["condition"])}
                    options={["Good", "Damaged", "Short", "Excess"].map((c) => ({ value: c, label: c }))}
                  />
                </div>
              ) : null}
              <div>
                <FieldLabel label="Line total" />
                <div className="flex h-11 items-center justify-end rounded-2xl border border-[#e9dfd5] bg-white px-3 text-right text-sm font-semibold tabular-nums text-[#1f1d1c]">
                  {formatCurrency(
                    Math.max(
                      0,
                      decimalAmount(lineReceivedQty || "0") *
                        decimalAmount(lineUnitPrice || "0") -
                        (draft.openingBalanceMode ? 0 : decimalAmount(lineDiscount || "0")),
                    ),
                    draft.currency || "LKR",
                  )}
                </div>
              </div>
              <div className="flex flex-col">
                <span className="mb-2 block h-5 shrink-0" aria-hidden="true" />
                <button
                  type="button"
                  onClick={editingLineId ? updateExistingLine : addLineItem}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff7a12] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
                >
                  {editingLineId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingLineId ? "Update" : "Add Item"}
                </button>
                {editingLineId ? (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border border-[#dfd4ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#6f665f] transition hover:bg-[#f5f0ec]"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Lines table */}
          <div className="overflow-hidden rounded-[24px] border border-[#ddd8d1] bg-white">
            {draft.lines.length ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[1180px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[13%]" />
                      <col className="w-[6%]" />
                      <col className="w-[8%]" />
                      <col className="w-[6%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[9%]" />
                      <col className="w-[5%]" />
                    </colgroup>
                    <thead className="bg-[#faf6f1]">
                      <tr className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f7e72]">
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Description</th>
                        <th className="px-4 py-3 text-right">Ordered</th>
                        <th className="px-4 py-3 text-right">Received</th>
                        <th className="px-4 py-3 text-center">Variance</th>
                        <th className="px-4 py-3 text-left">Condition</th>
                        <th className="px-4 py-3 text-left">Batch / Serial</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Discount</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-3 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line, index) => {
                        const v = variancePill(line.orderedQty, line.receivedQty);
                        return (
                          <tr
                            key={line.id}
                            className={`border-t border-[#ece6df] text-sm text-[#1f1d1c] ${
                              editingLineId === line.id
                                ? "bg-[#fff8f0] ring-2 ring-inset ring-[#ffba82]"
                                : index % 2 === 0
                                  ? "bg-white"
                                  : "bg-[#fffcf9]"
                            }`}
                          >
                            <td className="px-4 py-3 align-middle">
                              <p className="font-semibold leading-5">{line.itemLabel}</p>
                              <p className="mt-0.5 text-[11px] text-[#9a8f85]">
                                {line.uomBase || line.uomName}
                              </p>
                            </td>
                            <td className="px-4 py-3 align-middle text-[#776d66]">
                              <p className="leading-5">{line.description}</p>
                            </td>
                            <td className="px-4 py-3 text-right align-middle tabular-nums text-[#776d66]">
                              {line.orderedQty || "—"}
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.receivedQty}
                                onChange={(event) => {
                                  const raw = event.target.value.replace(/[^0-9.]/g, "");
                                  patchLine(line.id, { receivedQty: raw });
                                }}
                                className="w-full rounded-xl border border-[#dfd4ca] bg-white px-3 py-2 text-right text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                              />
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.className}`}
                              >
                                {v.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <ConditionSelect
                                value={line.condition}
                                onChange={(next) => patchLine(line.id, { condition: next })}
                              />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <BatchSerialCell
                                line={line}
                                onOpenSerialModal={() => setSerialModalLineId(line.id)}
                              />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.unitPrice}
                                onChange={(event) => {
                                  const raw = event.target.value.replace(/[^0-9.]/g, "");
                                  patchLine(line.id, { unitPrice: raw });
                                }}
                                className="w-full rounded-xl border border-[#dfd4ca] bg-white px-3 py-2 text-right text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                              />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.discount}
                                onChange={(event) => {
                                  const raw = event.target.value.replace(/[^0-9.]/g, "");
                                  patchLine(line.id, { discount: raw });
                                }}
                                className="w-full rounded-xl border border-[#dfd4ca] bg-white px-3 py-2 text-right text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                              />
                            </td>
                            <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums">
                              {formatCurrency(
                                Math.max(
                                  0,
                                  decimalAmount(line.receivedQty) * decimalAmount(line.unitPrice) -
                                    Math.max(0, decimalAmount(line.discount))
                                ),
                                draft.currency
                              )}
                            </td>
                            <td className="px-3 py-3 text-right align-middle">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isInPoMode ? (
                                  <button
                                    type="button"
                                    onClick={() => startEditLine(line)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d7e2f5] bg-[#f1f5ff] text-[#3262c9] transition hover:bg-[#e5edff]"
                                    aria-label="Edit line"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                ) : null}
                                {!isInPoMode ? (
                                  <button
                                    type="button"
                                    onClick={() => removeLineItem(line.id)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ecd7cb] bg-[#fff7f1] text-[#c16233] transition hover:bg-[#fff0e5]"
                                    aria-label="Remove line"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card view */}
                <div className="grid gap-3 p-3 md:hidden">
                  {draft.lines.map((line) => {
                    const v = variancePill(line.orderedQty, line.receivedQty);
                    return (
                      <div
                        key={line.id}
                        className={`rounded-[20px] border p-4 ${
                          editingLineId === line.id
                            ? "border-[#ffba82] bg-[#fff8f0]"
                            : "border-[#ece6df] bg-[#fffcf9]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1f1d1c]">{line.itemLabel}</p>
                            <p className="mt-1 text-sm leading-5 text-[#776d66]">{line.description}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {!isInPoMode ? (
                              <button
                                type="button"
                                onClick={() => startEditLine(line)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d7e2f5] bg-[#f1f5ff] text-[#3262c9]"
                                aria-label="Edit line"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            ) : null}
                            {!isInPoMode ? (
                              <button
                                type="button"
                                onClick={() => removeLineItem(line.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ecd7cb] bg-[#fff7f1] text-[#c16233]"
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-2xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                              Ordered
                            </p>
                            <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">
                              {line.orderedQty || "—"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                              Received
                            </p>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.receivedQty}
                              onChange={(event) => {
                                const raw = event.target.value.replace(/[^0-9.]/g, "");
                                patchLine(line.id, { receivedQty: raw });
                              }}
                              className="mt-1 w-full rounded-lg border border-[#dfd4ca] bg-white px-2 py-1 text-sm font-semibold tabular-nums text-[#1f1d1c] outline-none focus:border-[#ffba82]"
                            />
                          </div>
                          <div className="col-span-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.className}`}
                            >
                              {v.label}
                            </span>
                          </div>
                          {line.requiresSerial && (
                            <div className="col-span-2">
                              <BatchSerialCell
                                line={line}
                                onOpenSerialModal={() => setSerialModalLineId(line.id)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3 bg-white px-4 py-10 text-sm text-[#7d736b]">
                <PackagePlus className="h-5 w-5 text-[#ff7101]" />
                {isInPoMode
                  ? "Link a PO to load receipt lines."
                  : "No items added yet. Use the quick add row above."}
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* ── Notes / Summary ── */}
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SurfaceCard title="Receipt notes" description="Pickup remarks, packaging condition, and follow-ups for this receipt.">
          <TextArea
            value={draft.notes}
            onChange={(value) => updateDraft({ notes: value })}
            placeholder="Receiving desk notes, packaging condition, follow-ups."
            rows={6}
          />
        </SurfaceCard>

        <SurfaceCard title="Receipt summary" description="Live summary computed from the receipt lines.">
          <div className="rounded-[24px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-sm text-[#6f665f]">
                <span>Total ordered qty</span>
                <span className="font-semibold tabular-nums text-[#1f1d1c]">
                  {totalOrdered || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#6f665f]">
                <span>Total received qty</span>
                <span className="font-semibold tabular-nums text-[#1f1d1c]">{totalReceived}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[#6f665f]">Variance</span>
                <span
                  className={`font-semibold tabular-nums ${
                    !totalOrdered
                      ? "text-[#1f1d1c]"
                      : variance === 0
                        ? "text-[#176d39]"
                        : variance < 0
                          ? "text-[#a4302a]"
                          : "text-[#9b6f10]"
                  }`}
                >
                  {totalOrdered ? (variance === 0 ? "0" : variance > 0 ? `+${variance}` : variance) : "—"}
                </span>
              </div>
              {totalDiscount > 0 ? (
                <>
                  <div className="flex items-center justify-between text-sm text-[#6f665f]">
                    <span>Subtotal (gross)</span>
                    <span className="font-semibold tabular-nums text-[#1f1d1c]">
                      {formatCurrency(grossSubtotal, draft.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[#6f665f]">
                    <span>Total discount</span>
                    <span className="font-semibold tabular-nums text-[#a4302a]">
                      − {formatCurrency(totalDiscount, draft.currency)}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between rounded-[20px] border border-[#ffd6b8] bg-white px-4 py-4">
                <span className="text-base font-semibold text-[#1f1d1c]">Receipt value</span>
                <span className="font-sans text-2xl font-semibold tracking-[-0.03em] text-[#ff7101]">
                  {formatCurrency(subtotal, draft.currency)}
                </span>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <SerialEntryModal
        open={serialModalLineId !== null}
        line={serialModalLine}
        onClose={() => setSerialModalLineId(null)}
        onSave={(serials) => {
          if (!serialModalLineId) return;
          patchLine(serialModalLineId, { serials });
        }}
      />

      {/* Quick-add supplier popup. After save the new supplier is
          shaped to GrnSupplierOption and auto-selected on the draft,
          mirroring the regular AsyncSupplierPicker.onSelect flow. */}
      <SupplierQuickCreateModal
        open={supplierQuickOpen}
        onClose={() => setSupplierQuickOpen(false)}
        onCreated={(supplier) => {
          updateDraft({
            supplier: {
              id: supplier.id,
              code: supplier.supplierCode,
              name: supplier.supplierName,
              contact: "",
              city: "",
              currency: draft.currency || "LKR",
            },
          });
          setShowSupplierPicker(false);
        }}
      />
    </form>
  );
}
