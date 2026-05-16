"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  PackagePlus,
  Search,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GrrLineDraft = {
  id: string;
  itemId: string;
  itemLabel: string;
  description: string;
  receivedQty: string;
  returnQty: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  reason: GrrReason;
  goodsReceiptLineId: string | null;
};

export type GrrReason = "Damaged" | "Wrong Item" | "Expired" | "Excess" | "Other";

export type GrrSupplierOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

export type GrrGrnOption = {
  id: string;
  grnNumber: string;
  receiptDate: string;
  supplierId: string;
  currency: string;
  status: string;
  lines: Array<{
    grnLineId: string;
    itemId: string;
    itemLabel: string;
    description: string;
    receivedQty: string;
    unitPrice: string;
    uomName: string;
    uomBase: string;
  }>;
};

export type GrrDraft = {
  returnNumber: string;
  // A goods return must always be linked to an approved GRN. The literal mode
  // is preserved on the draft so the future API contract stays explicit.
  mode: "withGrn";
  grnRef: GrrGrnOption | null;
  supplier: GrrSupplierOption | null;
  returnDate: string;
  returnedBy: string;
  reasonHeader: string;
  currency: string;
  notes: string;
  lines: GrrLineDraft[];
};

type GoodsReturnFormPanelProps = {
  formId: string;
  draft: GrrDraft;
  supplierOptions: GrrSupplierOption[];
  grnOptions: GrrGrnOption[];
  onChange: (draft: GrrDraft) => void;
  onSubmit: (draft: GrrDraft) => void;
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


// ─── Reason chip pill (portal so it escapes table overflow) ─────────────────

const REASON_OPTIONS: GrrReason[] = ["Damaged", "Wrong Item", "Expired", "Excess", "Other"];

const REASON_PILL: Record<GrrReason, string> = {
  Damaged: "bg-[#fdecec] text-[#a4302a] border-[#f3c4bb]",
  "Wrong Item": "bg-[#fff5e0] text-[#9b6f10] border-[#f0dfa1]",
  Expired: "bg-[#f5edff] text-[#5b3196] border-[#e0cffa]",
  Excess: "bg-[#f1f5ff] text-[#3262c9] border-[#cee0f5]",
  Other: "bg-[#f5f0eb] text-[#7c6f65] border-[#e2d8cf]",
};

function ReasonSelect({
  value,
  onChange,
}: {
  value: GrrReason;
  onChange: (next: GrrReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number; width: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Portal-based positioning so the popover escapes the lines table's
  // overflow:hidden wrapper. Otherwise the dropdown is clipped and users
  // have to scroll to see all options.
  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelHeight = REASON_OPTIONS.length * 28 + 16; // approximate
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, 140);
      const left = Math.min(Math.max(8, rect.left), viewportWidth - width - 8);
      const rawTop = openUpward ? rect.top - panelHeight - 4 : rect.bottom + 4;
      const top = Math.min(Math.max(8, rawTop), viewportHeight - panelHeight - 8);
      setPanelStyle({ left, top, width });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${REASON_PILL[value]}`}
      >
        <span>{value}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[95] overflow-hidden rounded-xl border border-[#eadfd5] bg-white p-1 shadow-[0_12px_24px_rgba(42,34,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              {REASON_OPTIONS.map((option) => {
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
            </div>,
            document.body
          )
        : null}
    </>
  );
}

// ─── Main form panel ────────────────────────────────────────────────────────

export function GoodsReturnFormPanel({
  formId,
  draft,
  supplierOptions,
  grnOptions,
  onChange,
  onSubmit,
}: GoodsReturnFormPanelProps) {
  const [showGrnPicker, setShowGrnPicker] = useState(false);
  const [grnQuery, setGrnQuery] = useState("");

  function updateDraft(patch: Partial<GrrDraft>) {
    onChange({ ...draft, ...patch });
  }

  function pickGrn(grn: GrrGrnOption) {
    const supplier = supplierOptions.find((s) => s.id === grn.supplierId) ?? null;
    // Only carry forward GRN lines that actually had received qty > 0 — those
    // are the only items the supplier can possibly take back.
    const eligibleLines = grn.lines.filter((line) => decimalAmount(line.receivedQty) > 0);
    const lines: GrrLineDraft[] = eligibleLines.map((line, idx) => ({
      id: `line-${grn.id}-${idx}`,
      itemId: line.itemId,
      itemLabel: line.itemLabel,
      description: line.description,
      receivedQty: line.receivedQty,
      returnQty: "0",
      unitPrice: line.unitPrice,
      uomName: line.uomName,
      uomBase: line.uomBase,
      reason: "Damaged",
      goodsReceiptLineId: line.grnLineId,
    }));
    onChange({
      ...draft,
      grnRef: grn,
      supplier,
      currency: grn.currency,
      lines,
    });
    setShowGrnPicker(false);
    setGrnQuery("");
  }

  function unlinkGrn() {
    updateDraft({ grnRef: null, lines: [], supplier: null });
  }

  // Sets the return qty on a line, capped at the line's received qty so the
  // user can never return more than what was originally received.
  function patchReturnQty(id: string, raw: string) {
    onChange({
      ...draft,
      lines: draft.lines.map((line) => {
        if (line.id !== id) return line;
        const cleaned = raw.replace(/[^0-9.]/g, "");
        const max = decimalAmount(line.receivedQty);
        const requested = decimalAmount(cleaned);
        const capped = max > 0 ? Math.min(requested, max) : requested;
        return { ...line, returnQty: capped === requested ? cleaned : String(capped) };
      }),
    });
  }

  function patchLine(id: string, patch: Partial<GrrLineDraft>) {
    onChange({
      ...draft,
      lines: draft.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  }

  // Filter the GRN picker to GRNs that have at least one received line. A GRN
  // with zero received qty across all lines has nothing to return.
  const eligibleGrns = useMemo(
    () => grnOptions.filter((grn) => grn.lines.some((line) => decimalAmount(line.receivedQty) > 0)),
    [grnOptions]
  );

  const grnMatches = useMemo(() => {
    const normalized = grnQuery.trim().toLowerCase();
    if (!normalized) return eligibleGrns;
    return eligibleGrns.filter((grn) => {
      const supplier = supplierOptions.find((s) => s.id === grn.supplierId);
      return [grn.grnNumber, grn.receiptDate, supplier?.name ?? ""].some((v) =>
        v.toLowerCase().includes(normalized)
      );
    });
  }, [grnQuery, eligibleGrns, supplierOptions]);

  const totalReturnQty = draft.lines.reduce((sum, line) => sum + decimalAmount(line.returnQty), 0);
  const subtotal = draft.lines.reduce(
    (sum, line) => sum + decimalAmount(line.returnQty) * decimalAmount(line.unitPrice),
    0
  );

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      {/* ── Header card: GRN picker + meta ── */}
      <SurfaceCard overflow="visible">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          {/* Left: GRN picker + supplier readout */}
          <div className="flex h-full flex-col gap-4">
            <div className="rounded-[28px] border border-dashed border-[#ffd7b9] bg-[linear-gradient(135deg,#fffaf4_0%,#fff3e8_100%)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">
                    Goods Receipt Note
                  </p>
                  <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                    {draft.grnRef ? draft.grnRef.grnNumber : "Select GRN"}
                  </h3>
                  {!draft.grnRef ? (
                    <p className="mt-1 text-sm text-[#7f746d]">
                      A goods return must be linked to an approved GRN. Pick one to load supplier and received-only lines.
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {draft.grnRef ? (
                    <button
                      type="button"
                      onClick={unlinkGrn}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ecd7cb] bg-white px-3 text-sm font-semibold text-[#c16233] transition hover:bg-[#fff5ec]"
                    >
                      Change
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowGrnPicker((cur) => !cur)}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffcfaa] bg-white text-[#ff7101] transition hover:bg-[#fff5ec]"
                    aria-label="Select GRN"
                  >
                    <ClipboardList className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {draft.grnRef && !showGrnPicker ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "GRN Date", value: draft.grnRef.receiptDate },
                    { label: "Status", value: draft.grnRef.status },
                    { label: "Currency", value: draft.grnRef.currency },
                    { label: "Lines", value: String(draft.lines.length) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-[18px] border border-[#ece2d8] bg-white/70 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b7a61]">{label}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-[#1f1d1c]">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {showGrnPicker ? (
                <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
                  <div className="border-b border-[#f0e5dc] p-3">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                      <input
                        value={grnQuery}
                        onChange={(event) => setGrnQuery(event.target.value)}
                        placeholder="Search approved GRNs"
                        className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
                      />
                    </label>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {grnMatches.length ? (
                      grnMatches.map((grn) => {
                        const supplier = supplierOptions.find((s) => s.id === grn.supplierId);
                        const selected = draft.grnRef?.id === grn.id;
                        const eligibleCount = grn.lines.filter(
                          (line) => decimalAmount(line.receivedQty) > 0
                        ).length;
                        return (
                          <button
                            key={grn.id}
                            type="button"
                            onClick={() => pickGrn(grn)}
                            className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                              selected
                                ? "bg-[#fff1e2] text-[#a95915]"
                                : "text-[#5c534d] hover:bg-[#fff8f0]"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{grn.grnNumber}</span>
                              <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">
                                {supplier?.name ?? "—"} · {grn.receiptDate} · {grn.status} · {eligibleCount} received line
                                {eligibleCount === 1 ? "" : "s"}
                              </span>
                            </span>
                            {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-8 text-center text-sm text-[#7f746d]">
                        No approved GRNs with received items.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Supplier readout — populated from the linked GRN */}
            {draft.supplier ? (
              <div className="rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7a61]">Supplier</p>
                <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">{draft.supplier.name}</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
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
              </div>
            ) : null}
          </div>

          {/* Right: meta fields */}
          <div className="grid gap-4 rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel label="Return Number" />
                <TextInput
                  value={draft.returnNumber}
                  onChange={() => {
                    /* auto-generated */
                  }}
                  placeholder="GR-0001"
                  disabled
                />
              </div>
              <div>
                <FieldLabel label="Return Date" />
                <DateInput
                  value={draft.returnDate}
                  onChange={(value) => updateDraft({ returnDate: value })}
                />
              </div>
              <div>
                <FieldLabel label="Returned By" />
                <TextInput
                  value={draft.returnedBy}
                  onChange={(value) => updateDraft({ returnedBy: value })}
                  placeholder="Issued by"
                />
              </div>
              <div>
                <FieldLabel label="Reason Summary" />
                <TextInput
                  value={draft.reasonHeader}
                  onChange={(value) => updateDraft({ reasonHeader: value })}
                  placeholder="High-level reason"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <Undo2 className="h-4 w-4 text-[#a4302a]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Lines</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{draft.lines.length}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <PackagePlus className="h-4 w-4 text-[#2d6df6]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Return Qty</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-[#1f1d1c]">{totalReturnQty || "—"}</p>
              </div>
              <div className="rounded-[20px] border border-[#ece2d8] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#7c7067]">
                  <CalendarDays className="h-4 w-4 text-[#ff7101]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Return Value</span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums text-[#1f1d1c]">
                  {formatCurrency(subtotal, draft.currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* ── Items section ── */}
      <SurfaceCard
        title="Return items"
        description="Lines come from the linked GRN. Set return qty (cannot exceed received) and pick a reason for each line."
        overflow="visible"
      >
        <div className="overflow-hidden rounded-[24px] border border-[#ddd8d1] bg-white">
          {draft.lines.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[1080px] table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[22%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead className="bg-[#faf6f1]">
                    <tr className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f7e72]">
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Return</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, index) => (
                      <tr
                        key={line.id}
                        className={`border-t border-[#ece6df] text-sm text-[#1f1d1c] ${
                          index % 2 === 0 ? "bg-white" : "bg-[#fffcf9]"
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
                        <td className="px-4 py-3 text-right align-middle tabular-nums font-semibold text-[#3f3833]">
                          {line.receivedQty || "—"}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.returnQty}
                            onChange={(event) => patchReturnQty(line.id, event.target.value)}
                            className="w-full rounded-xl border border-[#dfd4ca] bg-white px-3 py-2 text-right text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <ReasonSelect
                            value={line.reason}
                            onChange={(next) => patchLine(line.id, { reason: next })}
                          />
                        </td>
                        <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums">
                          {formatCurrency(
                            decimalAmount(line.returnQty) * decimalAmount(line.unitPrice),
                            draft.currency
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="grid gap-3 p-3 md:hidden">
                {draft.lines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-[20px] border border-[#ece6df] bg-[#fffcf9] p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1f1d1c]">{line.itemLabel}</p>
                      <p className="mt-1 text-sm leading-5 text-[#776d66]">{line.description}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                          Received
                        </p>
                        <p className="mt-1 font-semibold tabular-nums text-[#1f1d1c]">
                          {line.receivedQty || "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                          Return
                        </p>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.returnQty}
                          onChange={(event) => patchReturnQty(line.id, event.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#dfd4ca] bg-white px-2 py-1 text-sm font-semibold tabular-nums text-[#1f1d1c] outline-none focus:border-[#ffba82]"
                        />
                      </div>
                      <div className="col-span-2">
                        <ReasonSelect
                          value={line.reason}
                          onChange={(next) => patchLine(line.id, { reason: next })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-3 bg-white px-4 py-10 text-sm text-[#7d736b]">
              <PackagePlus className="h-5 w-5 text-[#ff7101]" />
              {draft.grnRef
                ? "The selected GRN has no received items to return."
                : "Pick a GRN to load return-eligible lines."}
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* ── Notes / Summary ── */}
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SurfaceCard title="Return notes" description="Pickup remarks, packaging, and follow-up actions for this return.">
          <TextArea
            value={draft.notes}
            onChange={(value) => updateDraft({ notes: value })}
            placeholder="Pickup remarks, repackaging, courier reference, and follow-ups."
            rows={6}
          />
        </SurfaceCard>

        <SurfaceCard title="Return summary" description="Live summary computed from the return lines.">
          <div className="rounded-[24px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-sm text-[#6f665f]">
                <span>Total lines</span>
                <span className="font-semibold tabular-nums text-[#1f1d1c]">{draft.lines.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#6f665f]">
                <span>Total return qty</span>
                <span className="font-semibold tabular-nums text-[#1f1d1c]">{totalReturnQty || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-[20px] border border-[#ffd6b8] bg-white px-4 py-4">
                <span className="text-base font-semibold text-[#1f1d1c]">Return value</span>
                <span className="font-sans text-2xl font-semibold tracking-[-0.03em] text-[#ff7101]">
                  {formatCurrency(subtotal, draft.currency)}
                </span>
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </form>
  );
}
