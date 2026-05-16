"use client";

import {
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";
import type { ClientOption } from "@/app/api/accounting/clients/options/route";

// ─── Reason enum (mirrors AccountingGoodsReturnReason) ────────────────────

export type CustomerReturnReason =
  | "DAMAGED"
  | "WRONG_ITEM"
  | "EXPIRED"
  | "EXCESS"
  | "OTHER";

export const CUSTOMER_RETURN_REASONS: { value: CustomerReturnReason; label: string }[] = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_ITEM", label: "Wrong Item" },
  { value: "EXPIRED", label: "Expired" },
  { value: "EXCESS", label: "Excess" },
  { value: "OTHER", label: "Other" },
];

const REASON_LABEL: Record<CustomerReturnReason, string> = Object.fromEntries(
  CUSTOMER_RETURN_REASONS.map((r) => [r.value, r.label]),
) as Record<CustomerReturnReason, string>;

// ─── Public types ─────────────────────────────────────────────────────────

export type CustomerReturnCustomerOption = {
  id: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

export type ReturnableInvoiceLineOption = {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  uomName: string;
  uomBase: string;
  uomMinQty: number;
  unitPrice: number;
  discount: number;
  originalQty: number;
  remainingQty: number;
  lineTotal: number;
  lineOrder: number;
};

export type ReturnableInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  remainingReturnable: number;
  notes: string;
  lines: ReturnableInvoiceLineOption[];
};

// UI-level source type. The DB enum only has INVOICE / POS_BILL —
// the third option here, POS_BILL_CASH, is a frontend-only
// discriminator that maps to sourceType="POS_BILL" on the wire.
// Used to pick the right customer + bill picker endpoints and to
// gate the cash-refund posting leg on the backend (which reads the
// source bill's paymentMethod directly).
export type CustomerReturnSourceType = "INVOICE" | "POS_BILL" | "POS_BILL_CASH";

export type CustomerReturnLineDraft = {
  id: string; // local
  // For sourceType=INVOICE: invoiceLineId holds the source line id.
  // For sourceType=POS_BILL: same field carries the POS bill line id;
  // the parent screen renames to `sourcePosBillLineId` at submit time.
  invoiceLineId: string;
  itemCode: string;
  itemName: string;
  description: string;
  uomName: string;
  uomMinQty: number;
  unitPrice: number;
  invoiceDiscount: number; // line-level discount on the source line
  originalQty: number;
  remainingQty: number; // already-returned-aware cap for this return
  returnQty: string; // editable
  reason: CustomerReturnReason;
  lineNotes: string;
};

export type CustomerReturnDraft = {
  returnNumber: string;
  returnDate: string;
  // INVOICE picks invoices from `/invoices/cr-options`.
  // POS_BILL picks SPLIT POS bills from `/pos-bills/cr-options` —
  // and the customer dropdown filters to merchants only (per
  // accounting-theories.md § 7.2 / pos-integration-flow.md § 3.8).
  sourceType: CustomerReturnSourceType;
  customer: CustomerReturnCustomerOption | null;
  invoice: ReturnableInvoiceOption | null;
  currency: string;
  reasonHeader: string;
  notes: string;
  lines: CustomerReturnLineDraft[];
};

type CustomerReturnFormPanelProps = {
  formId: string;
  draft: CustomerReturnDraft;
  onChange: (draft: CustomerReturnDraft) => void;
  onSubmit: (draft: CustomerReturnDraft) => void | Promise<void>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function makeLineId(): string {
  return `crl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildLinesFromInvoice(invoice: ReturnableInvoiceOption): CustomerReturnLineDraft[] {
  // Skip lines that have already been fully returned (remainingQty <= 0).
  return invoice.lines
    .filter((line) => line.remainingQty > 0)
    .map((line) => ({
      id: makeLineId(),
      invoiceLineId: line.id,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description || line.itemName,
      uomName: line.uomName,
      uomMinQty: line.uomMinQty || 1,
      unitPrice: line.unitPrice,
      invoiceDiscount: line.discount,
      originalQty: line.originalQty,
      remainingQty: line.remainingQty,
      returnQty: "0",
      reason: "DAMAGED" as CustomerReturnReason,
      lineNotes: "",
    }));
}

// ─── Main panel ───────────────────────────────────────────────────────────

export function CustomerReturnFormPanel({
  formId,
  draft,
  onChange,
  onSubmit,
}: CustomerReturnFormPanelProps) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  function updateDraft(patch: Partial<CustomerReturnDraft>) {
    onChange({ ...draft, ...patch });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(draft);
  }

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalValue = 0;
    for (const line of draft.lines) {
      const qty = Number(line.returnQty) || 0;
      if (qty <= 0) continue;
      totalQty += qty;
      totalValue += qty * line.unitPrice;
    }
    return { totalQty, totalValue };
  }, [draft.lines]);

  return (
    <form id={formId} onSubmit={handleSubmit} className="grid gap-5">
      {/* Customer block */}
      <SurfaceCard overflow="visible">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
              Customer
            </h2>
            <p className="mt-1 text-sm text-[#7b736d]">
              Choose the customer who is returning the items.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <button
            type="button"
            onClick={() => setShowCustomerPicker((current) => !current)}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 text-left text-sm font-medium text-[#1f1d1c] transition hover:bg-[#fff7f0]"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff1e2] text-[#a95915]"
              aria-hidden="true"
            >
              <UserPlus className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-xs uppercase tracking-[0.16em] text-[#9b8f87]">
                Selected customer
              </span>
              <span className="text-sm font-semibold text-[#1f1d1c]">
                {draft.customer ? draft.customer.name : "Add Customer"}
              </span>
            </span>
            <ChevronDown
              className={`ml-2 h-4 w-4 text-[#9b8f87] transition ${
                showCustomerPicker ? "rotate-180" : ""
              }`}
            />
          </button>
          {draft.customer && !showCustomerPicker ? (
            <div className="flex flex-1 flex-col rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                Contact
              </p>
              <p className="mt-1 text-sm text-[#1f1d1c]">
                {draft.customer.contact || "No contact on file"}
              </p>
              <p className="mt-1 text-xs text-[#7b736d]">
                {draft.customer.city || "No address on file"} ·{" "}
                {draft.customer.currency || "LKR"}
              </p>
            </div>
          ) : null}
        </div>

        {showCustomerPicker ? (
          <AsyncCustomerPicker
            sourceType={draft.sourceType}
            selected={draft.customer}
            onSelect={(customer) => {
              // Switching customer wipes invoice + lines — they belonged to the
              // previous customer and would no longer be valid.
              // Walk-in customers can only be on POS_BILL_CASH returns
              // (no invoices / SPLIT bills), so force-switch the tab.
              const forcePosBillCash = customer.id === "walk-in-customer";
              updateDraft({
                customer,
                currency: customer.currency || draft.currency,
                invoice: null,
                lines: [],
                ...(forcePosBillCash ? { sourceType: "POS_BILL_CASH" as const } : {}),
              });
              setShowCustomerPicker(false);
            }}
          />
        ) : null}
      </SurfaceCard>

      {/* Return details + Source document */}
      <SurfaceCard overflow="visible">
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            Return details
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Return number, date, and the source document this return is being raised against.
          </p>
        </div>

        {/* Source-type toggle. Three options:
              INVOICE         — reverse a regular sales invoice.
              POS_BILL        — reverse a SPLIT POS bill (merchant
                                 receivable still open).
              POS_BILL_CASH   — refund a CASH / CARD / MIXED POS bill
                                 (cash leg is added in the posting).
            Customer dropdown filters change by sourceType:
              INVOICE         → registered customers (no merchants)
              POS_BILL        → merchants only (per theory § 7.2)
              POS_BILL_CASH   → registered customers + walk-in
            Walk-in selection in the picker auto-locks the toggle to
            POS_BILL_CASH because walk-ins have no invoices/SPLIT bills. */}
        <div className="mt-4 inline-flex rounded-2xl border border-[#e2d8cf] bg-white p-1 text-sm">
          {(["INVOICE", "POS_BILL", "POS_BILL_CASH"] as const).map((t) => {
            const customerIsWalkIn = draft.customer?.id === "walk-in-customer";
            // Walk-in selected → only POS_BILL_CASH is valid.
            const disabled = customerIsWalkIn && t !== "POS_BILL_CASH";
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (t === draft.sourceType) return;
                  // Switching source type wipes the customer + invoice +
                  // lines — they'd be invalid for the other source.
                  updateDraft({
                    sourceType: t,
                    customer: null,
                    invoice: null,
                    lines: [],
                  });
                }}
                className={`rounded-xl px-4 py-2 font-semibold transition ${
                  draft.sourceType === t
                    ? "bg-[#ff7a12] text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-[#bfb6ae]"
                      : "text-[#5f5751] hover:bg-[#fff7f0]"
                }`}
              >
                {t === "INVOICE"
                  ? "Invoice"
                  : t === "POS_BILL"
                    ? "SPLIT POS Bill"
                    : "POS Bill"}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Return number</span>
            <input
              value={draft.returnNumber}
              readOnly
              aria-readonly="true"
              placeholder="SR-2026-0001"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#faf6f1] px-3 text-sm font-medium text-[#5c534d] outline-none cursor-not-allowed"
            />
            <span className="mt-1 block text-xs text-[#8c8079]">
              Auto-generated from the Sales Returns form-id config in Settings.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Return date</span>
            <DateInput
              value={draft.returnDate}
              onChange={(value) => updateDraft({ returnDate: value })}
            />
          </label>

          <SourceInvoicePicker
            sourceType={draft.sourceType}
            customer={draft.customer}
            currency={draft.currency}
            invoice={draft.invoice}
            onPick={(invoice) => {
              updateDraft({
                invoice,
                currency: invoice.currency || draft.currency,
                lines: buildLinesFromInvoice(invoice),
              });
            }}
          />

          <label className="block">
            <span className="block text-sm font-medium text-[#1f1d1c]">Header reason summary</span>
            <input
              value={draft.reasonHeader}
              onChange={(event) => updateDraft({ reasonHeader: event.target.value })}
              placeholder="e.g. Customer change of mind / Wrong item delivered"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
        </div>
      </SurfaceCard>

      {/* Lines */}
      <ReturnLinesSection
        invoice={draft.invoice}
        currency={draft.currency}
        lines={draft.lines}
        totals={totals}
        onUpdateLine={(id, patch) => {
          onChange({
            ...draft,
            lines: draft.lines.map((line) =>
              line.id === id ? { ...line, ...patch } : line,
            ),
          });
        }}
        onRemoveLine={(id) => {
          onChange({ ...draft, lines: draft.lines.filter((line) => line.id !== id) });
        }}
      />

      {/* Notes */}
      <SurfaceCard>
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff1e2] text-[#a95915]"
            aria-hidden="true"
          >
            <StickyNote className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
              Notes
            </h2>
            <p className="mt-1 text-sm text-[#7b736d]">
              Optional context for this return — RMA reference, courier details, etc.
            </p>
            <textarea
              value={draft.notes}
              onChange={(event) => updateDraft({ notes: event.target.value })}
              rows={4}
              placeholder="Add any context that should appear on the return note."
              className="mt-3 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 py-2 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}

// ─── Source invoice picker ────────────────────────────────────────────────

function SourceInvoicePicker({
  sourceType,
  customer,
  currency,
  invoice,
  onPick,
}: {
  sourceType: CustomerReturnSourceType;
  customer: CustomerReturnCustomerOption | null;
  currency: string;
  invoice: ReturnableInvoiceOption | null;
  onPick: (invoice: ReturnableInvoiceOption) => void;
}) {
  const customerId = customer?.id;
  const [invoices, setInvoices] = useState<ReturnableInvoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setInvoices([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Both endpoints return the same shape — invoice cr-options uses
    // `invoiceNumber`, POS bill cr-options uses `billNo`. We normalise
    // to `invoiceNumber` at the boundary so the rest of the form
    // doesn't care which source was picked.
    type ApiLine = {
      id: string;
      itemCode: string;
      itemName: string;
      description: string;
      uomName: string;
      uomBase: string;
      uomMinQty: string;
      unitPrice: string;
      discount: string;
      originalQty: string;
      remainingQty: string;
      lineTotal: string;
      lineOrder: number;
    };
    type ApiSourceDoc = {
      id: string;
      // invoice cr-options:
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      // pos-bills cr-options:
      billNo?: string;
      billDate?: string;
      currency?: string;
      totalAmount: string;
      paidAmount?: string;
      remainingReturnable: string;
      notes: string;
      lines: ApiLine[];
    };
    // Each source type has its own picker endpoint:
    //   INVOICE          → /invoices/cr-options                   (unpaginated — bounded per-customer)
    //   POS_BILL (SPLIT) → /pos-bills/cr-options                  (unpaginated — few SPLIT bills per merchant)
    //   POS_BILL_CASH    → /pos-bills/cr-options-cash             (paginated/searchable, handled by modal)
    //
    // POS_BILL_CASH is handled inside the modal (pagination +
    // search), so this prefetch is skipped — the modal fetches on
    // its own when opened.
    if (sourceType === "POS_BILL_CASH") {
      setInvoices([]);
      setLoading(false);
      return;
    }
    const url =
      sourceType === "POS_BILL"
        ? `/api/accounting/pos-bills/cr-options?customerId=${encodeURIComponent(customerId)}`
        : `/api/accounting/invoices/cr-options?customerId=${encodeURIComponent(customerId)}`;
    void fetch(url, { headers: { "x-portal": "ACCOUNTING" } })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setInvoices([]);
          return;
        }
        const j = (await r.json()) as {
          success: boolean;
          data: { items: ApiSourceDoc[] } | null;
        };
        if (!j.success || !j.data) {
          setInvoices([]);
          return;
        }
        setInvoices(
          j.data.items.map((doc) => ({
            id: doc.id,
            invoiceNumber: doc.invoiceNumber ?? doc.billNo ?? "",
            invoiceDate: doc.invoiceDate ?? doc.billDate ?? "",
            dueDate: doc.dueDate ?? "",
            currency: doc.currency ?? "LKR",
            totalAmount: Number(doc.totalAmount),
            paidAmount: Number(doc.paidAmount ?? "0"),
            remainingReturnable: Number(doc.remainingReturnable),
            notes: doc.notes,
            lines: doc.lines.map((line) => ({
              id: line.id,
              itemCode: line.itemCode,
              itemName: line.itemName,
              description: line.description,
              uomName: line.uomName,
              uomBase: line.uomBase,
              uomMinQty: Number(line.uomMinQty),
              unitPrice: Number(line.unitPrice),
              discount: Number(line.discount),
              originalQty: Number(line.originalQty),
              remainingQty: Number(line.remainingQty),
              lineTotal: Number(line.lineTotal),
              lineOrder: line.lineOrder,
            })),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError("Network error while loading source documents.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, sourceType]);

  const isPosBillSource = sourceType === "POS_BILL" || sourceType === "POS_BILL_CASH";
  const sourceLabel = isPosBillSource ? "POS bill" : "invoice";
  const triggerLabel = invoice
    ? `${invoice.invoiceNumber} · ${formatMoney(invoice.remainingReturnable, currency)} remaining`
    : sourceType === "POS_BILL"
      ? "Select a SPLIT POS bill"
      : sourceType === "POS_BILL_CASH"
        ? "Select a POS bill"
        : "Select an invoice";

  const sourceTitle = isPosBillSource ? "Source POS bill" : "Source invoice";
  const helperText =
    sourceType === "POS_BILL"
      ? "Only SPLIT POS bills with an open receivable are listed."
      : sourceType === "POS_BILL_CASH"
        ? "COMPLETED Cash / Card / Mixed POS bills for this customer. Refund posts to the original cash account."
        : "Only invoices with an unpaid (returnable) portion are listed.";

  return (
    <div className="block">
      <span className="block text-sm font-medium text-[#1f1d1c]">{sourceTitle}</span>
      <button
        type="button"
        onClick={() => {
          if (!customerId) return;
          setPickerOpen(true);
        }}
        disabled={!customerId || loading}
        className="mt-1 flex h-11 w-full items-center justify-between rounded-2xl border border-[#eadfd5] bg-white px-3 text-left text-sm text-[#1f1d1c] outline-none transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:bg-[#f3ece4] disabled:text-[#a09388]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-[#a09287]" />
          <span className="truncate">
            {!customerId
              ? sourceType === "POS_BILL"
                ? "Select a merchant first"
                : sourceType === "POS_BILL_CASH"
                  ? "Select a customer (or walk-in) first"
                  : "Select a customer first"
              : loading
                ? "Loading…"
                : triggerLabel}
          </span>
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[#9b8f87]" />
      </button>
      <span className="mt-1 block text-xs text-[#8c8079]">{helperText}</span>
      {error ? (
        <p className="mt-1 text-xs text-[#b94f37]">{error}</p>
      ) : null}

      {pickerOpen && customer ? (
        <SourceInvoiceModal
          sourceType={sourceType}
          customer={customer}
          currency={currency}
          invoices={invoices}
          loading={loading}
          onPick={(inv) => {
            onPick(inv);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

const POS_BILL_CASH_PAGE_SIZE = 10;

function SourceInvoiceModal({
  sourceType,
  customer,
  currency,
  invoices,
  loading,
  onPick,
  onClose,
}: {
  sourceType: CustomerReturnSourceType;
  customer: CustomerReturnCustomerOption;
  currency: string;
  invoices: ReturnableInvoiceOption[];
  loading: boolean;
  onPick: (invoice: ReturnableInvoiceOption) => void;
  onClose: () => void;
}) {
  const isPosBillSource = sourceType === "POS_BILL" || sourceType === "POS_BILL_CASH";
  const docNoun = isPosBillSource ? "POS bills" : "invoices";
  const docNounSingular = isPosBillSource ? "POS bill" : "invoice";

  // POS_BILL_CASH path: fetch paginated bills from inside the modal
  // (could be thousands of CASH/CARD/MIXED bills, so we don't dump
  // everything client-side like the other source types). Supports
  // 10-row pagination + debounced search by bill number — both
  // backed by the `skip`/`take`/`q` params on the cr-options-cash
  // endpoint.
  const isPaginated = sourceType === "POS_BILL_CASH";
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [paginatedItems, setPaginatedItems] = useState<ReturnableInvoiceOption[]>([]);
  const [paginatedHasMore, setPaginatedHasMore] = useState(false);
  const [paginatedLoading, setPaginatedLoading] = useState(false);
  const [paginatedError, setPaginatedError] = useState<string | null>(null);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    if (!isPaginated) return;
    const handle = setTimeout(() => {
      setSearchDebounced(searchQuery.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, isPaginated]);

  useEffect(() => {
    if (!isPaginated || !customer.id) return;
    let cancelled = false;
    setPaginatedLoading(true);
    setPaginatedError(null);
    const params = new URLSearchParams({
      customerId: customer.id,
      skip: String(page * POS_BILL_CASH_PAGE_SIZE),
      take: String(POS_BILL_CASH_PAGE_SIZE),
    });
    if (searchDebounced) params.set("q", searchDebounced);
    type ApiLine = {
      id: string;
      itemCode: string;
      itemName: string;
      description: string;
      uomName: string;
      uomBase: string;
      uomMinQty: string;
      unitPrice: string;
      discount: string;
      originalQty: string;
      remainingQty: string;
      lineTotal: string;
      lineOrder: number;
    };
    type ApiBill = {
      id: string;
      billNo: string;
      billDate: string;
      currency: string;
      totalAmount: string;
      paidAmount: string;
      remainingReturnable: string;
      notes: string;
      lines: ApiLine[];
    };
    void fetch(`/api/accounting/pos-bills/cr-options-cash?${params}`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (res) => {
        if (cancelled) return;
        const j = (await res.json()) as {
          success: boolean;
          data: { items: ApiBill[]; hasMore: boolean } | null;
        };
        if (!res.ok || !j.success || !j.data) {
          setPaginatedItems([]);
          setPaginatedHasMore(false);
          setPaginatedError("Could not load bills.");
          return;
        }
        setPaginatedItems(
          j.data.items.map((doc) => ({
            id: doc.id,
            invoiceNumber: doc.billNo,
            invoiceDate: doc.billDate,
            dueDate: "",
            currency: doc.currency,
            totalAmount: Number(doc.totalAmount),
            paidAmount: Number(doc.paidAmount),
            remainingReturnable: Number(doc.remainingReturnable),
            notes: doc.notes,
            lines: doc.lines.map((line) => ({
              id: line.id,
              itemCode: line.itemCode,
              itemName: line.itemName,
              description: line.description,
              uomName: line.uomName,
              uomBase: line.uomBase,
              uomMinQty: Number(line.uomMinQty),
              unitPrice: Number(line.unitPrice),
              discount: Number(line.discount),
              originalQty: Number(line.originalQty),
              remainingQty: Number(line.remainingQty),
              lineTotal: Number(line.lineTotal),
              lineOrder: line.lineOrder,
            })),
          })),
        );
        setPaginatedHasMore(j.data.hasMore);
      })
      .catch(() => {
        if (!cancelled) {
          setPaginatedItems([]);
          setPaginatedError("Network error.");
        }
      })
      .finally(() => {
        if (!cancelled) setPaginatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPaginated, customer.id, page, searchDebounced]);

  // Pick whichever list shape the source type uses.
  const displayedInvoices = isPaginated ? paginatedItems : invoices;
  const displayedLoading = isPaginated ? paginatedLoading : loading;
  const displayedError = isPaginated ? paginatedError : null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1d1c]/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fffdfa] shadow-[0_30px_80px_rgba(31,29,28,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#efe4db] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
              {customer.name} / Returnable {docNoun}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#1f1d1c]">Select source {docNounSingular}</h2>
            <p className="mt-1 text-sm text-[#786f69]">
              Pick the {docNounSingular} to raise this return against. Only{" "}
              {docNoun} with an open returnable portion are shown.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
            aria-label="Close invoice picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search box — only shown for the paginated POS_BILL_CASH
            path. The endpoint already supports a `q` substring match
            on bill numbers. */}
        {isPaginated ? (
          <div className="border-b border-[#efe4db] px-5 py-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by bill number"
                className="h-10 w-full rounded-2xl border border-[#eadfd5] bg-white pl-10 pr-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
          </div>
        ) : null}

        <div className="overflow-y-auto p-5">
          {displayedLoading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-[#786f69]">
              <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
              Loading…
            </div>
          ) : displayedError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {displayedError}
            </div>
          ) : displayedInvoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
              {isPaginated && searchDebounced
                ? `No ${docNoun} match "${searchDebounced}".`
                : `No returnable ${docNoun} for this customer.`}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] lg:grid lg:grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] lg:gap-3">
                <span>{isPosBillSource ? "Bill" : "Invoice"}</span>
                <span>Date</span>
                <span className="text-right">Total</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Returnable</span>
                <span />
              </div>
              {displayedInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 lg:grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] lg:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#1f1d1c]">{inv.invoiceNumber}</p>
                    {inv.notes ? (
                      <p className="mt-1 text-xs text-[#786f69]">{inv.notes}</p>
                    ) : null}
                  </div>
                  <p className="text-sm text-[#5f5750]">{inv.invoiceDate}</p>
                  <p className="text-right text-sm tabular-nums text-[#5f5750]">
                    {formatMoney(inv.totalAmount, currency)}
                  </p>
                  <p className="text-right text-sm tabular-nums text-[#5f5750]">
                    {formatMoney(inv.paidAmount, currency)}
                  </p>
                  <p className="text-right text-sm font-semibold tabular-nums text-[#1f1d1c]">
                    {formatMoney(inv.remainingReturnable, currency)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onPick(inv)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
                  >
                    <Plus className="h-4 w-4" />
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination footer — only for POS_BILL_CASH. */}
        {isPaginated ? (
          <div className="flex items-center justify-between gap-3 border-t border-[#efe4db] px-5 py-3">
            <p className="text-xs text-[#786f69]">
              Page {page + 1}
              {searchDebounced ? ` · search: "${searchDebounced}"` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || paginatedLoading}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[#ddd8d1] bg-white px-3 text-xs font-semibold text-[#5f5751] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!paginatedHasMore || paginatedLoading}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[#ddd8d1] bg-white px-3 text-xs font-semibold text-[#5f5751] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Lines section ────────────────────────────────────────────────────────

function ReturnLinesSection({
  invoice,
  currency,
  lines,
  totals,
  onUpdateLine,
  onRemoveLine,
}: {
  invoice: ReturnableInvoiceOption | null;
  currency: string;
  lines: CustomerReturnLineDraft[];
  totals: { totalQty: number; totalValue: number };
  onUpdateLine: (id: string, patch: Partial<CustomerReturnLineDraft>) => void;
  onRemoveLine: (id: string) => void;
}) {
  const exceedsCap =
    !!invoice && totals.totalValue > invoice.remainingReturnable + 1e-6;

  return (
    <SurfaceCard overflow="visible">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            Items being returned
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Set a non-zero return quantity for each line being returned. Lines with
            zero are ignored on submit.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {!invoice ? (
          <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
            Select a customer and source invoice first to load returnable items.
          </div>
        ) : null}

        {invoice && lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
            All lines have been removed. Pick a different invoice or re-select to reload.
          </div>
        ) : null}

        {invoice && lines.length > 0 ? (
          <>
            <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] xl:grid xl:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.85fr_0.85fr_1fr_auto] xl:gap-3">
              <span>Item</span>
              <span className="text-right">Returnable Qty</span>
              <span className="text-right">Return Qty</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Line Total</span>
              <span>Reason</span>
              <span>Notes</span>
              <span />
            </div>

            {lines.map((line, index) => (
              <ReturnLineRow
                key={line.id}
                line={line}
                currency={currency}
                index={index}
                onUpdate={(patch) => onUpdateLine(line.id, patch)}
                onRemove={() => onRemoveLine(line.id)}
              />
            ))}
          </>
        ) : null}

        {invoice ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-[#5f5750]">
              <p className="font-semibold text-[#1f1d1c]">
                Returning against {invoice.invoiceNumber}
              </p>
              <p className="mt-0.5 text-xs text-[#7c6f65]">
                Invoice total {formatMoney(invoice.totalAmount, currency)} · Paid{" "}
                {formatMoney(invoice.paidAmount, currency)} · Remaining returnable{" "}
                <span className="font-semibold text-[#1f1d1c]">
                  {formatMoney(invoice.remainingReturnable, currency)}
                </span>
              </p>
            </div>
            <div className="grid gap-2 text-sm text-[#5f5750] sm:grid-cols-2 sm:text-right">
              <p>
                Return Qty{" "}
                <span className="font-semibold text-[#1f1d1c]">
                  {totals.totalQty.toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })}
                </span>
              </p>
              <p>
                Return Value{" "}
                <span
                  className={`font-semibold ${
                    exceedsCap ? "text-[#b94f37]" : "text-[#1f1d1c]"
                  }`}
                >
                  {formatMoney(totals.totalValue, currency)}
                </span>
              </p>
            </div>
          </div>
        ) : null}

        {exceedsCap && invoice ? (
          <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            Return value {formatMoney(totals.totalValue, currency)} exceeds the
            invoice&apos;s remaining returnable amount of{" "}
            {formatMoney(invoice.remainingReturnable, currency)}. The paid portion of
            an invoice is closed and cannot be returned. Reduce the return quantities
            and try again.
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function ReturnLineRow({
  line,
  currency,
  index,
  onUpdate,
  onRemove,
}: {
  line: CustomerReturnLineDraft;
  currency: string;
  index: number;
  onUpdate: (patch: Partial<CustomerReturnLineDraft>) => void;
  onRemove: () => void;
}) {
  const returnQtyNum = Number(line.returnQty) || 0;
  const lineValue = returnQtyNum * line.unitPrice;
  const exceedsLineCap = returnQtyNum > line.remainingQty + 1e-6;

  return (
    <div className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 xl:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.85fr_0.85fr_1fr_auto] xl:items-start">
      <div>
        <div className="xl:hidden">
          <FieldLabel label={`Line ${index + 1}`} />
        </div>
        <p className="text-sm font-semibold text-[#1f1d1c]">{line.itemCode}</p>
        <p className="mt-0.5 text-xs text-[#7c6f65]">{line.itemName}</p>
        {line.description && line.description !== line.itemName ? (
          <p className="mt-0.5 text-xs text-[#9a8f85]">{line.description}</p>
        ) : null}
        {line.uomName ? (
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[#9b8f87]">
            UOM: {line.uomName}
          </p>
        ) : null}
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Returnable Qty" />
        </div>
        <ReadOnlyValue value={line.remainingQty.toString()} align="right" />
        {line.remainingQty < line.originalQty ? (
          <p className="mt-1 text-[10px] text-[#9b8f87]">
            (orig {line.originalQty})
          </p>
        ) : null}
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Return Qty" />
        </div>
        <input
          inputMode="decimal"
          value={line.returnQty}
          onChange={(event) => onUpdate({ returnQty: sanitizeDecimal(event.target.value) })}
          className={`h-11 w-full rounded-2xl border bg-white px-3 text-right text-sm tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] ${
            exceedsLineCap ? "border-[#f3c4bb] bg-[#fff3f0]" : "border-[#eadfd5]"
          }`}
          placeholder="0"
        />
        {exceedsLineCap ? (
          <p className="mt-1 text-[11px] text-[#b94f37]">
            Cannot exceed {line.remainingQty}.
          </p>
        ) : null}
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Unit Price" />
        </div>
        <ReadOnlyValue value={formatMoney(line.unitPrice, currency)} align="right" />
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Line Total" />
        </div>
        <ReadOnlyValue value={formatMoney(lineValue, currency)} align="right" />
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Reason" />
        </div>
        <ReasonDropdown value={line.reason} onChange={(reason) => onUpdate({ reason })} />
      </div>

      <div>
        <div className="xl:hidden">
          <FieldLabel label="Notes" />
        </div>
        <input
          value={line.lineNotes}
          onChange={(event) => onUpdate({ lineNotes: event.target.value })}
          placeholder="Optional"
          className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove line"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f0d2c8] bg-[#fff7f3] text-[#c65d3f] transition hover:bg-[#fff0ea]"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Reason dropdown (custom popover, fully Tailwind-styled) ──────────────

function ReasonDropdown({
  value,
  onChange,
}: {
  value: CustomerReturnReason;
  onChange: (value: CustomerReturnReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition hover:bg-[#fff7f0]"
      >
        <span>{REASON_LABEL[value]}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#9b8f87] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.10)]">
          {CUSTOMER_RETURN_REASONS.map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "bg-[#fff1e2] text-[#a95915]"
                    : "text-[#5c534d] hover:bg-[#fff8f0]"
                }`}
              >
                {option.label}
                {isSelected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────

function FieldLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
      {label}
    </p>
  );
}

function ReadOnlyValue({ value, align }: { value: string; align?: "right" }) {
  return (
    <div
      className={`flex h-11 items-center rounded-2xl border border-[#eadfd5] bg-[#faf6f1] px-3 text-sm text-[#5c534d] ${
        align === "right" ? "justify-end tabular-nums" : ""
      }`}
    >
      {value}
    </div>
  );
}

// ─── Async paginated customer picker ──────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

function AsyncCustomerPicker({
  sourceType,
  selected,
  onSelect,
}: {
  sourceType: CustomerReturnSourceType;
  selected: CustomerReturnCustomerOption | null;
  onSelect: (customer: CustomerReturnCustomerOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<ClientOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  const fetchCustomers = useCallback(
    async (q: string, skip: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          skip: String(skip),
          take: String(CUSTOMER_PAGE_SIZE),
        });
        // Filter the customer list by source type:
        //   INVOICE          → registered customers (default)
        //   POS_BILL (SPLIT) → merchants only (theory § 7.2)
        //   POS_BILL_CASH    → registered + walk-in (cash sales)
        if (sourceType === "POS_BILL") {
          params.set("merchantsOnly", "true");
        } else if (sourceType === "POS_BILL_CASH") {
          params.set("includeWalkIn", "true");
        }
        const res = await fetch(`/api/accounting/clients/options?${params}`);
        const payload = (await res.json()) as {
          success: boolean;
          data: { items: ClientOption[]; hasMore: boolean } | null;
        };
        if (payload.success && payload.data) {
          const fetched = payload.data.items;
          setHasMore(payload.data.hasMore);
          skipRef.current = skip + fetched.length;
          setCustomers((prev) => (append ? [...prev, ...fetched] : fetched));
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [sourceType],
  );

  useEffect(() => {
    skipRef.current = 0;
    void fetchCustomers("", 0, false);
  }, [fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      skipRef.current = 0;
      void fetchCustomers(query, 0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchCustomers]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      void fetchCustomers(query, skipRef.current, true);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.08)]">
      <div className="border-b border-[#f0e5dc] p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers"
            className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#fffaf5] pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a99d92] focus:border-[#ffba82] focus:bg-white focus:ring-4 focus:ring-[#ffe7d4]"
          />
        </label>
      </div>
      <div ref={listRef} className="max-h-80 overflow-y-auto p-2" onScroll={handleScroll}>
        {customers.length ? (
          <>
            {customers.map((customer) => {
              const isSelected = selected?.id === customer.id;
              const detail =
                [customer.contact, customer.city].filter((p) => p.trim()).join(" · ") ||
                "No contact details";
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: customer.id,
                      name: customer.name,
                      contact: customer.contact,
                      city: customer.city,
                      currency: customer.currency,
                    })
                  }
                  className={`flex w-full items-start justify-between gap-3 rounded-[20px] px-3 py-3 text-left transition ${
                    isSelected ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{customer.name}</span>
                    <span className="mt-1 block truncate text-xs leading-5 text-[#8c7f74]">
                      {detail}
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
          <div className="px-3 py-8 text-center text-sm text-[#7f746d]">No customers found.</div>
        )}
      </div>
    </div>
  );
}
