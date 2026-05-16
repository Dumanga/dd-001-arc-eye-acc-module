"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOpenPreviewFromUrl } from "@/components/accounting/use-open-preview-from-url";
import {
  AccountingPageIntro,
  DataTable,
  PremiumMetricGrid,
  StatusToast,
  SurfaceCard,
  type ToastState,
} from "@/components/accounting/accounting-ui";
import {
  InvoiceFormPanel,
  type InvoiceDraft,
} from "@/components/accounting/invoice-form-panel";
import { InvoicePreview } from "@/components/accounting/invoice-preview";
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { BranchFilter } from "@/components/accounting/branch-filter";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";

const INVOICE_FORM_ID = "invoice-form";
const INVOICE_LIST_PAGE_SIZE = 10;
const FALLBACK_INVOICE_NUMBER = "INV-2026-0001";

type InvoiceStatus = "DRAFT" | "APPROVED" | "CANCELLED";

type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerCity: string;
  billedBy: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  statusLabel: string;
  currency: string;
  total: string;
  itemsCount: number;
  storeId: string;
  storeCode: string;
  storeName: string;
};

type InvoiceKpiPayload = {
  totalInvoices: number;
  drafts: number;
  approved: number;
  overdueCount: number;
  approvedValueLkr: string;
};

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

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; invoiceId: string };

const STATUS_PILL_MAP: Record<InvoiceStatus, string> = {
  DRAFT: "border-[#e2d8cf] bg-[#faf6f1] text-[#7c6f65]",
  APPROVED: "border-[#cfe7d6] bg-[#edf9f1] text-[#1c7b52]",
  CANCELLED: "border-[#f0c8c8] bg-[#fff0f0] text-[#a23535]",
};

function buildLocalDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildInvoiceNumber(config: FormIdConfigItem | null): string {
  if (!config) return FALLBACK_INVOICE_NUMBER;
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(Boolean);
  return parts.join("-") || FALLBACK_INVOICE_NUMBER;
}

function createInitialDraft(invoiceNumber: string, terms: string): InvoiceDraft {
  return {
    invoiceNumber,
    customerRef: "",
    billedBy: "",
    invoiceDate: buildLocalDate(0),
    dueDate: buildLocalDate(30),
    currency: "LKR",
    notes: "",
    terms,
    customer: null,
    lines: [],
  };
}

function formatCurrency(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateLabel(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusPill({ status, label }: { status: InvoiceStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL_MAP[status]}`}
    >
      {label}
    </span>
  );
}

export function InvoicesScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  // List state
  const [invoiceItems, setInvoiceItems] = useState<InvoiceListItem[]>([]);
  const [kpiPayload, setKpiPayload] = useState<InvoiceKpiPayload>({
    totalInvoices: 0,
    drafts: 0,
    approved: 0,
    overdueCount: 0,
    approvedValueLkr: "0.00",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Create form data
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);

  // Create form draft
  const [draft, setDraft] = useState<InvoiceDraft>(() =>
    createInitialDraft(FALLBACK_INVOICE_NUMBER, "")
  );
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Scroll to top on mode change
  useEffect(() => {
    if (screenState.mode === "list") return;
    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  // Load invoice list
  const loadInvoiceList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/invoices?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/invoices";
      const res = await fetch(url);
      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { items: InvoiceListItem[]; kpis: InvoiceKpiPayload } | null;
      };
      if (payload.success && payload.data) {
        setInvoiceItems(payload.data.items);
        setKpiPayload(payload.data.kpis);
      } else {
        setListError(payload.message ?? "Failed to load invoices.");
      }
    } catch {
      setListError("Network error while loading invoices.");
    } finally {
      setListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadInvoiceList();
  }, [loadInvoiceList]);

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  async function loadCreateFormData() {
    setCreateDataLoading(true);
    setCreateDataError(null);
    try {
      const [formIdsRes, remarksRes] = await Promise.all([
        fetch("/api/accounting/settings/form-ids"),
        fetch("/api/accounting/settings/remarks"),
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

      const invConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "INV") ?? null
          : null;

      const invoiceRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find((r) => r.documentType === "INVOICE")?.content ?? ""
          : "";

      setDraft(createInitialDraft(buildInvoiceNumber(invConfig), invoiceRemark));
    } catch {
      setCreateDataError("Unable to load required data. Check your connection and try again.");
    } finally {
      setCreateDataLoading(false);
    }
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setDraft(createInitialDraft(FALLBACK_INVOICE_NUMBER, ""));
    setScreenState({ mode: "create" });
    void loadCreateFormData();
  }

  function openPreview(invoiceId: string) {
    setScreenState({ mode: "preview", invoiceId });
  }

  // Pending Forms inbox deep-links here with ?id=<invoiceId>.
  useOpenPreviewFromUrl(openPreview);

  async function handleCreateInvoice(currentDraft: InvoiceDraft) {
    if (!currentDraft.customer) {
      setToast({ tone: "error", message: "Select a customer before creating the invoice." });
      return;
    }
    if (!currentDraft.lines.length) {
      setToast({ tone: "error", message: "Add at least one line item to continue with this invoice." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/accounting/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: currentDraft.invoiceNumber,
          customerId: currentDraft.customer.id,
          ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
          invoiceDate: currentDraft.invoiceDate,
          dueDate: currentDraft.dueDate,
          customerRef: currentDraft.customerRef,
          billedBy: currentDraft.billedBy,
          currency: currentDraft.currency,
          notes: currentDraft.notes,
          terms: currentDraft.terms,
          lines: currentDraft.lines.map((line, idx) => ({
            productId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.price,
            discount: line.discount || "0",
            uomName: line.uomName,
            uomBase: line.uomBase,
            uomMinQty: line.uomMinQty,
            lineOrder: idx,
            productSerialId: line.productSerialId ?? null,
          })),
        }),
      });

      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { id: string; invoiceNumber: string } | null;
      };

      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? "Failed to create invoice.");
      }

      setToast({ tone: "success", message: `Invoice ${payload.data.invoiceNumber} created.` });
      void loadInvoiceList();
      setScreenState({ mode: "preview", invoiceId: payload.data.id });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save invoice.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Filtered list
  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return invoiceItems;

    return invoiceItems.filter((item) => {
      const fields = [
        item.invoiceNumber,
        item.customerName,
        item.customerCity,
        item.billedBy,
        item.invoiceDate,
        item.dueDate,
        item.statusLabel,
        item.total,
      ];

      return fields.some((value) => String(value).toLowerCase().includes(search));
    });
  }, [invoiceItems, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / INVOICE_LIST_PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (effectivePage - 1) * INVOICE_LIST_PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + INVOICE_LIST_PAGE_SIZE);
  }, [effectivePage, filteredItems]);

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";

  const tableRows = useMemo(
    () =>
      paginatedItems.map((inv) => ({
        id: inv.id,
        "Invoice No": inv.invoiceNumber,
        Customer: inv.customerName,
        City: inv.customerCity,
        "Billed By": inv.billedBy || "—",
        "Invoice Date": formatDateLabel(inv.invoiceDate),
        "Due Date": formatDateLabel(inv.dueDate),
        ...(showBranchColumn ? { Branch: inv.storeCode } : {}),
        Status: <StatusPill status={inv.status} label={inv.statusLabel} />,
        Amount: `${inv.currency} ${Number(inv.total).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      })),
    [paginatedItems, showBranchColumn]
  );

  const paginationSummary = useMemo(() => {
    if (!filteredItems.length) return "Showing 0-0 of 0 invoices";
    const startItem = (effectivePage - 1) * INVOICE_LIST_PAGE_SIZE + 1;
    const endItem = Math.min(effectivePage * INVOICE_LIST_PAGE_SIZE, filteredItems.length);
    return `Showing ${startItem}-${endItem} of ${filteredItems.length} invoices`;
  }, [effectivePage, filteredItems.length]);

  const tableColumns = useMemo(
    () =>
      [
        "Invoice No",
        "Customer",
        "City",
        "Billed By",
        "Invoice Date",
        "Due Date",
        ...(showBranchColumn ? ["Branch"] : []),
        "Status",
        "Amount",
      ].map((label) => ({ key: label, label })),
    [showBranchColumn]
  );

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );

  // KPI metrics
  const metrics = useMemo(
    () => [
      {
        label: "Total Invoices",
        value: String(kpiPayload.totalInvoices).padStart(2, "0"),
        detail: "All invoices in the working register.",
        icon: Receipt,
        tone: "amber" as const,
      },
      {
        label: "Drafts",
        value: String(kpiPayload.drafts).padStart(2, "0"),
        detail: "Invoices awaiting approval.",
        icon: TimerReset,
        tone: "blue" as const,
      },
      {
        label: "Overdue",
        value: String(kpiPayload.overdueCount).padStart(2, "0"),
        detail: "Approved invoices past their due date.",
        icon: Sparkles,
        tone: "violet" as const,
      },
      {
        label: "Approved Value (LKR)",
        value: formatCurrency(Number(kpiPayload.approvedValueLkr), "LKR").replace(".00", ""),
        detail: "Combined LKR value across approved invoices.",
        icon: FileText,
        tone: "green" as const,
      },
    ],
    [kpiPayload]
  );

  // Page intro
  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "CUSTOMERS / INVOICES / CREATE",
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
              form={INVOICE_FORM_ID}
              disabled={saving || createDataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return {
        eyebrow: "CUSTOMERS / INVOICES / PREVIEW",
      };
    }

    return {
      eyebrow: "CUSTOMERS / INVOICES",
      title: "Invoice workspace with live status tracking and due date visibility.",
      description:
        "Customer invoice register with DRAFT → APPROVED flow, overdue tracking, and printable invoice layout.",
      action: (
        <BranchAwareCreateButton
          label="Create Invoice"
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
          description={intro.description}
          action={intro.action}
        />
      </div>

      {/* List mode */}
      {screenState.mode === "list" && (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard
            title="Active invoices"
            description="Customer invoice register with status and due date tracking."
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by invoice number, customer, city, billed by, or status"
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
                  onClick={() => void loadInvoiceList()}
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
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  Loading invoices…
                </div>
              ) : !filteredItems.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No invoices found.
                </div>
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    rows={tableRows}
                    onRowClick={(row) => {
                      if (typeof row.id === "string" && row.id) openPreview(row.id);
                    }}
                    rowAction={(row) => {
                      if (typeof row.id !== "string" || !row.id) return null;
                      const rowId = row.id;
                      return (
                        <button
                          type="button"
                          onClick={() => openPreview(rowId)}
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
                </>
              )}
            </div>
          </SurfaceCard>
        </>
      )}

      {/* Create mode */}
      {screenState.mode === "create" && (
        <>
          {createDataLoading ? (
            <div className="rounded-2xl border border-[#e7ddd4] bg-[#fffaf5] px-4 py-3 text-sm text-[#7c6f65]">
              Loading invoice configuration…
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <InvoiceFormPanel
            formId={INVOICE_FORM_ID}
            draft={draft}
            onChange={setDraft}
            onSubmit={handleCreateInvoice}
            storeId={pickedStoreId}
          />
        </>
      )}

      {/* Preview mode */}
      {screenState.mode === "preview" && (
        <InvoicePreview
          invoiceId={screenState.invoiceId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadInvoiceList();
          }}
          onApproved={() => {
            void loadInvoiceList();
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
