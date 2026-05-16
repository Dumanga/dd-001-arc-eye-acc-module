"use client";

// Journal Entry Voucher screen — `/accounting/admin/accounts/journal-entry`.
//
// Matches the expense voucher screen pattern end-to-end:
//
//   - `useViewerAndBranches` + `BranchAwareCreateButton` for the
//     "Create on behalf of branch" flow (super admin picks branch
//     before opening the form; branch users get the plain Create
//     button and the server auto-injects their storeId).
//
//   - Three modes (list / create / preview) driven from a single
//     <AccountingPageIntro> whose eyebrow + action change per mode.
//
//   - Lines table is fully account-agnostic. Each row picks ANY
//     active chart-of-accounts row via the categorised picker and
//     enters either a Debit or Credit amount (not both). The form
//     validates that the JE balances (∑Dr = ∑Cr) before saving.
//
// UI-first phase: voucher # auto-loaded from /settings/form-ids
// (JEV series). Save and Approve are local-state mocked; backend
// wiring (GL posting) lands once accounting theories are finalised.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PencilLine,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
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
import {
  CategorizedAccountPicker,
  type CategorizedAccount,
} from "@/components/accounting/categorized-account-picker";

const JEV_FORM_ID = "journal-entry-voucher-form";

// ─── Types ───────────────────────────────────────────────────────

export type JevLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  categoryCode: string;
  debit: string;
  credit: string;
  memo: string;
};

export type JevRecord = {
  id: string;
  voucherNo: string;
  entryDate: string;
  storeCode: string;
  storeId: string;
  lines: JevLine[];
  totalDebit: string;
  totalCredit: string;
  description: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  createdByName: string;
  createdAt: string;
  postedAt?: string | null;
  postedByName?: string | null;
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; item: JevRecord };

// ─── Helpers ─────────────────────────────────────────────────────

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

function nextVoucherNumber(existing: JevRecord[], baseFromConfig: string | null): string {
  if (baseFromConfig) return baseFromConfig;
  const max = existing
    .map((it) => Number(it.voucherNo.split("-").pop() ?? "0"))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `JEV-2026-${String(max + 1).padStart(5, "0")}`;
}

// ─── Mock initial data ───────────────────────────────────────────


// ─── Main screen ─────────────────────────────────────────────────

export function JournalEntryScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [items, setItems] = useState<JevRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "POSTED">("ALL");
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [pickedStoreCode, setPickedStoreCode] = useState<string>("");
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();

  const [voucherNoFromConfig, setVoucherNoFromConfig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kpis = useMemo(() => {
    const monthlyPosted = items.filter(
      (it) => it.status === "POSTED" && isCurrentMonth(it.entryDate),
    );
    const monthlyVolume = monthlyPosted.reduce(
      (s, it) => s + Number(it.totalDebit),
      0,
    );
    const draftCount = items.filter((it) => it.status === "DRAFT").length;
    return {
      monthlyVolume,
      postedCount: monthlyPosted.length,
      draftCount,
      totalCount: items.length,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "ALL" && it.status !== statusFilter) return false;
      if (!term) return true;
      return (
        it.voucherNo.toLowerCase().includes(term) ||
        it.description.toLowerCase().includes(term) ||
        it.lines.some(
          (l) =>
            l.memo.toLowerCase().includes(term) ||
            l.accountName.toLowerCase().includes(term) ||
            l.accountCode.toLowerCase().includes(term),
        )
      );
    });
  }, [items, searchTerm, statusFilter]);

  const openCreateMode = useCallback(
    (storeIdParam?: string) => {
      const branchUserStoreId =
        viewer?.role === "SUPER_ADMIN" ? null : viewer?.storeId ?? null;
      const finalStoreId = storeIdParam ?? branchUserStoreId ?? null;
      setPickedStoreId(finalStoreId);
      const branchHit = activeBranches.find((b) => b.id === finalStoreId);
      setPickedStoreCode(branchHit?.code ?? "");
      void loadFormConfig();
      setScreenState({ mode: "create" });
    },
    [viewer, activeBranches],
  );

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

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
        const jevConfig = payload.data.items.find((i) => i.formType === "JEV");
        if (jevConfig) {
          const parts = [jevConfig.code, jevConfig.yearToken, jevConfig.nextNumber].filter(Boolean);
          setVoucherNoFromConfig(parts.join("-"));
          return;
        }
      }
    } catch {
      /* fall through to local mock */
    }
    setVoucherNoFromConfig(null);
  }

  // Load list from the API. Branch users hit the server with no storeId
  // (server scopes to their store); super-admin sees all branches.
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = pickedStoreId && viewer?.role === "SUPER_ADMIN"
        ? `?storeId=${encodeURIComponent(pickedStoreId)}`
        : "";
      const res = await fetch(`/api/accounting/journal-vouchers${params}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: Array<Record<string, unknown>> } | null;
      };
      if (payload.success && payload.data) {
        const next: JevRecord[] = payload.data.items.map((r) => {
          const lineCount = typeof r.lineCount === "number" ? r.lineCount : 0;
          // Pad placeholder lines so list table renders "{lines.length}" right.
          const placeholderLines: JevLine[] = Array.from({ length: lineCount }, (_, idx) => ({
            id: `placeholder-${idx}`,
            accountId: "",
            accountCode: "",
            accountName: "",
            categoryCode: "",
            debit: "",
            credit: "",
            memo: "",
          }));
          return {
            id: r.id as string,
            voucherNo: r.voucherNumber as string,
            entryDate: r.entryDate as string,
            storeCode: r.storeCode as string,
            storeId: r.storeId as string,
            lines: placeholderLines,
            totalDebit: r.total as string,
            totalCredit: r.total as string,
            description: (r.description as string) ?? "",
            status: r.status as JevRecord["status"],
            createdByName: (r.createdByName as string) ?? "",
            createdAt: "",
            postedAt: (r.postedAt as string) ?? null,
          };
        });
        setItems(next);
      }
    } catch {
      setToast({ tone: "error", message: "Failed to load journal vouchers." });
    } finally {
      setListLoading(false);
    }
  }, [pickedStoreId, viewer]);

  // Initial list load + reload when branch picker changes.
  useEffect(() => {
    if (viewerLoading) return;
    void loadList();
  }, [viewerLoading, loadList]);

  // Fetch detail (full line breakdown) and switch to preview mode.
  const openPreview = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/accounting/journal-vouchers/${id}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { voucher: {
          id: string; voucherNumber: string; entryDate: string; status: string;
          currency: string; description: string; notes: string; total: string;
          postedAt: string | null; createdByName: string; postedByName: string | null;
          store: { id: string; code: string };
          lines: Array<{ id: string; accountId: string; accountCode: string; accountName: string; accountCategoryCode: string; debitAmount: string; creditAmount: string; memo: string }>;
        } } | null;
      };
      if (!payload.success || !payload.data) {
        setToast({ tone: "error", message: "Could not load voucher detail." });
        return;
      }
      const v = payload.data.voucher;
      const totalDebit = v.lines.reduce((s, l) => s + Number(l.debitAmount), 0).toFixed(2);
      const totalCredit = v.lines.reduce((s, l) => s + Number(l.creditAmount), 0).toFixed(2);
      const record: JevRecord = {
        id: v.id,
        voucherNo: v.voucherNumber,
        entryDate: v.entryDate,
        storeCode: v.store.code,
        storeId: v.store.id,
        lines: v.lines.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          accountCode: l.accountCode,
          accountName: l.accountName,
          categoryCode: l.accountCategoryCode,
          debit: Number(l.debitAmount) > 0 ? Number(l.debitAmount).toFixed(2) : "",
          credit: Number(l.creditAmount) > 0 ? Number(l.creditAmount).toFixed(2) : "",
          memo: l.memo,
        })),
        totalDebit,
        totalCredit,
        description: v.description,
        status: v.status as JevRecord["status"],
        createdByName: v.createdByName,
        createdAt: "",
        postedAt: v.postedAt ?? null,
        postedByName: v.postedByName ?? null,
      };
      setScreenState({ mode: "preview", item: record });
    } catch {
      setToast({ tone: "error", message: "Network error loading voucher." });
    }
  }, []);

  async function handleCreateDraft(draft: JevDraftInput) {
    setSaving(true);
    try {
      const body = {
        storeId: pickedStoreId ?? undefined,
        entryDate: draft.entryDate,
        description: draft.description,
        currency: "LKR",
        notes: "",
        lines: draft.lines.map((l) => ({
          accountId: l.accountId,
          debitAmount: l.debit || "0",
          creditAmount: l.credit || "0",
          memo: l.memo,
        })),
      };
      const res = await fetch("/api/accounting/journal-vouchers", {
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

  async function handlePost(itemId: string) {
    try {
      const res = await fetch(`/api/accounting/journal-vouchers/${itemId}/approve`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setToast({ tone: "error", message: payload.message ?? "Posting failed." });
        return;
      }
      setToast({ tone: "success", message: "Voucher posted to GL." });
      await loadList();
      await openPreview(itemId);
    } catch {
      setToast({ tone: "error", message: "Network error posting voucher." });
    }
  }

  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "ACCOUNTS / JOURNAL ENTRY / CREATE",
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
              form={JEV_FORM_ID}
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Journal Entry"}
            </button>
          </div>
        ),
      };
    }
    if (screenState.mode === "preview") {
      return { eyebrow: "ACCOUNTS / JOURNAL ENTRY / PREVIEW" };
    }
    return {
      eyebrow: "ACCOUNTS / JOURNAL ENTRY",
      title: "Manual journal entries for transactions that have no dedicated form.",
      description:
        "Post any debit/credit pair directly to the GL — depreciation, accruals, corrections, opening balances. Every JEV must balance (∑Dr = ∑Cr) before it can be posted.",
      action: (
        <BranchAwareCreateButton
          label="New Journal Entry"
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
                label: "Posted volume this month",
                value: formatMoney(kpis.monthlyVolume),
                detail: `${kpis.postedCount} posted voucher${kpis.postedCount === 1 ? "" : "s"}`,
                icon: TrendingDown,
                tone: "amber",
              },
              {
                label: "Total vouchers",
                value: String(kpis.totalCount),
                detail: "All time",
                icon: Receipt,
                tone: "violet",
              },
              {
                label: "Posted",
                value: String(kpis.postedCount),
                detail: "GL updated this month",
                icon: CheckCircle2,
                tone: "green",
              },
              {
                label: "Drafts",
                value: String(kpis.draftCount),
                detail: "Awaiting review",
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
                  placeholder="Search voucher #, description, account…"
                  className="h-11 w-full rounded-xl border border-[#e2d8cf] bg-white pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["ALL", "DRAFT", "POSTED"] as const).map((s) => (
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

          <SurfaceCard title="Journal entry vouchers" description="Most recent at the top.">
            <div className="overflow-hidden rounded-2xl border border-[#ede8e3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#faf6f2]">
                    <Th>Voucher</Th>
                    <Th>Date</Th>
                    <Th>Lines</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Dr / Cr</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#9a8f85]">
                        {searchTerm
                          ? `No journal entries match "${searchTerm}".`
                          : "No journal entries yet. Click New Journal Entry to create the first one."}
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
                        <Td className="text-[#5f5751]">{formatDate(it.entryDate)}</Td>
                        <Td className="text-[#5f5751]">
                          {it.lines.length} line{it.lines.length === 1 ? "" : "s"}
                        </Td>
                        <Td className="max-w-[200px] truncate text-[#5f5751]">
                          {it.description || "—"}
                        </Td>
                        <Td className="text-right font-semibold tabular-nums text-[#1f1d1c]">
                          {formatMoney(it.totalDebit)}
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              it.status === "POSTED"
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
        <JevFormPanel
          formId={JEV_FORM_ID}
          voucherNo={nextVoucherNumber(items, voucherNoFromConfig)}
          pickedStoreCode={pickedStoreCode}
          onSubmit={handleCreateDraft}
        />
      ) : null}

      {screenState.mode === "preview" ? (
        <JevPreviewPanel
          item={screenState.item}
          onBack={() => setScreenState({ mode: "list" })}
          onPost={() => handlePost(screenState.item.id)}
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

type JevDraftInput = {
  entryDate: string;
  lines: JevLine[];
  description: string;
};

function JevFormPanel({
  formId,
  voucherNo,
  pickedStoreCode,
  onSubmit,
}: {
  formId: string;
  voucherNo: string;
  pickedStoreCode: string;
  onSubmit: (draft: JevDraftInput) => void;
}) {
  const [entryDate, setEntryDate] = useState(todayIso());
  const [lines, setLines] = useState<JevLine[]>([
    {
      id: `line-${Date.now()}-0`,
      accountId: "",
      accountCode: "",
      accountName: "",
      categoryCode: "",
      debit: "",
      credit: "",
      memo: "",
    },
    {
      id: `line-${Date.now()}-1`,
      accountId: "",
      accountCode: "",
      accountName: "",
      categoryCode: "",
      debit: "",
      credit: "",
      memo: "",
    },
  ]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalDebit = lines.reduce((s, l) => {
    const n = Number(l.debit);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const totalCredit = lines.reduce((s, l) => {
    const n = Number(l.credit);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function updateLine(id: string, patch: Partial<JevLine>) {
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
        debit: "",
        credit: "",
        memo: "",
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.id !== id)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryDate) {
      setError("Entry date is required.");
      return;
    }
    if (lines.length < 2) {
      setError("A journal entry requires at least two lines.");
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.accountId) {
        setError(`Line ${i + 1}: pick an account.`);
        return;
      }
      const dr = Number(l.debit);
      const cr = Number(l.credit);
      const hasDebit = Number.isFinite(dr) && dr > 0;
      const hasCredit = Number.isFinite(cr) && cr > 0;
      if (!hasDebit && !hasCredit) {
        setError(`Line ${i + 1}: enter either a debit or credit amount.`);
        return;
      }
      if (hasDebit && hasCredit) {
        setError(`Line ${i + 1}: a line cannot have both a debit and a credit amount.`);
        return;
      }
      if (!l.memo.trim()) {
        setError(`Line ${i + 1}: memo is required.`);
        return;
      }
    }
    if (!isBalanced) {
      setError(
        `Journal entry does not balance — debits ${formatMoney(totalDebit)} ≠ credits ${formatMoney(totalCredit)}.`,
      );
      return;
    }
    setError(null);
    onSubmit({ entryDate, lines, description: description.trim() });
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="contents">
      {/* Header card */}
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
              Auto-assigned from the JEV series in form-id config.
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
          <Field label="Entry date" required icon={<CalendarRange className="h-3.5 w-3.5" />}>
            <StyledDatePicker
              value={entryDate}
              onChange={setEntryDate}
              placeholder="Pick a date"
            />
          </Field>

          <Field
            label="Description"
            icon={<BookOpenText className="h-3.5 w-3.5" />}
            description="Short narrative for this journal entry — appears in the GL reference."
          >
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly depreciation — May 2026"
              className="h-11 w-full rounded-xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
            />
          </Field>
        </div>
      </SurfaceCard>

      {/* Lines */}
      <SurfaceCard
        title="Journal entry lines"
        description="Enter a debit OR credit for each line. The entry must balance (∑Dr = ∑Cr) before it can be saved."
        overflow="visible"
      >
        {/* Balance indicator */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2 text-sm">
            <span className="text-[#9a8f85]">Total Dr:</span>
            <span className="font-semibold tabular-nums text-[#1f1d1c]">
              {formatMoney(totalDebit)}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2 text-sm">
            <span className="text-[#9a8f85]">Total Cr:</span>
            <span className="font-semibold tabular-nums text-[#1f1d1c]">
              {formatMoney(totalCredit)}
            </span>
          </div>
          {totalDebit > 0 || totalCredit > 0 ? (
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                isBalanced
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {isBalanced ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {isBalanced ? "Balanced" : "Not balanced"}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#ede8e3]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#faf6f2]">
                <Th className="w-10">#</Th>
                <Th>Account</Th>
                <Th className="w-36 text-right">Debit (LKR)</Th>
                <Th className="w-36 text-right">Credit (LKR)</Th>
                <Th>Memo</Th>
                <Th className="w-12 text-center">—</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
                  <Td className="text-center font-semibold text-[#9a8f85]">{idx + 1}</Td>
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
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(line.id, { debit: e.target.value, credit: e.target.value ? "" : line.credit })
                      }
                      placeholder="0.00"
                      className="h-10 w-full rounded-lg border border-[#e2d8cf] bg-white px-3 text-right text-sm font-semibold tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ff7a12] disabled:bg-[#faf6f2] disabled:text-[#9a8f85]"
                      disabled={!!line.credit}
                    />
                  </Td>
                  <Td className="text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(line.id, { credit: e.target.value, debit: e.target.value ? "" : line.debit })
                      }
                      placeholder="0.00"
                      className="h-10 w-full rounded-lg border border-[#e2d8cf] bg-white px-3 text-right text-sm font-semibold tabular-nums text-[#1f1d1c] outline-none transition focus:border-[#ff7a12] disabled:bg-[#faf6f2] disabled:text-[#9a8f85]"
                      disabled={!!line.debit}
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
                      disabled={lines.length <= 2}
                      title={lines.length <= 2 ? "A JEV requires at least two lines" : "Remove line"}
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
                <td className="px-4 py-3 text-right font-bold tabular-nums text-[#ff7a12]">
                  {formatMoney(totalDebit)}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-[#ff7a12]">
                  {formatMoney(totalCredit)}
                </td>
                <td colSpan={2} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7a3f0a]">
                  Totals
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SurfaceCard>

      {/* Notes / error */}
      <SurfaceCard title="Notes" description="Optional internal notes for this journal entry.">
        {error ? (
          <div className="mb-4 rounded-xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error}
          </div>
        ) : null}
        <div className="text-xs text-[#7b736d]">
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-[#ff7a12]" />
          Saves as <span className="font-semibold">DRAFT</span>. Journal entries post to the GL
          once reviewed and approved.
        </div>
      </SurfaceCard>
    </form>
  );
}

// ─── Preview / post panel ────────────────────────────────────────

function JevPreviewPanel({
  item,
  onBack,
  onPost,
}: {
  item: JevRecord;
  onBack: () => void;
  onPost: () => void;
}) {
  const [posting, setPosting] = useState(false);

  function handlePost() {
    setPosting(true);
    setTimeout(() => {
      onPost();
      setPosting(false);
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
          Back to journal entries
        </button>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
            item.status === "POSTED"
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
              Journal Entry Voucher
            </h2>
            <p className="mt-1 text-sm text-[#6f6861]">
              {formatDate(item.entryDate)} · {item.storeCode || "—"} · Created by{" "}
              {item.createdByName}
              {item.postedAt
                ? ` · Posted by ${item.postedByName} on ${formatDate(item.postedAt.slice(0, 10))}`
                : ""}
            </p>
            {item.description ? (
              <p className="mt-2 text-sm font-medium text-[#3f3833]">{item.description}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
              Dr / Cr total
            </p>
            <p className="mt-1 font-sans text-3xl font-bold tracking-[-0.03em] text-[#1f1d1c]">
              {formatMoney(item.totalDebit)}
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard title="Journal entry lines">
        <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#faf6f2]">
                <Th className="w-10">#</Th>
                <Th>Account</Th>
                <Th>Memo</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
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
                  <Td className="text-[#3f3833]">{l.memo || "—"}</Td>
                  <Td className="text-right font-semibold tabular-nums text-[#1f1d1c]">
                    {l.debit ? formatMoney(l.debit) : "—"}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-[#1f1d1c]">
                    {l.credit ? formatMoney(l.credit) : "—"}
                  </Td>
                </tr>
              ))}
              <tr className="border-t border-[#e2d8cf] bg-[#fff5ec]">
                <Td colSpan={3} className="text-right font-semibold text-[#7a3f0a]">
                  Total
                </Td>
                <Td className="text-right font-bold tabular-nums text-[#7a3f0a]">
                  {formatMoney(item.totalDebit)}
                </Td>
                <Td className="text-right font-bold tabular-nums text-[#7a3f0a]">
                  {formatMoney(item.totalCredit)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        {item.status === "DRAFT" ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e8e0] pt-5">
            <div className="text-xs text-[#7b736d]">
              <ClipboardList className="mr-1.5 inline h-3.5 w-3.5 text-[#ff7a12]" />
              Verify debits equal credits before posting. Posting writes to the GL and cannot
              be undone without a reversing entry.
            </div>
            <button
              type="button"
              onClick={handlePost}
              disabled={posting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#18a66a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#138554] disabled:opacity-60"
            >
              {posting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {posting ? "Posting…" : "Post to GL"}
            </button>
          </div>
        ) : item.status === "POSTED" ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            This journal entry is posted to the GL.
            {item.postedAt && item.postedByName
              ? ` Posted by ${item.postedByName} on ${formatDate(item.postedAt.slice(0, 10))}.`
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
  children?: ReactNode;
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
