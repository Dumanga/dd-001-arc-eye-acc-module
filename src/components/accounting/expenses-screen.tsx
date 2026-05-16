"use client";

// Expense Voucher screen — `/accounting/admin/accounts/expenses`.
//
// Matches the invoice screen pattern end-to-end:
//
//   - `useViewerAndBranches` + `BranchAwareCreateButton` for the
//     "Create on behalf of branch" flow (super admin picks branch
//     before opening the form; branch users get the plain Create
//     button and the server auto-injects their storeId).
//
//   - Three modes (list / create / preview) driven from a single
//     <AccountingPageIntro> whose eyebrow + action change per mode.
//     Create mode renders [Back] + [Create Voucher] in the intro
//     action slot; the second button posts to the form via the
//     standard `form={EXPENSE_FORM_ID}` HTML pattern.
//
//   - Lines table is fully account-agnostic. Each row picks ANY
//     active chart-of-accounts row (Assets / Liabilities / Equity /
//     Income / Expenses) via the categorised picker. The form
//     auto-determines whether each line lands in Debit or Credit
//     based on the account's category (Asset/Expense = Dr-normal,
//     Income/Liability/Equity = Cr-normal). The pay-from cash leg
//     balances the JE.
//
//   - Cash leg memo strategy:
//       * 1 line:  copy the line's memo
//       * ≥2 lines: `Split — EXP-2026-NNNNN` so the GL row can be
//         traced back to its voucher.
//
// UI-first phase: voucher # auto-loaded from /settings/form-ids
// (falls back to a mock if the EXP series isn't in the form-id
// config yet — that's a backend-phase migration). Save and Approve
// are local-state mocked; backend wiring lands next.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardList,
  Coins,
  Loader2,
  PencilLine,
  Plus,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";
import {
  AccountingPageIntro,
  PremiumMetricGrid,
  SurfaceCard,
} from "@/components/accounting/accounting-ui";
import {
  BranchAwareCreateButton,
  type ActiveBranch,
} from "@/components/accounting/branch-aware-create-button";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";
import { StyledDatePicker } from "@/components/accounting/styled-date-picker";
import { StyledSelect } from "@/components/accounting/styled-select";
import {
  CategorizedAccountPicker,
  type CategorizedAccount,
} from "@/components/accounting/categorized-account-picker";

const EXPENSE_FORM_ID = "expense-voucher-form";

// ─── Types ───────────────────────────────────────────────────────

export type ExpensePaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER";

const PAYMENT_METHOD_OPTIONS: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

function paymentMethodLabel(method: ExpensePaymentMethod): string {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? "Cash";
}

export type ExpenseLine = {
  id: string;
  // Picked account — code + name + categoryCode together drive the
  // Dr/Cr direction. categoryCode is one of ASSET / LIABILITIES /
  // EQUITY / INCOME / EXPENSES.
  accountId: string;
  accountCode: string;
  accountName: string;
  categoryCode: string;
  amount: string; // decimal string the user typed
  paymentMethod: ExpensePaymentMethod;
  memo: string;
};

export type ExpenseRecord = {
  id: string;
  voucherNo: string;
  expenseDate: string;
  payFromAccountId: string;
  payFromAccountCode: string;
  payFromAccountName: string;
  // The pay-from account category (always ASSET in practice — cash
  // and bank are both assets — but stored for completeness).
  payFromCategoryCode: string;
  storeCode: string;
  storeId: string;
  lines: ExpenseLine[];
  total: string;
  notes: string;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  createdByName: string;
  createdAt: string;
  approvedAt?: string | null;
  approvedByName?: string | null;
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; item: ExpenseRecord };

// ─── Helpers ─────────────────────────────────────────────────────

// Expense Voucher theory:
//
//   - Every voucher line is on the DEBIT side. The pay-from cash /
//     bank account is always CREDITED for the total of all line
//     amounts. The Dr/Cr column display does NOT vary by account
//     category — lines Dr, cash Cr, always.
//
//   - The signed GL `value` stored to the journal entries table
//     follows the additive convention based on each account's
//     natural balance:
//       * Asset on Dr side    → value = +amount  (asset grows)
//       * Expense on Dr side  → value = +amount  (expense grows)
//       * Liability on Dr side → value = -amount  (liability shrinks)
//       * Equity on Dr side   → value = -amount  (equity shrinks)
//       * Income on Dr side   → value = -amount  (income shrinks)
//     The cash leg credit:
//       * Cash (asset) on Cr side → value = -total  (asset shrinks)
//
// See accountingtheories.md § 8 (Expense Voucher).
function isDebitNormalCategory(categoryCode: string): boolean {
  return categoryCode === "ASSET" || categoryCode === "EXPENSES";
}

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `LKR ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00.000Z" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isCurrentMonth(iso: string, now = new Date()): boolean {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00.000Z" : ""));
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

// JE preview computation — given a draft's lines + cash leg, produce
// the per-row Dr/Cr + the offsetting cash row + per-side totals.
type JePreviewRow = {
  accountLabel: string;
  memo: string;
  debit: number;
  credit: number;
};

function computeJePreview(
  lines: ExpenseLine[],
  payFromCode: string,
  payFromName: string,
  voucherNo: string,
): { rows: JePreviewRow[]; totalDebit: number; totalCredit: number } {
  // Every line is on the DEBIT side (regardless of account
  // category). The pay-from cash leg is always on the CREDIT side
  // for the total of all line amounts. See § 8 of
  // accountingtheories.md — the GL `value` sign per line is
  // computed elsewhere (at posting time) based on category, but
  // the human-facing preview is always Dr lines / Cr cash.
  const rows: JePreviewRow[] = [];
  let totalDebit = 0;
  for (const l of lines) {
    const amt = Number(l.amount);
    if (!Number.isFinite(amt) || amt <= 0 || !l.accountId) continue;
    rows.push({
      accountLabel: `${l.accountCode} ${l.accountName}`,
      memo: l.memo,
      debit: amt,
      credit: 0,
    });
    totalDebit += amt;
  }

  // Single cash leg credit for the voucher total. Memo strategy:
  //   - 1 line: copy the line's memo (the cash credit is
  //     conceptually paired with that single debit)
  //   - 2+ lines: "Split — EXP-YYYY-NNNNN" so the cash row points
  //     back to the voucher.
  if (totalDebit > 0.005 && payFromCode) {
    const enteredLines = lines.filter((l) => {
      const amt = Number(l.amount);
      return Number.isFinite(amt) && amt > 0 && l.accountId;
    });
    const cashLine = enteredLines.length === 1 ? enteredLines[0] : null;
    const cashMemo = cashLine
      ? cashLine.memo || `Cash leg for ${voucherNo}`
      : `Split — ${voucherNo}`;
    rows.push({
      accountLabel: `${payFromCode} ${payFromName}`,
      memo: cashMemo,
      debit: 0,
      credit: totalDebit,
    });
  }

  return { rows, totalDebit, totalCredit: totalDebit };
}

// Generate the next voucher number from existing items (local stub
// for UI-first phase — backend phase reads form-id config).
function nextVoucherNumber(existing: ExpenseRecord[], baseFromConfig: string | null): string {
  if (baseFromConfig) return baseFromConfig;
  const max = existing
    .map((it) => Number(it.voucherNo.split("-").pop() ?? "0"))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `EXP-2026-${String(max + 1).padStart(5, "0")}`;
}

// ─── Cash account option (loaded live from the CoA) ──────────────

// Pay-from accounts must be under the Cash & Cash Equivalents asset
// subtype per §8. We fetch the live list on form open.
export type CashAccountOption = { id: string; code: string; name: string };


// ─── Main screen ─────────────────────────────────────────────────

export function ExpensesScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [items, setItems] = useState<ExpenseRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "APPROVED">("ALL");
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [pickedStoreCode, setPickedStoreCode] = useState<string>("");
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();

  const [voucherNoFromConfig, setVoucherNoFromConfig] = useState<string | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  // KPIs derived from local mock state
  const kpis = useMemo(() => {
    const monthlyApproved = items.filter(
      (it) => it.status === "APPROVED" && isCurrentMonth(it.expenseDate),
    );
    const monthlyTotal = monthlyApproved.reduce(
      (s, it) => s + Number(it.total),
      0,
    );
    const draftCount = items.filter((it) => it.status === "DRAFT").length;
    // Top category by sum of line amounts this month (regardless of category)
    const byCat = new Map<string, number>();
    for (const it of monthlyApproved) {
      for (const l of it.lines) {
        const k = `${l.accountCode} ${l.accountName}`;
        byCat.set(k, (byCat.get(k) ?? 0) + Number(l.amount));
      }
    }
    let topAcc = "—";
    let topAmount = 0;
    for (const [k, v] of byCat) {
      if (v > topAmount) {
        topAcc = k;
        topAmount = v;
      }
    }
    return {
      monthlyTotal,
      approvedCount: monthlyApproved.length,
      draftCount,
      topAcc,
      topAmount,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "ALL" && it.status !== statusFilter) return false;
      if (!term) return true;
      return (
        it.voucherNo.toLowerCase().includes(term) ||
        it.notes.toLowerCase().includes(term) ||
        it.lines.some(
          (l) =>
            l.memo.toLowerCase().includes(term) ||
            l.accountName.toLowerCase().includes(term) ||
            l.accountCode.toLowerCase().includes(term),
        )
      );
    });
  }, [items, searchTerm, statusFilter]);

  // ─── Open / close handlers ──────────────────────────────────
  const openCreateMode = useCallback(
    (storeIdParam?: string) => {
      const branchUserStoreId =
        viewer?.role === "SUPER_ADMIN" ? null : viewer?.storeId ?? null;
      const finalStoreId = storeIdParam ?? branchUserStoreId ?? null;
      setPickedStoreId(finalStoreId);
      const branchHit = activeBranches.find((b) => b.id === finalStoreId);
      setPickedStoreCode(branchHit?.code ?? "");
      void loadFormConfig();
      void loadCashAccounts();
      setScreenState({ mode: "create" });
    },
    [viewer, activeBranches],
  );

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  // Auto-load EXP voucher # from form-id config. If the EXP series
  // isn't configured yet (backend phase will seed it), fall back to
  // the local incrementing mock so the form still works for review.
  async function loadFormConfig() {
    try {
      const res = await fetch("/api/accounting/settings/form-ids", {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: Array<{ formType: string; code: string; yearToken: string; nextNumber: string }> } | null;
      };
      if (payload.success && payload.data) {
        const expConfig = payload.data.items.find((i) => i.formType === "EXP");
        if (expConfig) {
          const parts = [expConfig.code, expConfig.yearToken, expConfig.nextNumber].filter(Boolean);
          setVoucherNoFromConfig(parts.join("-"));
          return;
        }
      }
    } catch {
      /* fall through to mock */
    }
    setVoucherNoFromConfig(null);
  }

  // Load all active Cash & Cash Equivalents accounts (per §8 pay-from
  // accounts must come from this subtype).
  async function loadCashAccounts() {
    try {
      const res = await fetch(
        "/api/accounting/reports/options/accounts?categoryCode=ASSET&typeName=CASH%20%26%20CASH%20EQUIVALENTS&take=200",
        { headers: { "x-portal": "ACCOUNTING" } },
      );
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: Array<{ id: string; code: string; name: string }> } | null;
      };
      if (payload.success && payload.data) {
        setCashAccounts(payload.data.items.map((a) => ({ id: a.id, code: a.code, name: a.name })));
      }
    } catch {/* silent */}
  }

  // Map a list-API row into the local ExpenseRecord shape used by the
  // list table + KPI computation. The detail view re-fetches with the
  // GET /[id] endpoint to get the full line breakdown.
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = pickedStoreId && viewer?.role === "SUPER_ADMIN"
        ? `?storeId=${encodeURIComponent(pickedStoreId)}`
        : "";
      const res = await fetch(`/api/accounting/expenses${params}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: Array<Record<string, unknown>> } | null;
      };
      if (payload.success && payload.data) {
        const next: ExpenseRecord[] = payload.data.items.map((r) => {
          // List endpoint doesn't return line detail — pad an array of the
          // right length so `lines.length` renders the count correctly.
          const lineCount = typeof r.lineCount === "number" ? r.lineCount : 0;
          const placeholderLines: ExpenseLine[] = Array.from({ length: lineCount }, (_, idx) => ({
            id: `placeholder-${idx}`,
            accountId: "",
            accountCode: "",
            accountName: "",
            categoryCode: "",
            amount: "0",
            paymentMethod: "CASH" as ExpensePaymentMethod,
            memo: "",
          }));
          return {
            id: r.id as string,
            voucherNo: r.voucherNumber as string,
            expenseDate: r.voucherDate as string,
            payFromAccountId: "",
            payFromAccountCode: r.payFromAccountCode as string,
            payFromAccountName: r.payFromAccountName as string,
            payFromCategoryCode: "ASSET",
            storeCode: r.storeCode as string,
            storeId: r.storeId as string,
            lines: placeholderLines,
            total: r.total as string,
            notes: (r.notes as string) ?? "",
            status: r.status as ExpenseRecord["status"],
            createdByName: (r.createdByName as string) ?? "",
            createdAt: (r.approvedAt as string) ?? "",
            approvedAt: (r.approvedAt as string) ?? undefined,
          };
        });
        setItems(next);
      }
    } catch {
      setToast({ tone: "error", message: "Failed to load expense vouchers." });
    } finally {
      setListLoading(false);
    }
  }, [pickedStoreId, viewer]);

  // Initial list load + reload when branch picker changes for super admins.
  useEffect(() => {
    if (viewerLoading) return;
    void loadList();
  }, [viewerLoading, loadList]);

  // Fetch detail (full line breakdown) and switch to preview mode.
  const openPreview = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/accounting/expenses/${id}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { voucher: {
          id: string; voucherNumber: string; voucherDate: string; status: string;
          currency: string; preparedBy: string; reference: string; notes: string; total: string;
          approvedAt: string | null; createdByName: string; approvedByName: string | null;
          store: { id: string; code: string };
          payFromAccount: { id: string; code: string; name: string; categoryCode: string };
          lines: Array<{ id: string; accountId: string; accountCode: string; accountName: string; accountCategoryCode: string; amount: string; paymentMethod: string; memo: string }>;
        } } | null;
      };
      if (!payload.success || !payload.data) {
        setToast({ tone: "error", message: "Could not load voucher detail." });
        return;
      }
      const v = payload.data.voucher;
      const record: ExpenseRecord = {
        id: v.id,
        voucherNo: v.voucherNumber,
        expenseDate: v.voucherDate,
        payFromAccountId: v.payFromAccount.id,
        payFromAccountCode: v.payFromAccount.code,
        payFromAccountName: v.payFromAccount.name,
        payFromCategoryCode: v.payFromAccount.categoryCode,
        storeCode: v.store.code,
        storeId: v.store.id,
        lines: v.lines.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          accountCode: l.accountCode,
          accountName: l.accountName,
          categoryCode: l.accountCategoryCode,
          amount: l.amount,
          paymentMethod: (l.paymentMethod as ExpensePaymentMethod) ?? "CASH",
          memo: l.memo,
        })),
        total: v.total,
        notes: v.notes,
        status: v.status as ExpenseRecord["status"],
        createdByName: v.createdByName,
        createdAt: "",
        approvedAt: v.approvedAt ?? undefined,
        approvedByName: v.approvedByName ?? undefined,
      };
      setScreenState({ mode: "preview", item: record });
    } catch {
      setToast({ tone: "error", message: "Network error loading voucher." });
    }
  }, []);

  // Create handler — POSTs to the create-draft API.
  async function handleCreateDraft(draft: ExpenseDraftInput) {
    if (!draft.payFromAccount) return;
    setSaving(true);
    try {
      const body = {
        storeId: pickedStoreId ?? undefined,
        voucherDate: draft.expenseDate,
        payFromAccountId: draft.payFromAccount.id,
        currency: "LKR",
        preparedBy: "",
        reference: "",
        notes: draft.notes,
        lines: draft.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          paymentMethod: l.paymentMethod,
          memo: l.memo,
        })),
      };
      const res = await fetch("/api/accounting/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { id: string; voucherNumber: string } | null;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setToast({ tone: "error", message: payload.message ?? "Failed to save voucher." });
        return;
      }
      setToast({ tone: "success", message: `Saved ${payload.data.voucherNumber} as draft.` });
      await loadList();
      await openPreview(payload.data.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(itemId: string) {
    try {
      const res = await fetch(`/api/accounting/expenses/${itemId}/approve`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setToast({ tone: "error", message: payload.message ?? "Approval failed." });
        return;
      }
      setToast({ tone: "success", message: "Voucher approved and posted to GL." });
      await loadList();
      await openPreview(itemId);
    } catch {
      setToast({ tone: "error", message: "Network error approving voucher." });
    }
  }

  // ─── Header (intro) — switches per mode, like the invoice screen
  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "ACCOUNTS / EXPENSES / CREATE",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeCreateMode}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={EXPENSE_FORM_ID}
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Voucher"}
            </button>
          </div>
        ),
      };
    }
    if (screenState.mode === "preview") {
      return {
        eyebrow: "ACCOUNTS / EXPENSES / PREVIEW",
      };
    }
    return {
      eyebrow: "ACCOUNTS / EXPENSES",
      title: "Expense voucher workspace with branch-aware approvals.",
      description:
        "Capture any expense or asset purchase — single voucher per spend, any account, automatic Dr/Cr based on account category, posts to GL once approved.",
      action: (
        <BranchAwareCreateButton
          label="New Expense"
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
      <AccountingPageIntro
        eyebrow={intro.eyebrow}
        title={intro.title}
        description={intro.description}
        action={intro.action}
      />

      {screenState.mode === "list" ? (
        <>
          <PremiumMetricGrid
            items={[
              {
                label: "This month total",
                value: formatMoney(kpis.monthlyTotal),
                detail: `${kpis.approvedCount} approved voucher${kpis.approvedCount === 1 ? "" : "s"}`,
                icon: TrendingDown,
                tone: "amber",
              },
              {
                label: "Top account",
                value: kpis.topAcc === "—" ? "—" : formatMoney(kpis.topAmount),
                detail: kpis.topAcc,
                icon: Receipt,
                tone: "violet",
              },
              {
                label: "Approved",
                value: String(kpis.approvedCount),
                detail: "Posted to GL this month",
                icon: CheckCircle2,
                tone: "green",
              },
              {
                label: "Drafts",
                value: String(kpis.draftCount),
                detail: "Awaiting approval",
                icon: PencilLine,
                tone: "blue",
              },
            ]}
          />

          <SurfaceCard>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a59889]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search voucher #, memo, account…"
                  className="h-11 w-full rounded-xl border border-[#e2d8cf] bg-white pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["ALL", "DRAFT", "APPROVED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                      statusFilter === s
                        ? "border-[#ff7a12] bg-[#ff7a12] text-white"
                        : "border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                    }`}
                  >
                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard title="Expense vouchers" description="Most recent at the top.">
            <div className="overflow-hidden rounded-2xl border border-[#ede8e3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#faf6f2]">
                    <Th>Voucher</Th>
                    <Th>Date</Th>
                    <Th>Lines</Th>
                    <Th>Pay from</Th>
                    <Th className="text-right">Total</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#9a8f85]">
                        {searchTerm
                          ? `No expenses match "${searchTerm}".`
                          : "No expenses yet. Click New Expense to create the first one."}
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((it, idx) => (
                      <tr key={it.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
                        <Td>
                          <span className="font-mono text-[12px] font-semibold text-[#1f1d1c]">
                            {it.voucherNo}
                          </span>
                        </Td>
                        <Td className="text-[#5f5751]">{formatDate(it.expenseDate)}</Td>
                        <Td className="text-[#5f5751]">
                          {it.lines.length} line{it.lines.length === 1 ? "" : "s"}
                        </Td>
                        <Td className="text-[#5f5751]">
                          <span className="font-mono text-[11px]">{it.payFromAccountCode}</span>
                          <span className="ml-1 text-[11px] text-[#9a8f85]">
                            {it.payFromAccountName}
                          </span>
                        </Td>
                        <Td className="text-right font-semibold tabular-nums text-[#1f1d1c]">
                          {formatMoney(it.total)}
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              it.status === "APPROVED"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : it.status === "DRAFT"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {it.status}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <button
                            type="button"
                            onClick={() => void openPreview(it.id)}
                            className="text-xs font-semibold text-[#ff7a12] transition hover:underline"
                          >
                            View
                          </button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        </>
      ) : null}

      {screenState.mode === "create" ? (
        <ExpenseFormPanel
          formId={EXPENSE_FORM_ID}
          voucherNo={voucherNoFromConfig ?? nextVoucherNumber(items, null)}
          pickedStoreCode={pickedStoreCode}
          cashAccounts={cashAccounts}
          onSubmit={handleCreateDraft}
        />
      ) : null}

      {screenState.mode === "preview" ? (
        <ExpensePreviewPanel
          item={screenState.item}
          onBack={() => setScreenState({ mode: "list" })}
          onApprove={() => handleApprove(screenState.item.id)}
        />
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border px-5 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span className="inline-flex items-center gap-3">
            {toast.message}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-current/60 hover:text-current"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ) : null}
    </>
  );
}

// ─── Create form panel ───────────────────────────────────────────

type ExpenseDraftInput = {
  expenseDate: string;
  payFromAccount: CashAccountOption | null;
  lines: ExpenseLine[];
  notes: string;
};

function ExpenseFormPanel({
  formId,
  voucherNo,
  pickedStoreCode,
  cashAccounts,
  onSubmit,
}: {
  formId: string;
  voucherNo: string;
  pickedStoreCode: string;
  cashAccounts: CashAccountOption[];
  onSubmit: (draft: ExpenseDraftInput) => void;
}) {
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [payFromAccountId, setPayFromAccountId] = useState("");
  const [lines, setLines] = useState<ExpenseLine[]>([
    {
      id: `line-${Date.now()}`,
      accountId: "",
      accountCode: "",
      accountName: "",
      categoryCode: "",
      amount: "",
      paymentMethod: "CASH",
      memo: "",
    },
  ]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const payFromAcc = cashAccounts.find((a) => a.id === payFromAccountId);

  const jePreview = useMemo(
    () =>
      computeJePreview(
        lines,
        payFromAcc?.code ?? "",
        payFromAcc?.name ?? "",
        voucherNo,
      ),
    [lines, payFromAcc, voucherNo],
  );

  function updateLine(id: string, patch: Partial<ExpenseLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        accountId: "",
        accountCode: "",
        accountName: "",
        categoryCode: "",
        amount: "",
        paymentMethod: "CASH",
        memo: "",
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expenseDate) {
      setError("Expense date is required.");
      return;
    }
    if (!payFromAcc) {
      setError("Pick a pay-from cash or bank account.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line.");
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.accountId) {
        setError(`Line ${i + 1}: pick an account.`);
        return;
      }
      const n = Number(l.amount);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Line ${i + 1}: amount must be greater than 0.`);
        return;
      }
      if (!l.memo.trim()) {
        setError(`Line ${i + 1}: memo is required.`);
        return;
      }
    }
    setError(null);
    onSubmit({
      expenseDate,
      payFromAccount: payFromAcc,
      lines,
      notes: notes.trim(),
    });
  }

  // Track total amount across lines (used for the footer + helper).
  const linesTotal = lines.reduce((s, l) => {
    const n = Number(l.amount);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <form id={formId} onSubmit={handleSubmit} className="contents">
      {/* Header card (slim, matches invoice form style) */}
      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
              Voucher number
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tracking-[-0.01em] text-[#1f1d1c]">
              {voucherNo}
            </p>
            <p className="mt-1 text-xs text-[#7b736d]">
              Auto-assigned from the EXP series in form-id config.
            </p>
          </div>
          {pickedStoreCode ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
                Branch
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[#1f1d1c]">
                {pickedStoreCode}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Expense date" required icon={<CalendarRange className="h-3.5 w-3.5" />}>
            <StyledDatePicker
              value={expenseDate}
              onChange={setExpenseDate}
              placeholder="Pick a date"
            />
          </Field>

          <Field
            label="Pay from (cash / bank)"
            required
            icon={<Wallet className="h-3.5 w-3.5" />}
            description="Cash or bank account funding this voucher. Posts a balancing credit (or debit, depending on the lines)."
          >
            <StyledSelect
              value={payFromAccountId}
              onChange={(v) => setPayFromAccountId(v)}
              placeholder={
                cashAccounts.length
                  ? "Pick a cash or bank account…"
                  : "No Cash & Cash Equivalents accounts configured."
              }
              options={cashAccounts.map((a) => ({
                value: a.id,
                label: `${a.code} · ${a.name}`,
              }))}
            />
          </Field>
        </div>
      </SurfaceCard>

      {/* Lines */}
      <SurfaceCard
        title="Voucher lines"
        description="Pick any account (Assets, Liabilities, Equity, Income, Expenses). Every line is debited; the pay-from cash account is credited for the voucher total."
        overflow="visible"
      >
        <div className="overflow-x-auto rounded-2xl border border-[#ede8e3]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#faf6f2]">
                <Th className="w-10">#</Th>
                <Th>Account</Th>
                <Th className="text-right w-32">Amount (LKR)</Th>
                <Th className="w-44">Payment method</Th>
                <Th>Memo</Th>
                <Th className="w-12 text-center">—</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={line.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}
                >
                  <Td className="text-center font-semibold text-[#9a8f85]">
                    {idx + 1}
                  </Td>
                  <Td>
                    <CategorizedAccountPicker
                      value={line.accountId}
                      displayLabel={
                        line.accountId
                          ? `${line.accountCode} · ${line.accountName}`
                          : undefined
                      }
                      onChange={(acc) => {
                        if (!acc) {
                          updateLine(line.id, {
                            accountId: "",
                            accountCode: "",
                            accountName: "",
                            categoryCode: "",
                          });
                          return;
                        }
                        updateLine(line.id, {
                          accountId: acc.id,
                          accountCode: acc.code,
                          accountName: acc.name,
                          categoryCode: acc.categoryCode,
                        });
                      }}
                      placeholder="Pick account…"
                    />
                  </Td>
                  <Td className="text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={line.amount}
                      onChange={(e) =>
                        updateLine(line.id, { amount: e.target.value })
                      }
                      placeholder="0.00"
                      className="h-10 w-full rounded-lg border border-[#e2d8cf] bg-white px-3 text-right text-sm font-semibold tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
                    />
                  </Td>
                  <Td>
                    <StyledSelect
                      value={line.paymentMethod}
                      onChange={(v) =>
                        updateLine(line.id, {
                          paymentMethod: v as ExpensePaymentMethod,
                        })
                      }
                      placeholder="Cash"
                      options={PAYMENT_METHOD_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                    />
                  </Td>
                  <Td>
                    <input
                      type="text"
                      value={line.memo}
                      onChange={(e) => updateLine(line.id, { memo: e.target.value })}
                      placeholder="Memo for this line…"
                      className="h-10 w-full rounded-lg border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
                    />
                  </Td>
                  <Td className="text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length === 1}
                      title={lines.length === 1 ? "At least one line is required" : "Remove line"}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#eadfd5] text-[#9a8f85] transition hover:border-[#ffc3a8] hover:bg-[#fff5ec] hover:text-[#b94f37] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#ede8e3] bg-[#fff5ec]">
                <td colSpan={2} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#ffcfaa] bg-white px-3 py-1.5 text-xs font-semibold text-[#bb5c12] transition hover:bg-[#fff7f0]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add line
                  </button>
                </td>
                <td className="px-4 py-3 text-right font-sans text-lg font-bold tabular-nums text-[#ff7a12]">
                  {formatMoney(linesTotal)}
                </td>
                <td colSpan={3} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a3f0a]">
                  Voucher total
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SurfaceCard>

      {/* JE preview */}
      {jePreview.rows.length > 0 ? (
        <SurfaceCard
          title="Journal entry preview"
          description="Posts when this voucher is approved. Every line is debited; the pay-from cash account takes a single credit for the voucher total."
        >
          <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f2]">
                  <Th>Account</Th>
                  <Th>Memo</Th>
                  <Th className="text-right">Debit</Th>
                  <Th className="text-right">Credit</Th>
                </tr>
              </thead>
              <tbody>
                {jePreview.rows.map((r, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
                    <Td className="font-mono text-[12px] font-semibold text-[#1f1d1c]">
                      {r.accountLabel}
                    </Td>
                    <Td className="text-[#3f3833]">{r.memo || "—"}</Td>
                    <Td className="text-right tabular-nums font-semibold">
                      {r.debit > 0 ? formatMoney(r.debit) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">
                      {r.credit > 0 ? formatMoney(r.credit) : "—"}
                    </Td>
                  </tr>
                ))}
                <tr className="border-t border-[#e2d8cf] bg-[#fff5ec]">
                  <Td colSpan={2} className="text-right font-semibold text-[#7a3f0a]">
                    JE Subtotal
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-[#7a3f0a]">
                    {formatMoney(jePreview.totalDebit)}
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-[#7a3f0a]">
                    {formatMoney(jePreview.totalCredit)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      ) : null}

      {/* Notes */}
      <SurfaceCard title="Notes" description="Optional internal notes for this voucher.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal-only notes — reference numbers, receipts, etc."
          className="w-full rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
        />
        {error ? (
          <div className="mt-4 rounded-xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error}
          </div>
        ) : null}
        <div className="mt-4 text-xs text-[#7b736d]">
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-[#ff7a12]" />
          Saves as <span className="font-semibold">DRAFT</span>. Journal entries
          post once approved.
        </div>
      </SurfaceCard>
    </form>
  );
}

// ─── Preview / approve panel ─────────────────────────────────────

function ExpensePreviewPanel({
  item,
  onBack,
  onApprove,
}: {
  item: ExpenseRecord;
  onBack: () => void;
  onApprove: () => void;
}) {
  const [approving, setApproving] = useState(false);

  // Build the JE preview from the saved record (uses the same
  // computation so the displayed Dr/Cr matches what posting will do).
  const je = useMemo(
    () =>
      computeJePreview(
        item.lines,
        item.payFromAccountCode,
        item.payFromAccountName,
        item.voucherNo,
      ),
    [item],
  );

  function handleApprove() {
    setApproving(true);
    setTimeout(() => {
      onApprove();
      setApproving(false);
    }, 200);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to expenses
        </button>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
            item.status === "APPROVED"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : item.status === "DRAFT"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {item.status}
        </span>
      </div>

      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
              {item.voucherNo}
            </p>
            <h2 className="mt-1 font-sans text-2xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
              Expense Voucher
            </h2>
            <p className="mt-1 text-sm text-[#6f6861]">
              {formatDate(item.expenseDate)} · {item.storeCode || "—"} · Created by{" "}
              {item.createdByName}
              {item.approvedAt
                ? ` · Approved by ${item.approvedByName} on ${formatDate(item.approvedAt.slice(0, 10))}`
                : ""}
            </p>
            <p className="mt-2 text-sm text-[#3f3833]">
              <span className="font-semibold">Pay from:</span>{" "}
              <span className="font-mono text-[12px]">{item.payFromAccountCode}</span>
              <span className="ml-1 text-[#9a8f85]">{item.payFromAccountName}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
              Voucher total
            </p>
            <p className="mt-1 font-sans text-3xl font-bold tracking-[-0.03em] text-[#1f1d1c]">
              {formatMoney(item.total)}
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Voucher lines">
        <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf6f2]">
                <Th className="w-10">#</Th>
                <Th>Account</Th>
                <Th className="text-right">Amount</Th>
                <Th>Payment method</Th>
                <Th>Memo</Th>
              </tr>
            </thead>
            <tbody>
              {item.lines.map((l, idx) => (
                <tr key={l.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
                  <Td className="text-center text-[#9a8f85]">{idx + 1}</Td>
                  <Td>
                    <p className="font-semibold text-[#1f1d1c]">{l.accountCode}</p>
                    <p className="text-[11px] text-[#9a8f85]">{l.accountName}</p>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-[#1f1d1c]">
                    {formatMoney(l.amount)}
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        l.paymentMethod === "CASH"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : l.paymentMethod === "CARD"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-violet-200 bg-violet-50 text-violet-700"
                      }`}
                    >
                      {paymentMethodLabel(l.paymentMethod)}
                    </span>
                  </Td>
                  <Td className="text-[#3f3833]">{l.memo || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Posting preview"
        description={
          item.status === "APPROVED"
            ? "Journal entry posted when this voucher was approved."
            : "Journal entry that will post when this voucher is approved."
        }
      >
        <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf6f2]">
                <Th>Account</Th>
                <Th>Memo</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
              </tr>
            </thead>
            <tbody>
              {je.rows.map((r, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
                  <Td className="font-mono text-[12px] font-semibold text-[#1f1d1c]">
                    {r.accountLabel}
                  </Td>
                  <Td className="text-[#3f3833]">{r.memo || "—"}</Td>
                  <Td className="text-right tabular-nums font-semibold">
                    {r.debit > 0 ? formatMoney(r.debit) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold">
                    {r.credit > 0 ? formatMoney(r.credit) : "—"}
                  </Td>
                </tr>
              ))}
              <tr className="border-t border-[#e2d8cf] bg-[#fff5ec]">
                <Td colSpan={2} className="text-right font-semibold text-[#7a3f0a]">
                  JE Subtotal
                </Td>
                <Td className="text-right tabular-nums font-bold text-[#7a3f0a]">
                  {formatMoney(je.totalDebit)}
                </Td>
                <Td className="text-right tabular-nums font-bold text-[#7a3f0a]">
                  {formatMoney(je.totalCredit)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        {item.notes ? (
          <div className="mt-4 rounded-xl border border-[#efe4db] bg-[#fffaf5] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
              Notes
            </p>
            <p className="mt-1 text-sm text-[#3f3833]">{item.notes}</p>
          </div>
        ) : null}

        {item.status === "DRAFT" ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e8e0] pt-5">
            <div className="text-xs text-[#7b736d]">
              <ClipboardList className="mr-1.5 inline h-3.5 w-3.5 text-[#ff7a12]" />
              Review the lines and totals before approving. Approval is
              irreversible (use a reversing voucher to cancel).
            </div>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#18a66a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#138554] disabled:opacity-60"
            >
              {approving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {approving ? "Approving…" : "Approve voucher"}
            </button>
          </div>
        ) : item.status === "APPROVED" ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            This voucher is approved and posted to the GL.
            {item.approvedAt && item.approvedByName
              ? ` Approved by ${item.approvedByName} on ${formatDate(item.approvedAt.slice(0, 10))}.`
              : null}
          </div>
        ) : null}
      </SurfaceCard>
    </>
  );
}

// ─── Small UI primitives ────────────────────────────────────────

function Field({
  label,
  required,
  icon,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
        {icon}
        {label}
        {required ? <span className="text-[#e6395a]">*</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
      {description ? (
        <p className="mt-1 text-[11px] text-[#9a8f85]">{description}</p>
      ) : null}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-[#ede8e3] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-[#ede8e3] px-4 py-2.5 text-sm last:border-b-0 ${className}`}
    >
      {children}
    </td>
  );
}
