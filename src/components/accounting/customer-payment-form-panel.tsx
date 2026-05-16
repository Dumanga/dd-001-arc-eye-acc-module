"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Scale,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { DateInput } from "@/components/accounting/date-input";
import type { ClientOption } from "@/app/api/accounting/clients/options/route";

export type CustomerPaymentMethod =
  | "Cash"
  | "Bank Transfer"
  | "Cheque"
  | "Online Transfer";

export const CUSTOMER_PAYMENT_METHODS: CustomerPaymentMethod[] = [
  "Cash",
  "Bank Transfer",
  "Cheque",
  "Online Transfer",
];

export type CustomerPaymentCustomerOption = {
  id: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

export type PendingInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  remainingReceivable: number;
  currency: string;
  notes?: string;
};

export type InvoiceAllocation = {
  id: string;
  type: "invoice";
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  remainingReceivable: number;
  receivingAmount: string;
  discount: string;
  notes: string;
};

export type OnAccountAllocation = {
  id: string;
  type: "on_account";
  description: string;
  receivingAmount: string;
  notes: string;
};

export type CustomerPaymentAllocation = InvoiceAllocation | OnAccountAllocation;

export type CashAccountOption = {
  id: string;
  label: string;
};

export type CustomerPaymentDraft = {
  receiptNumber: string;
  receiptDate: string;
  customer: CustomerPaymentCustomerOption | null;
  currency: string;
  method: CustomerPaymentMethod;
  cashAccountId: string;
  reference: string;
  collectedBy: string;
  notes: string;
  allocations: CustomerPaymentAllocation[];
};

type CustomerPaymentFormPanelProps = {
  formId: string;
  draft: CustomerPaymentDraft;
  cashAccounts: CashAccountOption[];
  onChange: (draft: CustomerPaymentDraft) => void;
  onSubmit: (draft: CustomerPaymentDraft) => void | Promise<void>;
};

// ─── Money helpers ────────────────────────────────────────────────────────

// Strip every character that isn't a digit or decimal point. Multiple decimal
// points collapse to the first one — `1.2.3` becomes `1.23`. Empty input is
// allowed so the user can clear the field.
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned;
  return cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, "");
}

function normalizeAmount(raw: string): string {
  const cleaned = sanitizeAmount(raw);
  if (cleaned === "" || cleaned === ".") return "0.00";
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function makeAllocationId(): string {
  return `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── State types ──────────────────────────────────────────────────────────

type CustomerBalanceState =
  | { state: "idle" }
  | { state: "loading"; customerId: string }
  | {
      state: "loaded";
      customerId: string;
      balance: number;
      currency: string;
      ledgerRowCount: number;
    }
  | { state: "error"; customerId: string; message: string };

// ─── Main form panel ──────────────────────────────────────────────────────

export function CustomerPaymentFormPanel({
  formId,
  draft,
  cashAccounts,
  onChange,
  onSubmit,
}: CustomerPaymentFormPanelProps) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const methodRef = useRef<HTMLDivElement | null>(null);
  const [cashAccountOpen, setCashAccountOpen] = useState(false);
  const cashAccountRef = useRef<HTMLDivElement | null>(null);
  const [balance, setBalance] = useState<CustomerBalanceState>({ state: "idle" });

  const selectedCashAccount = useMemo(
    () => cashAccounts.find((a) => a.id === draft.cashAccountId) ?? null,
    [cashAccounts, draft.cashAccountId],
  );

  // Fetch the picked customer's outstanding balance per accounting-theories.md
  // § "Integrity Invariant" — the customer-ledger sum equals their AAR001
  // GL sum. We display that figure so the cashier knows how much the
  // customer owes before they record the payment amount.
  useEffect(() => {
    const customerId = draft.customer?.id;
    if (!customerId) {
      setBalance({ state: "idle" });
      return;
    }
    let cancelled = false;
    setBalance({ state: "loading", customerId });
    void fetch(`/api/accounting/clients/${customerId}/balance`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (r) => {
        const j = (await r.json()) as {
          success: boolean;
          message?: string;
          data: {
            balance: string;
            currency: string;
            ledgerRowCount: number;
          } | null;
        };
        if (cancelled) return;
        if (!j.success || !j.data) {
          setBalance({
            state: "error",
            customerId,
            message: j.message || "Unable to load balance.",
          });
          return;
        }
        setBalance({
          state: "loaded",
          customerId,
          balance: Number(j.data.balance),
          currency: j.data.currency,
          ledgerRowCount: j.data.ledgerRowCount,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBalance({
          state: "error",
          customerId,
          message: "Network error. Could not load balance.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [draft.customer?.id]);

  useEffect(() => {
    if (!methodOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!methodRef.current) return;
      if (!methodRef.current.contains(event.target as Node)) {
        setMethodOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [methodOpen]);

  useEffect(() => {
    if (!cashAccountOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!cashAccountRef.current) return;
      if (!cashAccountRef.current.contains(event.target as Node)) {
        setCashAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [cashAccountOpen]);

  function updateDraft(patch: Partial<CustomerPaymentDraft>) {
    onChange({ ...draft, ...patch });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(draft);
  }

  const referenceLabel =
    draft.method === "Cheque"
      ? "Cheque number"
      : draft.method === "Bank Transfer"
        ? "Bank slip / transaction ref"
        : draft.method === "Online Transfer"
          ? "Online transaction ref"
          : "Reference (optional)";

  const referencePlaceholder =
    draft.method === "Cheque"
      ? "CHQ-9913"
      : draft.method === "Bank Transfer"
        ? "HNB 244021"
        : draft.method === "Online Transfer"
          ? "TXN-2026-018"
          : "POS close batch / counter ref";

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
              Choose the customer this payment is being collected from.
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
          {draft.customer && !showCustomerPicker ? (
            <CustomerBalanceCard
              balance={balance}
              fallbackCurrency={draft.customer.currency || draft.currency}
            />
          ) : null}
        </div>

        {showCustomerPicker ? (
          <AsyncCustomerPicker
            selected={draft.customer}
            onSelect={(customer) => {
              // Switching customer wipes pending allocations — they belonged
              // to the previous customer's invoices and would no longer be
              // valid against the new picker.
              updateDraft({
                customer,
                currency: customer.currency || draft.currency,
                allocations: [],
              });
              setShowCustomerPicker(false);
            }}
          />
        ) : null}
      </SurfaceCard>

      {/* Payment details */}
      <SurfaceCard overflow="visible">
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            Payment details
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Receipt number, date, method, and the reference for this collection.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block sm:col-span-1 lg:col-span-3">
            <span className="block text-sm font-medium text-[#1f1d1c]">Receipt number</span>
            <input
              value={draft.receiptNumber}
              readOnly
              aria-readonly="true"
              placeholder="RC-2026-0001"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-[#faf6f1] px-3 text-sm font-medium text-[#5c534d] outline-none cursor-not-allowed"
            />
            <span className="mt-1 block text-xs text-[#8c8079]">
              Auto-generated from the Receipts form-id config in Settings.
            </span>
          </label>

          <label className="block sm:col-span-1 lg:col-span-3">
            <span className="block text-sm font-medium text-[#1f1d1c]">Receipt date</span>
            <DateInput
              value={draft.receiptDate}
              onChange={(value) => updateDraft({ receiptDate: value })}
            />
          </label>

          <div className="block sm:col-span-1 lg:col-span-2" ref={methodRef}>
            <span className="block text-sm font-medium text-[#1f1d1c]">Method</span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => setMethodOpen((current) => !current)}
                className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition hover:bg-[#fff7f0]"
              >
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#a09287]" />
                  {draft.method}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-[#9b8f87] transition ${
                    methodOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {methodOpen ? (
                <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.10)]">
                  {CUSTOMER_PAYMENT_METHODS.map((method) => {
                    const isSelected = draft.method === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          updateDraft({ method });
                          setMethodOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                          isSelected
                            ? "bg-[#fff1e2] text-[#a95915]"
                            : "text-[#5c534d] hover:bg-[#fff8f0]"
                        }`}
                      >
                        {method}
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="block sm:col-span-1 lg:col-span-2" ref={cashAccountRef}>
            <span className="block text-sm font-medium text-[#1f1d1c]">Cash account</span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => {
                  if (cashAccounts.length === 0) return;
                  setCashAccountOpen((current) => !current);
                }}
                className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:bg-[#f3ece4] disabled:text-[#a09388]"
                disabled={cashAccounts.length === 0}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Wallet className="h-4 w-4 shrink-0 text-[#a09287]" />
                  <span className="truncate">
                    {cashAccounts.length === 0
                      ? "No cash accounts available"
                      : selectedCashAccount
                        ? selectedCashAccount.label
                        : "Select a cash account"}
                  </span>
                </span>
                <ChevronDown
                  className={`ml-2 h-4 w-4 shrink-0 text-[#9b8f87] transition ${
                    cashAccountOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {cashAccountOpen && cashAccounts.length > 0 ? (
                <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-auto rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.10)]">
                  {cashAccounts.map((account) => {
                    const isSelected = draft.cashAccountId === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => {
                          updateDraft({ cashAccountId: account.id });
                          setCashAccountOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                          isSelected
                            ? "bg-[#fff1e2] text-[#a95915]"
                            : "text-[#5c534d] hover:bg-[#fff8f0]"
                        }`}
                      >
                        <span className="truncate">{account.label}</span>
                        {isSelected ? <Check className="ml-2 h-4 w-4 shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <span className="mt-1 block text-xs text-[#8c8079]">
              Loaded from chart of accounts (Cash and Cash Equivalents).
            </span>
          </div>

          <label className="block sm:col-span-2 lg:col-span-2">
            <span className="block text-sm font-medium text-[#1f1d1c]">{referenceLabel}</span>
            <input
              value={draft.reference}
              onChange={(event) => updateDraft({ reference: event.target.value })}
              placeholder={referencePlaceholder}
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>

          <label className="block sm:col-span-2 lg:col-span-6">
            <span className="block text-sm font-medium text-[#1f1d1c]">Collected by</span>
            <input
              value={draft.collectedBy}
              onChange={(event) => updateDraft({ collectedBy: event.target.value })}
              placeholder="Staff member receiving the payment"
              className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </label>
        </div>
      </SurfaceCard>

      {/* Allocations */}
      <AllocationsSection
        customer={draft.customer}
        currency={draft.currency}
        allocations={draft.allocations}
        onChange={(allocations) => updateDraft({ allocations })}
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
              Optional context for the receipt — settlement remarks, internal comments, etc.
            </p>
            <textarea
              value={draft.notes}
              onChange={(event) => updateDraft({ notes: event.target.value })}
              rows={4}
              placeholder="Add any context that should appear on the receipt."
              className="mt-3 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 py-2 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
            />
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}

// ─── Allocations section ──────────────────────────────────────────────────

function AllocationsSection({
  customer,
  currency,
  allocations,
  onChange,
}: {
  customer: CustomerPaymentCustomerOption | null;
  currency: string;
  allocations: CustomerPaymentAllocation[];
  onChange: (allocations: CustomerPaymentAllocation[]) => void;
}) {
  const customerId = customer?.id;
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoiceOption[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setPendingInvoices([]);
      return;
    }
    let cancelled = false;
    setPendingLoading(true);
    type CprApiItem = {
      id: string;
      invoiceNumber: string;
      invoiceDate: string;
      dueDate?: string;
      currency: string;
      totalAmount: string;
      remainingReceivable: string;
      notes?: string;
    };
    void fetch(
      `/api/accounting/invoices/cpr-options?customerId=${encodeURIComponent(customerId)}`,
      { headers: { "x-portal": "ACCOUNTING" } },
    )
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setPendingInvoices([]);
          return;
        }
        const j = (await r.json()) as {
          success: boolean;
          data: { items: CprApiItem[] } | null;
        };
        if (!j.success || !j.data) {
          setPendingInvoices([]);
          return;
        }
        // Server sends Decimal fields as strings to preserve precision; map
        // to numbers at the boundary so the rest of the UI can do plain math.
        setPendingInvoices(
          j.data.items.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            totalAmount: Number(inv.totalAmount),
            remainingReceivable: Number(inv.remainingReceivable),
            currency: inv.currency,
            notes: inv.notes,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPendingInvoices([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const usedInvoiceIds = useMemo(
    () =>
      new Set(
        allocations
          .filter((a): a is InvoiceAllocation => a.type === "invoice")
          .map((a) => a.invoiceId),
      ),
    [allocations],
  );

  const availableInvoices = useMemo(
    () => pendingInvoices.filter((inv) => !usedInvoiceIds.has(inv.id)),
    [pendingInvoices, usedInvoiceIds],
  );

  const totals = useMemo(() => {
    let receiving = 0;
    let discount = 0;
    for (const a of allocations) {
      receiving += Number(a.receivingAmount) || 0;
      if (a.type === "invoice") {
        discount += Number(a.discount) || 0;
      }
    }
    return { receiving, discount, settled: receiving + discount };
  }, [allocations]);

  function addInvoiceAllocation(inv: PendingInvoiceOption) {
    const next: InvoiceAllocation = {
      id: makeAllocationId(),
      type: "invoice",
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      totalAmount: inv.totalAmount,
      remainingReceivable: inv.remainingReceivable,
      receivingAmount: inv.remainingReceivable.toFixed(2),
      discount: "0.00",
      notes: "",
    };
    onChange([...allocations, next]);
    setPickerOpen(false);
  }

  function addOnAccountAllocation() {
    const next: OnAccountAllocation = {
      id: makeAllocationId(),
      type: "on_account",
      description: "",
      receivingAmount: "0.00",
      notes: "",
    };
    onChange([...allocations, next]);
  }

  function updateInvoiceAllocation(id: string, patch: Partial<InvoiceAllocation>) {
    onChange(
      allocations.map((a) => {
        if (a.id !== id || a.type !== "invoice") return a;
        return { ...a, ...patch };
      }),
    );
  }

  function updateOnAccountAllocation(id: string, patch: Partial<OnAccountAllocation>) {
    onChange(
      allocations.map((a) => {
        if (a.id !== id || a.type !== "on_account") return a;
        return { ...a, ...patch };
      }),
    );
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id));
  }

  const trulyNoPending =
    !!customer && !pendingLoading && pendingInvoices.length === 0;
  const allInvoicesAllocated =
    !!customer &&
    !pendingLoading &&
    pendingInvoices.length > 0 &&
    availableInvoices.length === 0;
  const showAddInvoiceButton = !!customer && availableInvoices.length > 0;

  return (
    <SurfaceCard overflow="visible">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            Apply to outstanding invoices
          </h2>
          <p className="mt-1 text-sm text-[#7b736d]">
            Allocate this receipt against the customer&apos;s unpaid invoices, or
            capture it as an on-account credit. Mix and match as needed.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {!customer ? (
          <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
            Select a customer first to start adding allocations.
          </div>
        ) : null}

        {customer && allocations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-8 text-center text-sm text-[#786f69]">
            No allocations yet. Use Add Invoice or Add On-Account below.
          </div>
        ) : null}

        {allocations.length > 0 ? (
          <>
            <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] xl:grid xl:grid-cols-[1.2fr_0.85fr_0.85fr_0.85fr_1fr_auto] xl:gap-3">
              <span>Reference</span>
              <span className="text-right">Outstanding</span>
              <span className="text-right">Receiving</span>
              <span className="text-right">Discount</span>
              <span>Notes</span>
              <span />
            </div>

            {allocations.map((line, index) => (
              <AllocationRow
                key={line.id}
                line={line}
                currency={currency}
                index={index}
                pendingInvoices={pendingInvoices}
                usedInvoiceIds={usedInvoiceIds}
                onUpdateInvoice={(patch) => updateInvoiceAllocation(line.id, patch)}
                onUpdateOnAccount={(patch) => updateOnAccountAllocation(line.id, patch)}
                onRemove={() => removeAllocation(line.id)}
              />
            ))}
          </>
        ) : null}

        {customer ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {pendingLoading ? (
                <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#9b8f87]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading invoices…
                </span>
              ) : null}
              {showAddInvoiceButton ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
                >
                  <Plus className="h-4 w-4" />
                  Add Invoice
                </button>
              ) : null}
              <button
                type="button"
                onClick={addOnAccountAllocation}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
              >
                <Plus className="h-4 w-4" />
                Add On-Account
              </button>
              {trulyNoPending ? (
                <span className="text-xs text-[#9b8f87]">
                  No outstanding invoices for this customer.
                </span>
              ) : null}
              {allInvoicesAllocated ? (
                <span className="text-xs text-[#9b8f87]">
                  All outstanding invoices already allocated.
                </span>
              ) : null}
            </div>
            <div className="grid gap-2 text-sm text-[#5f5750] sm:grid-cols-3 sm:text-right">
              <p>
                Receiving{" "}
                <span className="font-semibold text-[#1f1d1c]">
                  {formatMoney(totals.receiving, currency)}
                </span>
              </p>
              <p>
                Discount{" "}
                <span className="font-semibold text-[#1f1d1c]">
                  {formatMoney(totals.discount, currency)}
                </span>
              </p>
              <p>
                Settled{" "}
                <span className="font-semibold text-[#1f1d1c]">
                  {formatMoney(totals.settled, currency)}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {pickerOpen && customer ? (
        <InvoicePickerModal
          customer={customer}
          invoices={availableInvoices}
          currency={currency}
          onPick={(inv) => addInvoiceAllocation(inv)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </SurfaceCard>
  );
}

// ─── Allocation row ───────────────────────────────────────────────────────

function AllocationRow({
  line,
  currency,
  index,
  pendingInvoices,
  usedInvoiceIds,
  onUpdateInvoice,
  onUpdateOnAccount,
  onRemove,
}: {
  line: CustomerPaymentAllocation;
  currency: string;
  index: number;
  pendingInvoices: PendingInvoiceOption[];
  usedInvoiceIds: Set<string>;
  onUpdateInvoice: (patch: Partial<InvoiceAllocation>) => void;
  onUpdateOnAccount: (patch: Partial<OnAccountAllocation>) => void;
  onRemove: () => void;
}) {
  if (line.type === "invoice") {
    // The invoice currently bound to this row is always shown, even if it's
    // also in usedInvoiceIds (which would be the row's own id).
    const swappableInvoices = pendingInvoices.filter(
      (inv) => inv.id === line.invoiceId || !usedInvoiceIds.has(inv.id),
    );

    return (
      <div className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 xl:grid-cols-[1.2fr_0.85fr_0.85fr_0.85fr_1fr_auto] xl:items-start">
        <div>
          <div className="xl:hidden">
            <FieldLabel label={`Invoice ${index + 1}`} />
          </div>
          <select
            value={line.invoiceId}
            onChange={(event) => {
              const inv = swappableInvoices.find((i) => i.id === event.target.value);
              if (!inv) return;
              onUpdateInvoice({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                totalAmount: inv.totalAmount,
                remainingReceivable: inv.remainingReceivable,
                receivingAmount: inv.remainingReceivable.toFixed(2),
                discount: "0.00",
              });
            }}
            className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
          >
            {swappableInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} · {inv.invoiceDate}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="xl:hidden">
            <FieldLabel label="Outstanding" />
          </div>
          <ReadOnlyValue
            value={formatMoney(line.remainingReceivable, currency)}
            align="right"
          />
        </div>
        <div>
          <div className="xl:hidden">
            <FieldLabel label="Receiving" />
          </div>
          <NumericInput
            value={line.receivingAmount}
            onChange={(value) => onUpdateInvoice({ receivingAmount: value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <div className="xl:hidden">
            <FieldLabel label="Discount" />
          </div>
          <NumericInput
            value={line.discount}
            onChange={(value) => onUpdateInvoice({ discount: value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <div className="xl:hidden">
            <FieldLabel label="Notes" />
          </div>
          <input
            value={line.notes}
            onChange={(event) => onUpdateInvoice({ notes: event.target.value })}
            placeholder="Optional"
            className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove allocation line"
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f0d2c8] bg-[#fff7f3] text-[#c65d3f] transition hover:bg-[#fff0ea]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // on_account row
  return (
    <div className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 xl:grid-cols-[1.2fr_0.85fr_0.85fr_0.85fr_1fr_auto] xl:items-start">
      <div>
        <div className="xl:hidden">
          <FieldLabel label={`On-account ${index + 1}`} />
        </div>
        <input
          value={line.description}
          onChange={(event) => onUpdateOnAccount({ description: event.target.value })}
          placeholder="Description (e.g. Advance for upcoming order)"
          className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        />
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#9b8f87]">
          On-account credit
        </p>
      </div>
      <div>
        <div className="xl:hidden">
          <FieldLabel label="Outstanding" />
        </div>
        <ReadOnlyValue value="—" align="right" />
      </div>
      <div>
        <div className="xl:hidden">
          <FieldLabel label="Receiving" />
        </div>
        <NumericInput
          value={line.receivingAmount}
          onChange={(value) => onUpdateOnAccount({ receivingAmount: value })}
          placeholder="0.00"
        />
      </div>
      <div>
        <div className="xl:hidden">
          <FieldLabel label="Discount" />
        </div>
        <ReadOnlyValue value="—" align="right" />
      </div>
      <div>
        <div className="xl:hidden">
          <FieldLabel label="Notes" />
        </div>
        <input
          value={line.notes}
          onChange={(event) => onUpdateOnAccount({ notes: event.target.value })}
          placeholder="Optional"
          className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove allocation line"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f0d2c8] bg-[#fff7f3] text-[#c65d3f] transition hover:bg-[#fff0ea]"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Invoice picker modal ─────────────────────────────────────────────────

function InvoicePickerModal({
  customer,
  invoices,
  currency,
  onPick,
  onClose,
}: {
  customer: CustomerPaymentCustomerOption;
  invoices: PendingInvoiceOption[];
  currency: string;
  onPick: (invoice: PendingInvoiceOption) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1d1c]/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fffdfa] shadow-[0_30px_80px_rgba(31,29,28,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#efe4db] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
              {customer.name} / Pending Invoices
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#1f1d1c]">
              Add invoice allocation
            </h2>
            <p className="mt-1 text-sm text-[#786f69]">
              Pick an outstanding invoice to allocate this receipt against.
              Already-allocated invoices are hidden.
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

        <div className="overflow-y-auto p-5">
          {invoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dfd4ca] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
              No outstanding invoices for this customer.
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="hidden rounded-2xl border border-[#eadfd6] bg-[#faf6f1] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f7e72] lg:grid lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] lg:gap-3">
                <span>Invoice</span>
                <span>Date</span>
                <span className="text-right">Total</span>
                <span className="text-right">Outstanding</span>
                <span />
              </div>
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid gap-3 rounded-2xl border border-[#e7e0d8] bg-white px-4 py-4 lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-center"
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
                  <p className="text-right text-sm font-semibold tabular-nums text-[#1f1d1c]">
                    {formatMoney(inv.remainingReceivable, currency)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onPick(inv)}
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

function NumericInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(sanitizeAmount(event.target.value))}
      onBlur={(event) => onChange(normalizeAmount(event.target.value))}
      placeholder={placeholder ?? "0.00"}
      className="h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-right text-sm tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

// ─── Outstanding balance card ─────────────────────────────────────────────

function CustomerBalanceCard({
  balance,
  fallbackCurrency,
}: {
  balance: CustomerBalanceState;
  fallbackCurrency: string;
}) {
  if (balance.state === "idle") return null;

  if (balance.state === "loading") {
    return (
      <div className="flex flex-1 flex-col rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
          Outstanding balance
        </p>
        <p className="mt-1 inline-flex items-center gap-2 text-sm text-[#7b736d]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      </div>
    );
  }

  if (balance.state === "error") {
    return (
      <div className="flex flex-1 flex-col rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b94f37]">
          Outstanding balance
        </p>
        <p className="mt-1 text-sm text-[#b94f37]">{balance.message}</p>
      </div>
    );
  }

  const value = balance.balance;
  const currency = balance.currency || fallbackCurrency || "LKR";
  const formatted = `${currency} ${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  // Owed-by-customer is the typical positive case; negative means we owe
  // the customer (overpaid / credit balance). Settled = 0.
  const tone =
    value > 0
      ? {
          ring: "border-[#eadfd5] bg-[#fffaf5]",
          eyebrow: "text-[#a85a14]",
          headline: "text-[#1f1d1c]",
          subline: "text-[#7b736d]",
          label: "Customer owes",
        }
      : value < 0
        ? {
            ring: "border-[#cfe7d6] bg-[#edf9f1]",
            eyebrow: "text-[#1c7b52]",
            headline: "text-[#1c7b52]",
            subline: "text-[#1c7b52]",
            label: "Credit balance (we owe)",
          }
        : {
            ring: "border-[#e2d8cf] bg-[#fcfbf9]",
            eyebrow: "text-[#7c6f65]",
            headline: "text-[#1f1d1c]",
            subline: "text-[#7b736d]",
            label: "Settled",
          };

  return (
    <div className={`flex flex-1 flex-col rounded-2xl border px-4 py-3 ${tone.ring}`}>
      <p
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone.eyebrow}`}
      >
        <Scale className="h-3.5 w-3.5" />
        {tone.label}
      </p>
      <p className={`mt-1 text-base font-semibold ${tone.headline}`}>{formatted}</p>
      <p className={`mt-1 text-xs ${tone.subline}`}>
        {balance.ledgerRowCount === 0
          ? "No ledger activity yet."
          : `Across ${balance.ledgerRowCount} ledger ${balance.ledgerRowCount === 1 ? "row" : "rows"}.`}
      </p>
    </div>
  );
}

// ─── Async paginated customer picker ──────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

function AsyncCustomerPicker({
  selected,
  onSelect,
}: {
  selected: CustomerPaymentCustomerOption | null;
  onSelect: (customer: CustomerPaymentCustomerOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<ClientOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const skipRef = useRef(0);

  const fetchCustomers = useCallback(async (q: string, skip: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        skip: String(skip),
        take: String(CUSTOMER_PAGE_SIZE),
      });
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
  }, []);

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
