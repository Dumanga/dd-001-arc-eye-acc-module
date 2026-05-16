"use client";

import {
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  PackageX,
  RefreshCw,
  Search,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  CustomerReturnFormPanel,
  type CustomerReturnDraft,
} from "@/components/accounting/customer-return-form-panel";
import { CustomerReturnPreview } from "@/components/accounting/customer-return-preview";
import { useOpenPreviewFromUrl } from "@/components/accounting/use-open-preview-from-url";
import type {
  CustomerReturnListItem,
  CustomerReturnKpis,
} from "@/app/api/accounting/customer-returns/route";

const RETURN_FORM_ID = "customer-return-form";
const PAGE_SIZE = 10;
const FALLBACK_RETURN_NUMBER = "SR-2026-0001";

type FormIdConfigItem = {
  formType: string;
  code: string;
  yearToken: string;
  nextNumber: string;
};

type RemarkApiItem = {
  documentType: string;
  content: string;
};

function buildReturnNumber(config: FormIdConfigItem | null): string {
  if (!config) return FALLBACK_RETURN_NUMBER;
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(Boolean);
  return parts.join("-") || FALLBACK_RETURN_NUMBER;
}

const STATUS_PILL_MAP: Record<string, string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; returnId: string };

function buildLocalDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialDraft(returnNumber: string, notes: string): CustomerReturnDraft {
  return {
    returnNumber,
    returnDate: buildLocalDate(),
    sourceType: "INVOICE",
    customer: null,
    invoice: null,
    currency: "LKR",
    reasonHeader: "",
    notes,
    lines: [],
  };
}

function formatListDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function CustomerReturnsScreen() {
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });

  // Pending Forms inbox deep-links here with ?id=<returnId>.
  useOpenPreviewFromUrl((returnId) =>
    setScreenState({ mode: "preview", returnId }),
  );
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
  const [draft, setDraft] = useState<CustomerReturnDraft>(() =>
    createInitialDraft(FALLBACK_RETURN_NUMBER, ""),
  );
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);

  const [returns, setReturns] = useState<CustomerReturnListItem[]>([]);
  const [kpis, setKpis] = useState<CustomerReturnKpis>({
    totalReturns: 0,
    drafts: 0,
    approved: 0,
    approvedValueLkr: "0.00",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/accounting/customer-returns", {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: { items: CustomerReturnListItem[]; kpis: CustomerReturnKpis } | null;
      };
      if (payload.success && payload.data) {
        setReturns(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setListError(payload.message || "Failed to load returns.");
      }
    } catch {
      setListError("Network error while loading returns.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filteredReturns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return returns;
    return returns.filter((item) => {
      const haystack = [
        item.returnNumber,
        item.customerName,
        item.customerCity,
        item.invoiceNumber,
        item.reasonHeader,
        item.statusLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [returns, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const pagedReturns = filteredReturns.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationSummary = filteredReturns.length
    ? `Showing ${startIndex + 1}-${startIndex + pagedReturns.length} of ${filteredReturns.length} returns`
    : "No returns to show";

  const tableColumns = useMemo(
    () =>
      ["Return", "Customer", "Source Invoice", "Date", "Reason", "Items", "Net", "Status", ""].map(
        (label) => ({ key: label || "actions", label }),
      ),
    [],
  );

  const tableRows = pagedReturns.map((item) => ({
    Return: <span className="font-semibold text-[#1f1d1c]">{item.returnNumber}</span>,
    Customer: (
      <div className="flex flex-col">
        <span className="font-medium text-[#1f1d1c]">{item.customerName}</span>
        {item.customerCity ? (
          <span className="text-xs text-[#8c8079]">{item.customerCity}</span>
        ) : null}
      </div>
    ),
    "Source Invoice": item.invoiceNumber,
    Date: formatListDate(item.returnDate),
    Reason: item.reasonHeader || "—",
    Items: item.itemsCount,
    Net: (
      <span className="font-semibold text-[#1f1d1c]">
        {item.currency} {item.totalNet}
      </span>
    ),
    Status: (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
          STATUS_PILL_MAP[item.status] ?? STATUS_PILL_MAP.DRAFT
        }`}
      >
        {item.statusLabel}
      </span>
    ),
    actions: (
      <button
        type="button"
        onClick={() => setScreenState({ mode: "preview", returnId: item.id })}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#d9e5f8] bg-[#f6f9ff] px-3 py-1.5 text-xs font-semibold text-[#315d9b] transition hover:bg-[#eef4ff]"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
    ),
  }));

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

  const metrics = useMemo(
    () => [
      {
        label: "Total Returns",
        value: String(kpis.totalReturns).padStart(2, "0"),
        detail: "All customer returns on file.",
        icon: PackageX,
        tone: "amber" as const,
      },
      {
        label: "Drafts",
        value: String(kpis.drafts).padStart(2, "0"),
        detail: "Returns awaiting approval.",
        icon: CalendarRange,
        tone: "blue" as const,
      },
      {
        label: "Approved",
        value: String(kpis.approved).padStart(2, "0"),
        detail: "Returns approved and posted.",
        icon: TimerReset,
        tone: "violet" as const,
      },
      {
        label: "Approved Net (LKR)",
        value: `LKR ${kpis.approvedValueLkr}`,
        detail: "Total LKR value of approved returns (net of discount reversal).",
        icon: Sparkles,
        tone: "green" as const,
      },
    ],
    [kpis],
  );

  async function loadCreateFormData() {
    setCreateDataLoading(true);
    setCreateDataError(null);
    try {
      const [formIdsRes, remarksRes] = await Promise.all([
        fetch("/api/accounting/settings/form-ids", { headers: { "x-portal": "ACCOUNTING" } }),
        fetch("/api/accounting/settings/remarks", { headers: { "x-portal": "ACCOUNTING" } }),
      ]);
      const [formIdsPayload, remarksPayload] = await Promise.all([
        formIdsRes.json() as Promise<{
          success: boolean;
          message: string;
          data: { items: FormIdConfigItem[] } | null;
        }>,
        remarksRes.json() as Promise<{
          success: boolean;
          message: string;
          data: { items: RemarkApiItem[] } | null;
        }>,
      ]);

      const srConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "SR") ?? null
          : null;
      const returnRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find((r) => r.documentType === "SALES_RETURN")?.content ?? ""
          : "";
      setDraft(createInitialDraft(buildReturnNumber(srConfig), returnRemark));
    } catch {
      setCreateDataError(
        "Unable to load return configuration. Check your connection and try again.",
      );
    } finally {
      setCreateDataLoading(false);
    }
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setDraft(createInitialDraft(FALLBACK_RETURN_NUMBER, ""));
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

  async function handleCreateReturn(currentDraft: CustomerReturnDraft) {
    if (!currentDraft.customer) {
      setToast({ tone: "error", message: "Select a customer before creating the return." });
      return;
    }
    if (!currentDraft.invoice) {
      setToast({ tone: "error", message: "Select a source invoice before creating the return." });
      return;
    }
    const lineEntries = currentDraft.lines
      .map((line, idx) => ({ line, qty: Number(line.returnQty) || 0, idx }))
      .filter(({ qty }) => qty > 0);
    if (lineEntries.length === 0) {
      setToast({
        tone: "error",
        message: "Set a non-zero return quantity on at least one line before creating.",
      });
      return;
    }
    for (const { line, qty } of lineEntries) {
      if (qty > line.remainingQty + 1e-6) {
        setToast({
          tone: "error",
          message: `Return qty for ${line.itemCode} (${qty}) exceeds the returnable quantity (${line.remainingQty}).`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      // POS_BILL_CASH is a UI-only discriminator; on the wire we
      // collapse it back to "POS_BILL". The backend reads the source
      // bill's paymentMethod to decide whether the cash-refund posting
      // leg is needed.
      const isPosBillSource =
        currentDraft.sourceType === "POS_BILL" ||
        currentDraft.sourceType === "POS_BILL_CASH";
      const apiSourceType = isPosBillSource ? "POS_BILL" : "INVOICE";
      const res = await fetch("/api/accounting/customer-returns", {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING", "Content-Type": "application/json" },
        body: JSON.stringify({
          returnNumber: currentDraft.returnNumber,
          sourceType: apiSourceType,
          ...(isPosBillSource
            ? { sourcePosBillId: currentDraft.invoice.id }
            : { invoiceId: currentDraft.invoice.id }),
          ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
          returnDate: currentDraft.returnDate,
          returnedBy: "",
          reasonHeader: currentDraft.reasonHeader ?? "",
          notes: currentDraft.notes ?? "",
          lines: lineEntries.map(({ line, idx }) => ({
            ...(isPosBillSource
              ? { sourcePosBillLineId: line.invoiceLineId }
              : { invoiceLineId: line.invoiceLineId }),
            returnQty: line.returnQty,
            reason: line.reason,
            notes: line.lineNotes,
            lineOrder: idx,
          })),
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: { id: string; returnNumber: string } | null;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setToast({
          tone: "error",
          message: payload.message || "Failed to create customer return.",
        });
        return;
      }
      setToast({
        tone: "success",
        message: `Return ${payload.data.returnNumber} created. Review and approve from preview.`,
      });
      setScreenState({ mode: "preview", returnId: payload.data.id });
      void loadList();
    } catch {
      setToast({
        tone: "error",
        message: "Network error while creating the return.",
      });
    } finally {
      setSaving(false);
    }
  }

  const intro: {
    eyebrow: string;
    title?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "CUSTOMERS / RETURNS / CREATE",
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
              form={RETURN_FORM_ID}
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Return"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return { eyebrow: "CUSTOMERS / RETURNS / PREVIEW" };
    }

    return {
      eyebrow: "CUSTOMERS / RETURNS",
      title: "Customer return handling with clean refund or exchange visibility.",
      action: (
        <BranchAwareCreateButton
          label="Create Return"
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

          <SurfaceCard title="Return register" description="Open and closed customer return records.">
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
                    placeholder="Search by return number, customer, source invoice, or reason"
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                    void loadList();
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {listError ? (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {listError}
                </div>
              ) : null}

              {listLoading ? (
                <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading returns…
                  </span>
                </div>
              ) : !filteredReturns.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No customer returns yet. Click Create Return to raise the first one.
                </div>
              ) : (
                <DataTable columns={tableColumns} rows={tableRows} />
              )}

              {filteredReturns.length ? (
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
      ) : screenState.mode === "create" ? (
        <>
          {createDataLoading ? (
            <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading return configuration…
              </span>
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <CustomerReturnFormPanel
            formId={RETURN_FORM_ID}
            draft={draft}
            onChange={setDraft}
            onSubmit={handleCreateReturn}
          />
        </>
      ) : (
        <CustomerReturnPreview
          returnId={screenState.returnId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadList();
          }}
          onApproved={() => {
            void loadList();
            setToast({
              tone: "success",
              message: "Customer return approved.",
            });
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
