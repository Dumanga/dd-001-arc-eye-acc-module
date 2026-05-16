"use client";

import {
  ArrowLeft,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  PackageMinus,
  RefreshCw,
  Search,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccountingPageIntro,
  DataTable,
  PremiumMetricGrid,
  StatusToast,
  SurfaceCard,
  type ToastState,
} from "@/components/accounting/accounting-ui";
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";
import {
  MaterialIssueFormPanel,
  type MaterialIssueDraft,
} from "@/components/accounting/material-issue-form-panel";

const ISSUE_FORM_ID = "material-issue-form";
const PAGE_SIZE = 10;
const FALLBACK_ISSUE_NUMBER = "MI-2026-0001";

type ScreenState = { mode: "list" } | { mode: "create" };

type IssueListItem = {
  id: string;
  issueNumber: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  requestedBy: string;
  purpose: string;
  issueDate: string;
  lineCount: number;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  statusLabel: string;
  currency: string;
  total: string;
};

// Shape the list API returns (raw, before display formatting).
type ListItemRow = {
  id: string;
  issueNumber: string;
  issueDate: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  lineCount: number;
  total: string;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  statusLabel: string;
  currency: string;
  requestedBy: string;
  purpose: string;
  notes: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  createdByName: string;
  approvedAt: string | null;
};

const STATUS_PILL_MAP: Record<IssueListItem["status"], string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700",
};

function buildLocalDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialDraft(issueNumber: string, notes: string): MaterialIssueDraft {
  return {
    issueNumber,
    issueDate: buildLocalDate(),
    expenseAccount: null,
    requestedBy: "",
    purpose: "",
    notes,
    currency: "LKR",
    lines: [],
  };
}

type RemarkApiItem = {
  documentType: string;
  content: string;
};

export function MaterialIssueScreen() {
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();
  const [draft, setDraft] = useState<MaterialIssueDraft>(() =>
    createInitialDraft(FALLBACK_ISSUE_NUMBER, ""),
  );
  const [listItems, setListItems] = useState<ListItemRow[]>([]);
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);

  const filteredIssues = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return listItems;
    return listItems.filter((item) => {
      const haystack = [
        item.issueNumber,
        item.expenseAccountCode,
        item.expenseAccountName,
        item.requestedBy,
        item.purpose,
        item.statusLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [searchTerm, listItems]);

  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const pagedIssues = filteredIssues.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationSummary = filteredIssues.length
    ? `Showing ${startIndex + 1}-${startIndex + pagedIssues.length} of ${filteredIssues.length} issues`
    : "No issues to show";

  const tableColumns = useMemo(
    () =>
      ["Issue No", "Expense Account", "Requested By", "Purpose", "Date", "Items", "Value", "Status", ""].map(
        (label) => ({ key: label || "actions", label }),
      ),
    [],
  );

  const tableRows = pagedIssues.map((item) => ({
    "Issue No": <span className="font-semibold text-[#1f1d1c]">{item.issueNumber}</span>,
    "Expense Account": `${item.expenseAccountCode} ${item.expenseAccountName}`,
    "Requested By": item.requestedBy,
    Purpose: item.purpose,
    Date: item.issueDate,
    Items: item.lineCount,
    Value: (
      <span className="font-semibold text-[#1f1d1c]">
        {item.currency} {item.total}
      </span>
    ),
    Status: (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
          STATUS_PILL_MAP[item.status]
        }`}
      >
        {item.statusLabel}
      </span>
    ),
    actions:
      item.status === "DRAFT" ? (
        <button
          type="button"
          onClick={() => void handleApprove(item.id)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#bce0c6] bg-[#eaf6ee] px-3 py-1.5 text-xs font-semibold text-[#176d39] transition hover:bg-[#dff0e6]"
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#ece2d6] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold text-[#9b8f87]">
          <Eye className="h-3.5 w-3.5" />
          Posted
        </span>
      ),
  }));

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

  const metrics = useMemo(() => {
    const draftCount = listItems.filter((m) => m.status === "DRAFT").length;
    const approvedCount = listItems.filter((m) => m.status === "APPROVED").length;
    const approvedTotal = listItems
      .filter((m) => m.status === "APPROVED" && m.currency === "LKR")
      .reduce((s, m) => s + Number(m.total), 0);
    return [
      {
        label: "Total Issues",
        value: String(listItems.length).padStart(2, "0"),
        detail: "All material issue notes on file.",
        icon: PackageMinus,
        tone: "amber" as const,
      },
      {
        label: "Pending Approval",
        value: String(draftCount).padStart(2, "0"),
        detail: "Drafts awaiting approval.",
        icon: CalendarRange,
        tone: "blue" as const,
      },
      {
        label: "Approved",
        value: String(approvedCount).padStart(2, "0"),
        detail: "Posted to GL and stock decremented.",
        icon: TimerReset,
        tone: "violet" as const,
      },
      {
        label: "Issued Value (LKR)",
        value: `LKR ${approvedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        detail: "Total LKR value across approved notes.",
        icon: Sparkles,
        tone: "green" as const,
      },
    ];
  }, [listItems]);

  // Load list on mount + when branch changes (super-admin picks).
  useEffect(() => {
    if (viewerLoading) return;
    void loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerLoading, pickedStoreId]);

  async function loadCreateFormData() {
    setCreateDataLoading(true);
    setCreateDataError(null);
    try {
      const remarksRes = await fetch("/api/accounting/settings/remarks", {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const remarksPayload = (await remarksRes.json()) as {
        success: boolean;
        message: string;
        data: { items: RemarkApiItem[] } | null;
      };
      const issueRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find((r) => r.documentType === "MATERIAL_ISSUE")?.content ?? ""
          : "";
      setDraft(createInitialDraft(FALLBACK_ISSUE_NUMBER, issueRemark));
    } catch {
      setCreateDataError(
        "Unable to load issue note configuration. Check your connection and try again.",
      );
    } finally {
      setCreateDataLoading(false);
    }
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setDraft(createInitialDraft(FALLBACK_ISSUE_NUMBER, ""));
    setScreenState({ mode: "create" });
    void loadCreateFormData();
    window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  async function handleCreateIssue(currentDraft: MaterialIssueDraft) {
    if (!currentDraft.expenseAccount) {
      setToast({ tone: "error", message: "Pick the expense account to charge for these items." });
      return;
    }
    if (!currentDraft.requestedBy.trim()) {
      setToast({ tone: "error", message: "Enter who requested the items." });
      return;
    }
    if (!currentDraft.purpose.trim()) {
      setToast({ tone: "error", message: "Enter the purpose of this issue." });
      return;
    }
    if (currentDraft.lines.length === 0) {
      setToast({ tone: "error", message: "Add at least one item before creating." });
      return;
    }

    setSaving(true);
    try {
      const body = {
        storeId: pickedStoreId ?? undefined,
        issueDate: currentDraft.issueDate,
        expenseAccountId: currentDraft.expenseAccount.id,
        currency: currentDraft.currency || "LKR",
        requestedBy: currentDraft.requestedBy.trim(),
        purpose: currentDraft.purpose.trim(),
        notes: currentDraft.notes ?? "",
        lines: currentDraft.lines.map((l) => ({
          productId: l.itemId,
          quantity: l.quantity,
          notes: l.notes ?? "",
        })),
      };
      const res = await fetch("/api/accounting/material-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { id: string; issueNumber: string } | null;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setToast({ tone: "error", message: payload.message ?? "Failed to save material issue." });
        return;
      }
      setToast({
        tone: "success",
        message: `Saved ${payload.data.issueNumber} as draft.`,
      });
      // Try to approve immediately? No — leave as DRAFT, user reviews in list,
      // then triggers Approve from the (future) preview screen. Or auto-approve
      // here if the user just wants one-step. Per §10 the flow is DRAFT → APPROVED,
      // separate explicit step.
      await loadList();
      closeCreateMode();
    } catch {
      setToast({ tone: "error", message: "Network error while saving the issue." });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      const res = await fetch(`/api/accounting/material-issues/${id}/approve`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setToast({ tone: "error", message: payload.message ?? "Approval failed." });
        return;
      }
      setToast({ tone: "success", message: "Issue approved, GL posted, stock decremented." });
      await loadList();
    } catch {
      setToast({ tone: "error", message: "Network error while approving." });
    }
  }

  async function loadList() {
    try {
      const params = pickedStoreId && viewer?.role === "SUPER_ADMIN"
        ? `?storeId=${encodeURIComponent(pickedStoreId)}`
        : "";
      const res = await fetch(`/api/accounting/material-issues${params}`, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: Array<Record<string, unknown>>; kpis: Record<string, unknown> } | null;
      };
      if (payload.success && payload.data) {
        setListItems(payload.data.items as ListItemRow[]);
      }
    } catch {
      /* silent — toast handles user-facing errors */
    }
  }

  const intro: {
    eyebrow: string;
    title?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "INVENTORY / MATERIAL ISSUE NOTE / CREATE",
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
              form={ISSUE_FORM_ID}
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Issue Note"}
            </button>
          </div>
        ),
      };
    }

    return {
      eyebrow: "INVENTORY / MATERIAL ISSUE NOTE",
      title: "Internal issue tracking for workshop and showroom consumption.",
      action: (
        <BranchAwareCreateButton
          label="Create Issue Note"
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
      <div ref={topSectionRef}>
        <AccountingPageIntro
          eyebrow={intro.eyebrow}
          title={intro.title}
          action={intro.action}
        />
      </div>

      {screenState.mode === "list" ? (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard
            title="Material issue queue"
            description="Internal stock use requests and completed issues."
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by issue number, expense account, requester, or purpose"
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {!filteredIssues.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No material issues match your search.
                </div>
              ) : (
                <DataTable columns={tableColumns} rows={tableRows} />
              )}

              {filteredIssues.length ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee5db] pt-3 text-xs text-[#7c6f65]">
                  <div>
                    <p>{paginationSummary}</p>
                    <p className="mt-1">
                      Page {effectivePage} of {totalPages}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={effectivePage === 1}
                      aria-label="Previous page"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                        effectivePage === 1
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
                        aria-current={page === effectivePage ? "page" : undefined}
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
                          page === effectivePage
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
                      disabled={effectivePage === totalPages}
                      aria-label="Next page"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                        effectivePage === totalPages
                          ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                          : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </SurfaceCard>
        </>
      ) : (
        <>
          {createDataLoading ? (
            <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading issue note configuration…
              </span>
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <MaterialIssueFormPanel
            formId={ISSUE_FORM_ID}
            draft={draft}
            onChange={setDraft}
            onSubmit={handleCreateIssue}
          />
        </>
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
