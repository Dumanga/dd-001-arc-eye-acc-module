"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck2,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  TimerReset,
  Truck,
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
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { BranchFilter } from "@/components/accounting/branch-filter";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";
import {
  PurchaseOrderFormPanel,
  type PurchaseOrderDraft,
} from "@/components/accounting/purchase-order-form-panel";
import { PurchaseOrderPreview } from "@/components/accounting/purchase-order-preview";
import type { PoListItem, PoKpis } from "@/app/api/accounting/purchase-orders/route";

const PURCHASE_ORDER_FORM_ID = "purchase-order-form";
const PURCHASE_ORDER_LIST_PAGE_SIZE = 10;

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; poId: string };

type FormIdConfig = {
  formType: string;
  code: string;
  yearToken: string;
  nextNumber: string;
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

function buildPoNumber(config: FormIdConfig | null): string {
  if (!config) return "PO-0001";
  const parts = [
    config.code.trim(),
    config.yearToken.trim(),
    config.nextNumber.trim(),
  ].filter(Boolean);
  return parts.join("-");
}

function createInitialDraft(
  poNumber: string,
  poRemark: string
): PurchaseOrderDraft {
  return {
    poNumber,
    supplierRef: "",
    buyerCode: "NK-CMB-01",
    poDate: buildLocalDate(0),
    expectedDate: buildLocalDate(14),
    currency: "LKR",
    discount: "0.00",
    notes: poRemark,
    terms: "Payment within 14 days. Delivery to main branch receiving desk.",
    supplier: null,
    lines: [],
  };
}

function formatCurrencyLkr(value: number) {
  return `LKR ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Fully received",
  CANCELLED: "Cancelled",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseOrdersScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  // ── PO list state ──────────────────────────────────────────────────
  const [poItems, setPoItems] = useState<PoListItem[]>([]);
  const [kpis, setKpis] = useState<PoKpis>({
    totalOpen: 0,
    awaitingAction: 0,
    inboundThisWeek: 0,
    totalValue: "0.00",
    totalValueCurrency: "LKR",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Create-form state ──────────────────────────────────────────────
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PurchaseOrderDraft>(() =>
    createInitialDraft("PO-0001", "")
  );
  // storeId picked by super admin via "Create on behalf of [branch]". For
  // branch users this stays null and the server auto-injects their storeId.
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  // storeId super admin uses to slice the list. null = "All branches".
  // Branch users have it permanently null — server-side filter does the lock.
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);

  // Viewer + active branches (drives the BranchAwareCreateButton).
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();

  // ── Toast auto-dismiss ─────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ── Scroll to top on mode change ──────────────────────────────────
  useEffect(() => {
    if (screenState.mode === "list") return;
    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  // ── Load PO list ──────────────────────────────────────────────────
  const loadPoList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/purchase-orders?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/purchase-orders";
      const res = await fetch(url, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: PoListItem[]; kpis: PoKpis } | null;
      };
      if (payload.success && payload.data) {
        setPoItems(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setListError("Failed to load purchase orders.");
      }
    } catch {
      setListError("Network error. Check your connection and try again.");
    } finally {
      setListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadPoList();
  }, [loadPoList]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ── Load create-form data ─────────────────────────────────────────
  async function loadCreateFormData() {
    setDataLoading(true);
    setDataError(null);
    try {
      const [formIdsRes, remarksRes] = await Promise.all([
        fetch("/api/accounting/settings/form-ids", { headers: { "x-portal": "ACCOUNTING" } }),
        fetch("/api/accounting/settings/remarks", { headers: { "x-portal": "ACCOUNTING" } }),
      ]);

      const [formIdsPayload, remarksPayload] = await Promise.all([
        formIdsRes.json() as Promise<{ success: boolean; data: { items: FormIdConfig[] } | null }>,
        remarksRes.json() as Promise<{ success: boolean; data: { items: { documentType: string; content: string }[] } | null }>,
      ]);

      const poConfig = formIdsPayload.success && formIdsPayload.data
        ? (formIdsPayload.data.items.find((i) => i.formType === "PO") ?? null)
        : null;
      const poRemark = remarksPayload.success && remarksPayload.data
        ? (remarksPayload.data.items.find((i) => i.documentType === "PURCHASE_ORDER")?.content ?? "")
        : "";

      setDraft(createInitialDraft(buildPoNumber(poConfig), poRemark));
    } catch {
      setDataError("Unable to load required data. Check your connection and try again.");
    } finally {
      setDataLoading(false);
    }
  }

  // ── Navigation helpers ────────────────────────────────────────────
  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  function openCreateMode(storeId: string | undefined) {
    setPickedStoreId(storeId ?? null);
    setScreenState({ mode: "create" });
    void loadCreateFormData();
  }

  function openPreview(poId: string) {
    setScreenState({ mode: "preview", poId });
  }

  // Pending Forms inbox deep-links here with ?id=<poId>.
  useOpenPreviewFromUrl(openPreview);

  // ── Create PO handler ─────────────────────────────────────────────
  async function handleCreatePurchaseOrder(currentDraft: PurchaseOrderDraft) {
    if (!currentDraft.supplier) {
      setToast({ tone: "error", message: "Select a supplier before creating the purchase order." });
      return;
    }
    if (!currentDraft.lines.length) {
      setToast({ tone: "error", message: "Add at least one line item to continue with this purchase order draft." });
      return;
    }

    setSaving(true);

    try {
      const body = {
        poNumber: currentDraft.poNumber,
        supplierId: currentDraft.supplier.id,
        ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
        supplierRef: currentDraft.supplierRef,
        buyerCode: currentDraft.buyerCode,
        poDate: currentDraft.poDate,
        expectedDate: currentDraft.expectedDate,
        currency: currentDraft.currency,
        discount: currentDraft.discount,
        notes: currentDraft.notes,
        terms: currentDraft.terms,
        lines: currentDraft.lines.map((l, idx) => ({
          productId: l.itemId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.price,
          uomName: l.uomName,
          uomBase: l.uomBase,
          lineOrder: idx,
        })),
      };

      const res = await fetch("/api/accounting/purchase-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; poNumber: string } | null;
        message?: string;
      };

      if (payload.success && payload.data) {
        const createdId = payload.data.id;
        // Refresh the list in the background
        void loadPoList();
        // Switch to preview
        setScreenState({ mode: "preview", poId: createdId });
        setToast({ tone: "success", message: `Purchase order ${payload.data.poNumber} created successfully.` });
      } else {
        setToast({ tone: "error", message: payload.message ?? "Failed to create purchase order." });
      }
    } catch {
      setToast({ tone: "error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ── Derived list data ─────────────────────────────────────────────
  const filteredPoItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return poItems;

    return poItems.filter((po) => {
      const searchFields = [
        po.poNumber,
        po.supplierName,
        po.supplierCity,
        po.expectedDate,
        po.statusLabel,
        STATUS_LABEL_MAP[po.status] ?? po.status,
        po.total,
      ];

      return searchFields.some((value) =>
        String(value).toLowerCase().includes(search)
      );
    });
  }, [poItems, searchTerm]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPoItems.length / PURCHASE_ORDER_LIST_PAGE_SIZE)
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedPoItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PURCHASE_ORDER_LIST_PAGE_SIZE;
    return filteredPoItems.slice(
      startIndex,
      startIndex + PURCHASE_ORDER_LIST_PAGE_SIZE
    );
  }, [currentPage, filteredPoItems]);

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";

  const tableRows = useMemo(
    () =>
      paginatedPoItems.map((po) => ({
        id: po.id,
        "PO Number": po.poNumber,
        Supplier: po.supplierName,
        City: po.supplierCity,
        Expected: po.expectedDate,
        ...(showBranchColumn ? { Branch: po.storeCode } : {}),
        Status: STATUS_LABEL_MAP[po.status] ?? po.statusLabel,
        Total: `${po.currency} ${Number(po.total).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      })),
    [paginatedPoItems, showBranchColumn]
  );

  const paginationSummary = useMemo(() => {
    if (!filteredPoItems.length) {
      return "Showing 0-0 of 0 purchase orders";
    }

    const startItem = (currentPage - 1) * PURCHASE_ORDER_LIST_PAGE_SIZE + 1;
    const endItem = Math.min(
      currentPage * PURCHASE_ORDER_LIST_PAGE_SIZE,
      filteredPoItems.length
    );

    return `Showing ${startItem}-${endItem} of ${filteredPoItems.length} purchase orders`;
  }, [currentPage, filteredPoItems.length]);

  const tableColumns = useMemo(
    () =>
      [
        "PO Number",
        "Supplier",
        "City",
        "Expected",
        ...(showBranchColumn ? ["Branch"] : []),
        "Status",
        "Total",
      ].map((label) => ({ key: label, label })),
    [showBranchColumn]
  );

  const paginationPages = useMemo(() => {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }, [totalPages]);

  // ── KPI metrics ───────────────────────────────────────────────────
  const metrics = useMemo(
    () => [
      {
        label: "Open POs",
        value: String(kpis.totalOpen).padStart(2, "0"),
        detail: "Purchase orders currently visible in the working register.",
        icon: Receipt,
        tone: "amber" as const,
      },
      {
        label: "Awaiting Action",
        value: String(kpis.awaitingAction).padStart(2, "0"),
        detail: "Draft or sent orders still awaiting supplier-side progress.",
        icon: TimerReset,
        tone: "blue" as const,
      },
      {
        label: "Inbound This Week",
        value: String(kpis.inboundThisWeek).padStart(2, "0"),
        detail: "Orders expected to arrive within the next 7 days.",
        icon: Truck,
        tone: "green" as const,
      },
      {
        label: "PO Value",
        value: formatCurrencyLkr(Number(kpis.totalValue)).replace(".00", ""),
        detail: "Combined LKR order value across the current purchase-order register.",
        icon: FileCheck2,
        tone: "violet" as const,
      },
    ],
    [kpis]
  );

  // ── Page intro ────────────────────────────────────────────────────
  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "SUPPLIERS / PURCHASE ORDERS / CREATE",
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
              form={PURCHASE_ORDER_FORM_ID}
              disabled={saving || dataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create PO"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return {
        eyebrow: "SUPPLIERS / PURCHASE ORDERS / PREVIEW",
      };
    }

    return {
      eyebrow: "SUPPLIERS / PURCHASE ORDERS",
      title: "Purchase order listing and draft creation workspace.",
      action: (
        <BranchAwareCreateButton
          label="Create PO"
          viewer={viewer}
          branches={activeBranches}
          loading={viewerLoading}
          onCreate={openCreateMode}
        />
      ),
    };
  })();

  // ── Render ────────────────────────────────────────────────────────
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

      {/* ── List mode ──────────────────────────────────────────────── */}
      {screenState.mode === "list" && (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard
            title="Open purchase orders"
            description="Current purchase order register."
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by PO number, supplier, city, ETA, or status"
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
                  onClick={() => void loadPoList()}
                  disabled={listLoading}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {listError && (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {listError}
                </div>
              )}

              {listLoading && !poItems.length ? (
                <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                  Loading purchase orders…
                </div>
              ) : !filteredPoItems.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No purchase orders matched the current search.
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
                        onClick={() =>
                          setCurrentPage((page) => Math.min(totalPages, page + 1))
                        }
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

      {/* ── Create mode ───────────────────────────────────────────── */}
      {screenState.mode === "create" && (
        <>
          {dataLoading ? (
            <SurfaceCard>
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-[#786f69]">
                <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                Loading PO configuration…
              </div>
            </SurfaceCard>
          ) : dataError ? (
            <SurfaceCard>
              <div className="py-6">
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {dataError}
                </div>
                <button
                  type="button"
                  onClick={() => void loadCreateFormData()}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#f2bcae] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#b94f37] transition hover:bg-[#fff2ee]"
                >
                  Retry
                </button>
              </div>
            </SurfaceCard>
          ) : (
            <PurchaseOrderFormPanel
              formId={PURCHASE_ORDER_FORM_ID}
              draft={draft}
              onChange={setDraft}
              onSubmit={handleCreatePurchaseOrder}
            />
          )}
        </>
      )}

      {/* ── Preview mode ──────────────────────────────────────────── */}
      {screenState.mode === "preview" && (
        <PurchaseOrderPreview
          poId={screenState.poId}
          onBack={() => setScreenState({ mode: "list" })}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
