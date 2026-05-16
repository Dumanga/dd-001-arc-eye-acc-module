"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { useOpenPreviewFromUrl } from "@/components/accounting/use-open-preview-from-url";
import {
  AccountingPageIntro,
  DataTable,
  PremiumMetricGrid,
  StatusToast,
  SurfaceCard,
  type ToastState,
} from "@/components/accounting/accounting-ui";
import type { PvGrnOption } from "@/app/api/accounting/goods-receipts/pv-options/route";
import type {
  PaymentVoucherListItem,
  PaymentVoucherKpis,
} from "@/app/api/accounting/payment-vouchers/route";
import type { ApiResponse } from "@/lib/api/response";
import type { SupplierRecord, SuppliersPayload } from "@/lib/accounting/supplier-types";
import { PaymentVoucherPreview } from "@/components/accounting/payment-voucher-preview";
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { BranchFilter } from "@/components/accounting/branch-filter";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";

const PAYMENT_FORM_ID = "supplier-payment-voucher-form";
const PAYMENT_LIST_PAGE_SIZE = 10;
const SUPPLIER_LOOKUP_PAGE_SIZE = 20;

type SupplierOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

type PaymentMethod = "Bank Transfer" | "Cheque" | "Cash" | "Online Transfer";

const METHOD_TO_API: Record<PaymentMethod, string> = {
  "Bank Transfer": "BANK_TRANSFER",
  Cheque: "CHEQUE",
  Cash: "CASH",
  "Online Transfer": "ONLINE_TRANSFER",
};

type AllocationLine = {
  id: string;
  grnId: string;
  grnNumber: string;
  grnDate: string;
  dueDate: string;
  totalAmount: string;
  payableAmount: string;
  payingAmount: string;
  discount: string;
  notes: string;
};

type VoucherDraft = {
  voucherNo: string;
  supplierId: string;
  voucherDate: string;
  method: PaymentMethod;
  currency: string;
  preparedBy: string;
  reference: string;
  payFromAccountId: string;
  chequeNo: string;
  notes: string;
  allocations: AllocationLine[];
};

type AccountOption = {
  id: string;
  label: string;
};

type FormIdConfig = {
  formType: string;
  code: string;
  yearToken: string;
  nextNumber: string;
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; voucherId: string };

const fallbackSuppliers: SupplierOption[] = [
  {
    id: "supplier-royal",
    code: "SUP-001",
    name: "Royal Sports House",
    contact: "+94 77 245 1188",
    city: "Colombo 03",
    currency: "LKR",
  },
  {
    id: "supplier-willow",
    code: "SUP-002",
    name: "Willow Works Lanka",
    contact: "+94 71 884 1290",
    city: "Maharagama",
    currency: "LKR",
  },
  {
    id: "supplier-edge",
    code: "SUP-003",
    name: "Edge Line Imports",
    contact: "+94 76 551 2091",
    city: "Kandy",
    currency: "LKR",
  },
];

const fallbackPayFromAccounts: AccountOption[] = [
  { id: "cash-on-hand", label: "ACCH001 CASH ON HAND" },
];

function buildLocalDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildVoucherNo(config: FormIdConfig | null) {
  if (!config) return "PV-0001";
  return [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()]
    .filter(Boolean)
    .join("-");
}

function currency(value: number, currencyCode = "LKR") {
  return `${currencyCode} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function decimalAmount(value: string) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sanitizeDecimal(value: string) {
  const raw = value.replace(/[^0-9.]/g, "");
  const parts = raw.split(".");
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
}

function formatPhone(dialCode: string, localNumber: string) {
  const dial = dialCode.trim();
  const local = localNumber.trim();
  if (!dial && !local) return "";
  if (!dial) return local;
  return `${dial} ${local}`;
}

function mapSupplierRecord(record: SupplierRecord): SupplierOption {
  return {
    id: record.id,
    code: record.supplierCode,
    name: record.supplierName,
    contact: formatPhone(record.primaryMobileDialCode, record.primaryMobile),
    city: record.city || "-",
    currency: record.currency || "LKR",
  };
}

function mergeSupplierOptions(current: SupplierOption[], incoming: SupplierOption[]) {
  const next = [...current];
  const existingIds = new Set(next.map((supplier) => supplier.id));

  for (const supplier of incoming) {
    if (!existingIds.has(supplier.id)) {
      next.push(supplier);
      existingIds.add(supplier.id);
    }
  }

  return next;
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload.data as T;
}

function createAllocationFromGrn(grn: PvGrnOption): AllocationLine {
  // payingAmount = payableAmount - discount (theory § 2.2). With discount = 0
  // initially, paying equals payable. The default payable is the GRN's
  // remaining outstanding (GRN total − approved returns − approved PV
  // allocations), not the original receipt value, so partially-settled GRNs
  // pre-fill with the correct number.
  return {
    id: `allocation-${grn.id}-${Date.now()}`,
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    grnDate: grn.receiptDate,
    dueDate: grn.dueDate,
    totalAmount: grn.receiptValue,
    payableAmount: grn.remainingPayable,
    payingAmount: grn.remainingPayable,
    discount: "0",
    notes: grn.notes || "",
  };
}

function createInitialDraft(voucherNo: string): VoucherDraft {
  return {
    voucherNo,
    supplierId: "",
    voucherDate: buildLocalDate(0),
    method: "Bank Transfer",
    currency: "LKR",
    preparedBy: "",
    reference: "",
    payFromAccountId: "",
    chequeNo: "",
    notes: "",
    allocations: [],
  };
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-2 block text-sm font-semibold text-[#4b433d]">{label}</label>;
}

const inputClass =
  "min-h-12 w-full rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]";

function TextInput({
  value,
  onChange,
  placeholder,
  disabled = false,
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
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${disabled ? "bg-[#f7f1eb] text-[#786f69]" : ""}`}
    />
  );
}

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatCalendarValue(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatCalendarDisplay(value: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return "Select date";

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = firstDayOfMonth.getDay();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function DateInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseCalendarDate(value);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const monthDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => new Date(), []);
  const todayValue = formatCalendarValue(today);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 300 && spaceAbove > spaceBelow;
      const panelHeight = 306;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - 32);
      const left = Math.min(Math.max(16, rect.left), viewportWidth - width - 16);
      const rawTop = openUpward ? rect.top - panelHeight - 8 : rect.bottom + 8;
      const top = Math.min(Math.max(16, rawTop), viewportHeight - panelHeight - 16);

      setPanelStyle({
        left,
        top,
        width,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  function moveMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function moveYear(offset: number) {
    setViewDate((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (!open) setViewDate(selectedDate ?? new Date());
            setOpen((current) => !current);
          }
        }}
        className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#dfd4ca] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{formatCalendarDisplay(value)}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#7f746c]" />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-[18px] border border-[#e7ddd4] bg-white shadow-[0_18px_42px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="border-b border-[#efe4db] bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1f1d1c]">{getMonthLabel(viewDate)}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveYear(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Previous year"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMonth(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMonth(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveYear(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                      aria-label="Next year"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold uppercase text-[#8e7f72]">
                  {calendarWeekdays.map((weekday) => (
                    <div key={weekday} className="py-0.5">
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-0.5">
                  {monthDays.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="h-7" />;
                    const dayValue = formatCalendarValue(day);
                    const isSelected = value === dayValue;
                    const isToday = todayValue === dayValue;

                    return (
                      <button
                        key={dayValue}
                        type="button"
                        onClick={() => {
                          onChange(dayValue);
                          setOpen(false);
                        }}
                        className={`flex h-7 items-center justify-center rounded-lg text-sm transition ${
                          isSelected
                            ? "bg-[#ff7a12] font-semibold text-white shadow-[0_8px_16px_rgba(255,122,18,0.22)]"
                            : isToday
                              ? "border border-[#ffd6b7] bg-[#fff4ea] font-semibold text-[#b45b12]"
                              : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#efe4db] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(todayValue);
                      setViewDate(today);
                    }}
                    className="text-sm font-semibold text-[#b45b12] transition hover:text-[#ff7101]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center rounded-xl border border-[#e7ddd4] bg-white px-3 py-1 text-sm font-semibold text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(sanitizeDecimal(event.target.value))}
      placeholder={placeholder}
      className={`${inputClass} text-right tabular-nums`}
    />
  );
}

function ReadOnlyValue({
  value,
  align = "left",
}: {
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`min-h-12 rounded-2xl border border-[#e6ddd5] bg-[#f7f1eb] px-4 py-3 text-sm font-medium text-[#5f5750] ${
        align === "right" ? "text-right tabular-nums" : ""
      }`}
    >
      {value || "-"}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; detail?: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const preferredHeight = 220;
      const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(preferredHeight, (openUpward ? spaceAbove : spaceBelow) - 8));
      const width = Math.min(Math.max(rect.width, 260), viewportWidth - 32);
      const left = Math.min(Math.max(16, rect.left), viewportWidth - width - 16);
      const rawTop = openUpward ? rect.top - maxHeight - 8 : rect.bottom + 8;
      const top = Math.min(Math.max(16, rawTop), viewportHeight - maxHeight - 16);

      setPanelStyle({
        left,
        top,
        width,
        maxHeight,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#dfd4ca] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className={`block truncate ${selectedOption ? "text-[#1f1d1c]" : "text-[#a2978c]"}`}>
            {selectedOption?.label ?? placeholder}
          </span>
          {selectedOption?.detail ? (
            <span className="mt-0.5 block truncate text-xs text-[#786f69]">{selectedOption.detail}</span>
          ) : null}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#7f746c] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
              role="listbox"
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {options.length ? (
                  options.map((option) => {
                    const selected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                          selected
                            ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                            : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option.label}</span>
                          {option.detail ? (
                            <span className="mt-0.5 block truncate text-xs font-normal text-[#786f69]">{option.detail}</span>
                          ) : null}
                        </span>
                        {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#e7ddd4] bg-[#fcfbf9] px-3 py-5 text-center text-sm text-[#786f69]">
                    No options available.
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function SupplierSelect({
  value,
  onChange,
  options,
  query,
  onQueryChange,
  onLoadMore,
  hasMore,
  loading,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SupplierOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedOption = options.find((option) => option.id === value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const preferredHeight = 320;
      const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(preferredHeight, (openUpward ? spaceAbove : spaceBelow) - 8));
      const width = Math.min(Math.max(rect.width, 320), viewportWidth - 32);
      const left = Math.min(Math.max(16, rect.left), viewportWidth - width - 16);
      const rawTop = openUpward ? rect.top - maxHeight - 8 : rect.bottom + 8;
      const top = Math.min(Math.max(16, rawTop), viewportHeight - maxHeight - 16);

      setPanelStyle({ left, top, width, maxHeight });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    const focusId = window.setTimeout(() => searchRef.current?.focus(), 0);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 40;
    if (nearBottom && hasMore && !loading) onLoadMore();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm outline-none transition ${
          open
            ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
            : "border-[#dfd4ca] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className={`block truncate ${selectedOption ? "text-[#1f1d1c]" : "text-[#a2978c]"}`}>
            {selectedOption ? `${selectedOption.code} - ${selectedOption.name}` : placeholder}
          </span>
          {selectedOption ? (
            <span className="mt-0.5 block truncate text-xs text-[#786f69]">
              {selectedOption.city} | {selectedOption.contact || "No contact"} | {selectedOption.currency}
            </span>
          ) : null}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#7f746c] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-[20px] border border-[#e7ddd4] bg-white shadow-[0_18px_42px_rgba(31,29,28,0.14)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
              role="listbox"
            >
              <div className="border-b border-[#f0e5dc] p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Search suppliers"
                    className="h-10 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>
              </div>

              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight - 66 }} onScroll={handleScroll}>
                {options.length ? (
                  options.map((supplier) => {
                    const selected = supplier.id === value;
                    return (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => {
                          onChange(supplier.id);
                          onQueryChange("");
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                          selected
                            ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                            : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{supplier.code} - {supplier.name}</span>
                          <span className="mt-0.5 block truncate text-xs font-normal text-[#786f69]">
                            {supplier.city} | {supplier.contact || "No contact"} | {supplier.currency}
                          </span>
                        </span>
                        {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#e7ddd4] bg-[#fcfbf9] px-3 py-5 text-center text-sm text-[#786f69]">
                    {loading ? "Loading suppliers..." : "No suppliers found."}
                  </div>
                )}
                {loading && options.length ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#8e7f72]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading
                  </div>
                ) : null}
                {!loading && hasMore ? (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="mt-1 w-full rounded-xl border border-[#eadfd5] bg-[#fffaf5] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9b5b24] transition hover:border-[#ffba82] hover:bg-white"
                  >
                    Load more suppliers
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="w-full resize-none rounded-2xl border border-[#dfd4ca] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a1968c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

function StatusBadge({ statusKey, label }: { statusKey: string; label: string }) {
  const classes =
    statusKey === "APPROVED"
      ? "border-[#c7ead7] bg-[#effaf3] text-[#1f7a50]"
      : statusKey === "CANCELLED"
        ? "border-[#f3c4bb] bg-[#fff3f0] text-[#b94f37]"
        : "border-[#f4dfc8] bg-[#fff7ec] text-[#9a5a15]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

const INITIAL_KPIS: PaymentVoucherKpis = {
  totalVouchers: 0,
  drafts: 0,
  approved: 0,
  approvedValueLkr: "0.00",
};

export function SupplierPaymentsScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });

  // Pending Forms inbox deep-links here with ?id=<voucherId>.
  useOpenPreviewFromUrl((voucherId) =>
    setScreenState({ mode: "preview", voucherId }),
  );

  const [voucherRows, setVoucherRows] = useState<PaymentVoucherListItem[]>([]);
  const [voucherKpis, setVoucherKpis] = useState<PaymentVoucherKpis>(INITIAL_KPIS);
  const [voucherListLoading, setVoucherListLoading] = useState(false);
  const [voucherListError, setVoucherListError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(fallbackSuppliers);
  const [payFromAccounts, setPayFromAccounts] = useState<AccountOption[]>(fallbackPayFromAccounts);
  const [grnOptions, setGrnOptions] = useState<PvGrnOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierLookupLoading, setSupplierLookupLoading] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierHasMore, setSupplierHasMore] = useState(false);
  const [allocationPickerOpen, setAllocationPickerOpen] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draft, setDraft] = useState<VoucherDraft>(() =>
    createInitialDraft("PV-0001")
  );
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();
  const topRef = useRef<HTMLDivElement | null>(null);
  const supplierRequestIdRef = useRef(0);

  const loadVoucherList = useCallback(async () => {
    setVoucherListLoading(true);
    setVoucherListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/payment-vouchers?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/payment-vouchers";
      const res = await fetch(url, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: PaymentVoucherListItem[]; kpis: PaymentVoucherKpis } | null;
      };
      if (payload.success && payload.data) {
        setVoucherRows(payload.data.items);
        setVoucherKpis(payload.data.kpis);
      } else {
        setVoucherListError("Failed to load payment vouchers.");
      }
    } catch {
      setVoucherListError("Network error. Check your connection and try again.");
    } finally {
      setVoucherListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadVoucherList();
  }, [loadVoucherList]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === draft.supplierId) ?? null;
  const selectedAllocationIds = useMemo(
    () => new Set(draft.allocations.map((line) => line.grnId)),
    [draft.allocations]
  );
  const supplierGrns = useMemo(
    () =>
      selectedSupplier
        ? grnOptions.filter(
            (grn) =>
              grn.supplierId === selectedSupplier.id &&
              grn.status === "APPROVED" &&
              !selectedAllocationIds.has(grn.id)
          )
        : [],
    [grnOptions, selectedAllocationIds, selectedSupplier]
  );
  const allocationTotal = draft.allocations.reduce(
    (sum, line) => sum + decimalAmount(line.payingAmount),
    0
  );
  const discountTotal = draft.allocations.reduce(
    (sum, line) => sum + decimalAmount(line.discount),
    0
  );
  const payableTotal = draft.allocations.reduce(
    (sum, line) => sum + decimalAmount(line.payableAmount),
    0
  );

  const loadSupplierPage = useCallback(
    async (query: string, page: number, replace: boolean) => {
      const requestId = supplierRequestIdRef.current + 1;
      supplierRequestIdRef.current = requestId;
      setSupplierLookupLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(SUPPLIER_LOOKUP_PAGE_SIZE),
          sort: "code-asc",
        });
        const normalizedQuery = query.trim();
        if (normalizedQuery) params.set("query", normalizedQuery);

        const payload = await requestJson<SuppliersPayload>(`/api/accounting/suppliers?${params.toString()}`, {
          headers: { "x-portal": "ACCOUNTING" },
        });

        if (supplierRequestIdRef.current !== requestId) return;

        const incomingSuppliers = payload.items.map(mapSupplierRecord);
        setSuppliers((current) => {
          if (!replace) return mergeSupplierOptions(current, incomingSuppliers);
          const selectedSupplierInCurrent = current.find((supplier) => supplier.id === draft.supplierId);
          return selectedSupplierInCurrent
            ? mergeSupplierOptions([selectedSupplierInCurrent], incomingSuppliers)
            : incomingSuppliers;
        });
        setSupplierPage(payload.page);
        setSupplierHasMore(payload.page < payload.totalPages);
      } finally {
        if (supplierRequestIdRef.current === requestId) {
          setSupplierLookupLoading(false);
        }
      }
    },
    [draft.supplierId]
  );

  const loadSupplierData = useCallback(async () => {
    setSuppliersLoading(true);
    setSupplierLookupLoading(true);
    setDataError(null);
    try {
      const [suppliersPayload, formIdsPayload, remarksPayload, accountsPayload, grnsPayload] = await Promise.all([
        requestJson<SuppliersPayload>(
          `/api/accounting/suppliers?page=1&limit=${SUPPLIER_LOOKUP_PAGE_SIZE}&sort=code-asc`,
          {
            headers: { "x-portal": "ACCOUNTING" },
          }
        ),
        requestJson<{ items: FormIdConfig[] }>("/api/accounting/settings/form-ids", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        requestJson<{ items: { documentType: string; content: string }[] }>("/api/accounting/settings/remarks", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        requestJson<{ items: AccountOption[] }>(
          "/api/accounting/accounts/options?category=ASSET&type=CASH_AND_CASH_EQUIVALENTS&limit=50",
          { headers: { "x-portal": "ACCOUNTING" } }
        ),
        // Use the PV-specific options endpoint so the picker only sees GRNs
        // that still have outstanding payable (GRN total minus approved
        // returns minus approved PV allocations) and the form can default
        // each line's payable to the remaining amount, not the full receipt.
        requestJson<{ items: PvGrnOption[] }>("/api/accounting/goods-receipts/pv-options", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
      ]);

      const loadedSuppliers =
        suppliersPayload.items.length
          ? suppliersPayload.items.map(mapSupplierRecord)
          : fallbackSuppliers;
      const pvConfig =
        formIdsPayload.items.find((item) => item.formType === "PV") ?? null;
      const supplierPaymentRemark =
        remarksPayload.items.find((item) => item.documentType === "SUPPLIER_PAYMENT")?.content ?? "";
      const loadedPayFromAccounts = accountsPayload.items.length ? accountsPayload.items : fallbackPayFromAccounts;

      setSuppliers(loadedSuppliers.length ? loadedSuppliers : fallbackSuppliers);
      setSupplierQuery("");
      setSupplierPage(suppliersPayload.page);
      setSupplierHasMore(suppliersPayload.page < suppliersPayload.totalPages);
      setPayFromAccounts(loadedPayFromAccounts);
      setGrnOptions(grnsPayload.items);
      setDraft({
        ...createInitialDraft(buildVoucherNo(pvConfig) || "PV-0001"),
        payFromAccountId: loadedPayFromAccounts[0]?.id ?? "",
        notes: supplierPaymentRemark,
      });
    } catch {
      setSuppliers(fallbackSuppliers);
      setSupplierQuery("");
      setSupplierPage(1);
      setSupplierHasMore(false);
      setPayFromAccounts(fallbackPayFromAccounts);
      setGrnOptions([]);
      setDraft({
        ...createInitialDraft("PV-0001"),
        payFromAccountId: fallbackPayFromAccounts[0]?.id ?? "",
      });
      setDataError("Unable to load live supplier/payment settings. The voucher form is using fallback options.");
    } finally {
      setSuppliersLoading(false);
      setSupplierLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (screenState.mode !== "create" || suppliersLoading) return;
    const timeoutId = window.setTimeout(() => {
      void loadSupplierPage(supplierQuery, 1, true).catch(() => {
        setDataError("Unable to search suppliers. Try again or use the loaded supplier options.");
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [loadSupplierPage, screenState.mode, supplierQuery, suppliersLoading]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (screenState.mode === "list") return;
    const frameId = window.requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  function updateDraft(patch: Partial<VoucherDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setScreenState({ mode: "create" });
    void loadSupplierData();
  }

  function closeToList() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  function updateAllocation(id: string, patch: Partial<AllocationLine>) {
    updateDraft({
      allocations: draft.allocations.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        // Paying is always derived: Paying = max(0, Payable - Discount).
        // The payable is the amount of supplier payable being cleared by this
        // line; the discount is the supplier savings; the rest is cash out.
        // See accounting-theories.md § 2.2.
        const payable = decimalAmount(next.payableAmount);
        const discount = decimalAmount(next.discount);
        const paying = Math.max(0, payable - discount);
        return { ...next, payingAmount: paying.toFixed(2) };
      }),
    });
  }

  function openAllocationPicker() {
    if (!selectedSupplier) {
      setToast({ tone: "error", message: "Select a supplier before adding payable allocations." });
      return;
    }
    setAllocationPickerOpen(true);
  }

  function addGrnAllocation(grn: PvGrnOption) {
    updateDraft({
      allocations: [...draft.allocations, createAllocationFromGrn(grn)],
    });
  }

  function removeAllocationLine(id: string) {
    updateDraft({ allocations: draft.allocations.filter((line) => line.id !== id) });
  }

  function handleSupplierChange(supplierId: string) {
    const supplier = suppliers.find((item) => item.id === supplierId);
    updateDraft({
      supplierId,
      currency: supplier?.currency ?? "LKR",
      allocations: [],
    });
    setAllocationPickerOpen(false);
  }

  async function handleCreateVoucher(currentDraft: VoucherDraft) {
    if (!selectedSupplier) {
      setToast({ tone: "error", message: "Select a supplier before creating the voucher." });
      return;
    }
    if (!currentDraft.preparedBy.trim()) {
      setToast({ tone: "error", message: "Add the prepared-by user before creating the voucher." });
      return;
    }
    if (!currentDraft.payFromAccountId) {
      setToast({ tone: "error", message: "Select the cash or bank account used for the payment." });
      return;
    }
    if (!currentDraft.allocations.length || allocationTotal <= 0) {
      setToast({ tone: "error", message: "Add at least one payable line with a payment amount." });
      return;
    }

    setSaving(true);

    try {
      const body = {
        voucherNumber: currentDraft.voucherNo,
        supplierId: selectedSupplier.id,
        ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
        payFromAccountId: currentDraft.payFromAccountId,
        voucherDate: currentDraft.voucherDate,
        method: METHOD_TO_API[currentDraft.method],
        currency: currentDraft.currency,
        preparedBy: currentDraft.preparedBy.trim(),
        reference: currentDraft.reference,
        chequeNo: currentDraft.chequeNo,
        notes: currentDraft.notes,
        allocations: currentDraft.allocations.map((line, idx) => ({
          goodsReceiptId: line.grnId || null,
          grnNumber: line.grnNumber,
          grnDate: line.grnDate || null,
          dueDate: line.dueDate || null,
          totalAmount: line.totalAmount || "0",
          payableAmount: line.payableAmount || "0",
          payingAmount: line.payingAmount || "0",
          discount: line.discount || "0",
          notes: line.notes,
          lineOrder: idx,
        })),
      };

      const res = await fetch("/api/accounting/payment-vouchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; voucherNumber: string } | null;
        message?: string;
      };

      if (payload.success && payload.data) {
        const createdId = payload.data.id;
        void loadVoucherList();
        setToast({
          tone: "success",
          message: `Voucher ${payload.data.voucherNumber} saved successfully.`,
        });
        setAllocationPickerOpen(false);
        setScreenState({ mode: "preview", voucherId: createdId });
      } else {
        setToast({
          tone: "error",
          message: payload.message ?? "Failed to save voucher.",
        });
      }
    } catch {
      setToast({ tone: "error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return voucherRows;
    return voucherRows.filter((row) =>
      [
        row.voucherNumber,
        row.supplierName,
        row.supplierCode,
        row.methodLabel,
        row.statusLabel,
        row.preparedBy,
        row.reference,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [voucherRows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAYMENT_LIST_PAGE_SIZE));
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * PAYMENT_LIST_PAGE_SIZE,
    currentPage * PAYMENT_LIST_PAGE_SIZE
  );
  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const paginationSummary = filteredRows.length
    ? `Showing ${(currentPage - 1) * PAYMENT_LIST_PAGE_SIZE + 1}-${Math.min(
        currentPage * PAYMENT_LIST_PAGE_SIZE,
        filteredRows.length
      )} of ${filteredRows.length} vouchers`
    : "Showing 0-0 of 0 vouchers";

  const metrics = [
    {
      label: "Vouchers",
      value: String(voucherKpis.totalVouchers).padStart(2, "0"),
      detail: "Supplier payment vouchers in the working register.",
      icon: ReceiptText,
      tone: "amber" as const,
    },
    {
      label: "Drafts",
      value: String(voucherKpis.drafts).padStart(2, "0"),
      detail: "Vouchers still being prepared before approval.",
      icon: FileText,
      tone: "blue" as const,
    },
    {
      label: "Approved",
      value: String(voucherKpis.approved).padStart(2, "0"),
      detail: "Payment vouchers approved and posted to ledgers.",
      icon: CheckCircle2,
      tone: "green" as const,
    },
    {
      label: "Approved Value",
      value: currency(Number(voucherKpis.approvedValueLkr), "LKR").replace(".00", ""),
      detail: "Total LKR value of approved vouchers in this register.",
      icon: WalletCards,
      tone: "violet" as const,
    },
  ];

  const methodOptions: Array<{ value: PaymentMethod; label: PaymentMethod }> = [
    { value: "Bank Transfer", label: "Bank Transfer" },
    { value: "Cheque", label: "Cheque" },
    { value: "Cash", label: "Cash" },
    { value: "Online Transfer", label: "Online Transfer" },
  ];
  const payFromAccountOptions = payFromAccounts.map((account) => ({
    value: account.id,
    label: account.label,
  }));
  const handleLoadMoreSuppliers = useCallback(() => {
    if (supplierLookupLoading || !supplierHasMore) return;
    void loadSupplierPage(supplierQuery, supplierPage + 1, false).catch(() => {
      setDataError("Unable to load more suppliers. Try searching again.");
    });
  }, [loadSupplierPage, supplierHasMore, supplierLookupLoading, supplierPage, supplierQuery]);
  const grnSelectOptions = grnOptions
    .filter((grn) => selectedSupplier && grn.supplierId === selectedSupplier.id && grn.status === "APPROVED")
    .map((grn) => ({
      value: grn.id,
      label: grn.grnNumber,
      detail: `${formatCalendarDisplay(grn.receiptDate)} | Remaining ${currency(Number(grn.remainingPayable), grn.currency)}`,
    }));

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";

  const tableColumns = [
    "Voucher",
    "Supplier",
    "Method",
    "Voucher Date",
    "Prepared By",
    ...(showBranchColumn ? ["Branch"] : []),
    "Status",
    "Amount",
  ].map((label) => ({ key: label, label }));

  const tableRows = paginatedRows.map((row) => ({
    id: row.id,
    Voucher: row.voucherNumber,
    Supplier: `${row.supplierCode} - ${row.supplierName}`,
    Method: row.methodLabel,
    "Voucher Date": row.voucherDate,
    "Prepared By": row.preparedBy,
    ...(showBranchColumn ? { Branch: row.storeCode } : {}),
    Status: <StatusBadge statusKey={row.status} label={row.statusLabel} />,
    Amount: currency(Number(row.paymentTotal), row.currency),
  }));

  const intro = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "SUPPLIERS / PAYMENTS / CREATE",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeToList}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={PAYMENT_FORM_ID}
              disabled={saving || suppliersLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating..." : "Create Voucher"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return { eyebrow: "SUPPLIERS / PAYMENTS / PREVIEW" };
    }

    return {
      eyebrow: "SUPPLIERS / PAYMENTS",
      title: "Supplier payment vouchers.",
      action: (
        <BranchAwareCreateButton
          label="Create Voucher"
          viewer={viewer}
          branches={activeBranches}
          loading={viewerLoading}
          onCreate={openCreateMode}
        />
      ),
    };
  })();

  return (
    <>
      <div ref={topRef}>
        <AccountingPageIntro
          eyebrow={intro.eyebrow}
          title={"title" in intro ? intro.title : undefined}
          action={"action" in intro ? intro.action : undefined}
        />
      </div>

      {screenState.mode === "list" && (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard title="Supplier payment register" description="Payment vouchers prepared for supplier settlements.">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search voucher, supplier, method, preparer, or reference"
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>
                <BranchFilter
                  viewer={viewer}
                  branches={activeBranches}
                  selectedStoreId={filterStoreId}
                  onChange={setFilterStoreId}
                />
                <button
                  type="button"
                  onClick={() => void loadVoucherList()}
                  disabled={voucherListLoading}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${voucherListLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {voucherListError && (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {voucherListError}
                </div>
              )}

              {voucherListLoading && !voucherRows.length ? (
                <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                  Loading payment vouchers…
                </div>
              ) : !filteredRows.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No supplier payment vouchers matched this search.
                </div>
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    rows={tableRows}
                    onRowClick={(row) => {
                      if (typeof row.id === "string" && row.id) {
                        setScreenState({ mode: "preview", voucherId: row.id });
                      }
                    }}
                    rowAction={(row) => {
                      if (typeof row.id !== "string" || !row.id) return null;
                      const rowId = row.id;
                      return (
                        <button
                          type="button"
                          onClick={() => setScreenState({ mode: "preview", voucherId: rowId })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2d8cf] bg-white px-3 py-1 text-xs font-medium text-[#786f69] transition hover:bg-[#fff7f0]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      );
                    }}
                  />

                  <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fcfbf9] px-4 py-4 text-sm text-[#786f69] md:flex-row md:items-center md:justify-between">
                    <div>
                      <p>{paginationSummary}</p>
                      <p className="mt-1">
                        Page {currentPage} of {totalPages}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        aria-label="Previous page"
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                          currentPage === 1
                            ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                            : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                        }`}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      {paginationPages.map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          aria-label={`Page ${page}`}
                          aria-current={page === currentPage ? "page" : undefined}
                          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
                            page === currentPage
                              ? "bg-[#ff7a12] text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)]"
                              : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                        aria-label="Next page"
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                          currentPage === totalPages
                            ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                            : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                        }`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </SurfaceCard>
        </>
      )}

      {screenState.mode === "create" && (
        <>
          {suppliersLoading ? (
            <SurfaceCard>
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-[#786f69]">
                <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                Loading suppliers and voucher configuration...
              </div>
            </SurfaceCard>
          ) : (
            <form
              id={PAYMENT_FORM_ID}
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateVoucher(draft);
              }}
              className="grid gap-5"
            >
              {dataError ? (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {dataError}
                </div>
              ) : null}

              <SurfaceCard title="Voucher header" description="Supplier settlement identity, payment method, and prepared-by details.">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <FieldLabel label="Voucher No" />
                    <TextInput
                      value={draft.voucherNo}
                      onChange={(value) => updateDraft({ voucherNo: value })}
                      placeholder="PV-2026-0001"
                      disabled
                    />
                  </div>
                  <div>
                    <FieldLabel label="Voucher Date" />
                    <DateInput value={draft.voucherDate} onChange={(value) => updateDraft({ voucherDate: value })} />
                  </div>
                  <div>
                    <FieldLabel label="Prepared By" />
                    <TextInput
                      value={draft.preparedBy}
                      onChange={(value) => updateDraft({ preparedBy: value })}
                      placeholder="Prepared by"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                  <div>
                    <FieldLabel label="Supplier" />
                    <SupplierSelect
                      value={draft.supplierId}
                      onChange={handleSupplierChange}
                      options={suppliers}
                      query={supplierQuery}
                      onQueryChange={setSupplierQuery}
                      onLoadMore={handleLoadMoreSuppliers}
                      hasMore={supplierHasMore}
                      loading={supplierLookupLoading}
                      placeholder="Select supplier"
                    />
                    {selectedSupplier ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        {[
                          { label: "Code", value: selectedSupplier.code },
                          { label: "Contact", value: selectedSupplier.contact || "No contact" },
                          { label: "City", value: selectedSupplier.city },
                          { label: "Currency", value: selectedSupplier.currency },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-[#ece2d8] bg-[#fffaf5] px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9b7a61]">{item.label}</p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#1f1d1c]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <FieldLabel label="Method" />
                    <SelectInput
                      value={draft.method}
                      onChange={(value) => updateDraft({ method: value as PaymentMethod })}
                      options={methodOptions}
                      placeholder="Select method"
                    />
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Payment details" description="Bank, cheque, and external reference information for the settlement.">
                <div className="grid gap-4 lg:grid-cols-4">
                  <div>
                    <FieldLabel label="Pay From Account" />
                    <SelectInput
                      value={draft.payFromAccountId}
                      onChange={(value) => updateDraft({ payFromAccountId: value })}
                      options={payFromAccountOptions}
                      placeholder="Select cash or bank account"
                      disabled={!selectedSupplier}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Payment Reference" />
                    <TextInput
                      value={draft.reference}
                      onChange={(value) => updateDraft({ reference: value })}
                      placeholder="Bank ref / transfer id"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Cheque No" />
                    <TextInput
                      value={draft.chequeNo}
                      onChange={(value) => updateDraft({ chequeNo: value })}
                      placeholder="Cheque number"
                    />
                  </div>
                  <div className="rounded-2xl border border-[#e7e0d8] bg-[#fffaf5] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">Cash Payment</p>
                    <p className="mt-2 font-sans text-2xl font-semibold text-[#1f1d1c]">
                      {currency(allocationTotal, draft.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[#786f69]">
                      Discount {currency(discountTotal, draft.currency)} · Settled {currency(payableTotal, draft.currency)}
                    </p>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Payable allocation" description="Select approved supplier GRNs and allocate settlement amounts." overflow="visible">
                <div className="grid gap-4">
                  {!selectedSupplier ? (
                    <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
                      Select a supplier first to load pending approved GRNs for allocation.
                    </div>
                  ) : null}

                  {selectedSupplier && !draft.allocations.length ? (
                    <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
                      No GRNs are allocated yet. Use Add Allocation to pick from this supplier&apos;s approved GRNs.
                    </div>
                  ) : null}

                  {draft.allocations.length ? (
                    <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] xl:grid xl:grid-cols-[1fr_0.75fr_0.75fr_0.85fr_0.85fr_0.85fr_0.75fr_1fr_auto] xl:gap-3">
                    <span>GRN</span>
                    <span>GRN Date</span>
                    <span>Due Date</span>
                    <span className="text-right">Total</span>
                    <span className="text-right">Payable</span>
                    <span className="text-right">Discount</span>
                    <span className="text-right">Paying</span>
                    <span>Notes</span>
                    <span />
                  </div>
                  ) : null}

                  {draft.allocations.map((line, index) => (
                    <div
                      key={line.id}
                      className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 xl:grid-cols-[1fr_0.75fr_0.75fr_0.85fr_0.85fr_0.85fr_0.75fr_1fr_auto] xl:items-start"
                    >
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="GRN" />
                        </div>
                        <SelectInput
                          value={line.grnId}
                          onChange={(value) => {
                            const grn = grnOptions.find((item) => item.id === value);
                            if (!grn) return;
                            updateAllocation(line.id, createAllocationFromGrn(grn));
                          }}
                          options={grnSelectOptions}
                          placeholder={`Select GRN ${index + 1}`}
                        />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="GRN Date" />
                        </div>
                        <ReadOnlyValue value={formatCalendarDisplay(line.grnDate)} />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Due Date" />
                        </div>
                        <ReadOnlyValue value={formatCalendarDisplay(line.dueDate)} />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Total" />
                        </div>
                        <ReadOnlyValue value={currency(decimalAmount(line.totalAmount), draft.currency)} align="right" />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Payable" />
                        </div>
                        <NumericInput
                          value={line.payableAmount}
                          onChange={(value) => updateAllocation(line.id, { payableAmount: value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Discount" />
                        </div>
                        <NumericInput
                          value={line.discount}
                          onChange={(value) => updateAllocation(line.id, { discount: value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Paying" />
                        </div>
                        <ReadOnlyValue
                          value={currency(decimalAmount(line.payingAmount), draft.currency)}
                          align="right"
                        />
                      </div>
                      <div>
                        <div className="xl:hidden">
                          <FieldLabel label="Notes" />
                        </div>
                        <TextInput
                          value={line.notes}
                          onChange={(value) => updateAllocation(line.id, { notes: value })}
                          placeholder="Allocation note"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAllocationLine(line.id)}
                        aria-label="Remove allocation line"
                        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f0d2c8] bg-[#fff7f3] text-[#c65d3f] transition hover:bg-[#fff0ea]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      type="button"
                      onClick={openAllocationPicker}
                      disabled={!selectedSupplier}
                      className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:bg-[#f3ece4] disabled:text-[#a09388]"
                    >
                      <Plus className="h-4 w-4" />
                      Add Allocation
                    </button>
                    <div className="grid gap-2 text-sm text-[#5f5750] sm:grid-cols-3 sm:text-right">
                      <p>
                        Payable <span className="font-semibold text-[#1f1d1c]">{currency(payableTotal, draft.currency)}</span>
                      </p>
                      <p>
                        Discount <span className="font-semibold text-[#1f1d1c]">{currency(discountTotal, draft.currency)}</span>
                      </p>
                      <p>
                        Paying <span className="font-semibold text-[#1f1d1c]">{currency(allocationTotal, draft.currency)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Voucher notes" description="Internal payment instructions, settlement remarks, and approval context.">
                <TextArea
                  value={draft.notes}
                  onChange={(value) => updateDraft({ notes: value })}
                  placeholder="Payment instructions, remittance notes, and approval remarks."
                />
              </SurfaceCard>
            </form>
          )}
        </>
      )}

      {allocationPickerOpen && selectedSupplier ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1d1c]/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fffdfa] shadow-[0_30px_80px_rgba(31,29,28,0.24)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#efe4db] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                  {selectedSupplier.code} / Pending GRNs
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#1f1d1c]">Add payable allocation</h2>
                <p className="mt-1 text-sm text-[#786f69]">
                  Select approved GRNs for this supplier. GRN dates and due dates are loaded from the receipt details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllocationPickerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                aria-label="Close allocation picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {!supplierGrns.length ? (
                <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No unallocated approved GRNs are available for this supplier.
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] lg:grid lg:grid-cols-[1fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] lg:gap-3">
                    <span>GRN</span>
                    <span>GRN Date</span>
                    <span>Due Date</span>
                    <span className="text-right">Remaining</span>
                    <span>Notes</span>
                    <span />
                  </div>
                  {supplierGrns.map((grn) => (
                    <div
                      key={grn.id}
                      className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 lg:grid-cols-[1fr_0.8fr_0.8fr_0.9fr_1.2fr_auto] lg:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1f1d1c]">{grn.grnNumber}</p>
                        <p className="mt-1 text-xs text-[#786f69]">{grn.poNumber === "—" ? "Without PO" : grn.poNumber}</p>
                      </div>
                      <p className="text-sm text-[#5f5750]">{formatCalendarDisplay(grn.receiptDate)}</p>
                      <p className="text-sm text-[#5f5750]">{formatCalendarDisplay(grn.dueDate)}</p>
                      <p className="text-right text-sm font-semibold tabular-nums text-[#1f1d1c]">
                        {currency(Number(grn.remainingPayable), grn.currency)}
                      </p>
                      <p className="line-clamp-2 text-sm text-[#786f69]">{grn.notes || "No notes"}</p>
                      <button
                        type="button"
                        onClick={() => addGrnAllocation(grn)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {screenState.mode === "preview" && (
        <PaymentVoucherPreview
          voucherId={screenState.voucherId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadVoucherList();
          }}
          onApproved={() => {
            void loadVoucherList();
            setToast({
              tone: "success",
              message: "Payment voucher approved.",
            });
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
