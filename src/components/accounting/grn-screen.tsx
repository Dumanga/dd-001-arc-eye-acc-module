"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  PackageCheck,
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
  GrnFormPanel,
  type GrnDraft,
  type GrnPoOption,
} from "@/components/accounting/grn-form-panel";
import { GrnPreview } from "@/components/accounting/grn-preview";
import type {
  GrnListItem,
  GrnKpis,
} from "@/app/api/accounting/goods-receipts/route";
import type { GrnPoOption as ApiGrnPoOption } from "@/app/api/accounting/purchase-orders/grn-options/route";

const GRN_FORM_ID = "grn-form";
const GRN_LIST_PAGE_SIZE = 10;

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; grnId: string };

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

function buildGrnNumber(config: FormIdConfig | null): string {
  if (!config) return "GRN-0001";
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(
    Boolean
  );
  return parts.join("-");
}

function createInitialDraft(grnNumber: string): GrnDraft {
  return {
    grnNumber,
    mode: "withPo",
    poRef: null,
    supplier: null,
    openingBalanceMode: false,
    openingEquityAccount: null,
    receiptDate: buildLocalDate(0),
    receivedBy: "",
    deliveryNoteRef: "",
    vehicleRef: "",
    currency: "LKR",
    notes: "",
    lines: [],
  };
}

function formatCurrencyLkr(value: number) {
  return `LKR ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const GRN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const CONDITION_TO_API: Record<string, string> = {
  Good: "GOOD",
  Damaged: "DAMAGED",
  Short: "SHORT",
  Excess: "EXCESS",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function GrnScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  // ── List state ─────────────────────────────────────────────────────
  const [grnItems, setGrnItems] = useState<GrnListItem[]>([]);
  const [kpis, setKpis] = useState<GrnKpis>({
    totalGrns: 0,
    awaitingApproval: 0,
    approved: 0,
    varianceFlagged: 0,
    approvedValueLkr: "0.00",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Create-form state ──────────────────────────────────────────────
  const [poOptions, setPoOptions] = useState<GrnPoOption[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GrnDraft>(() => createInitialDraft("GRN-0001"));
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);

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

  // ── Scroll to top on mode change ───────────────────────────────────
  useEffect(() => {
    if (screenState.mode === "list") return;
    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  // ── Reset page on search change ────────────────────────────────────
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ── Load GRN list ──────────────────────────────────────────────────
  const loadGrnList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/goods-receipts?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/goods-receipts";
      const res = await fetch(url, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: GrnListItem[]; kpis: GrnKpis } | null;
      };
      if (payload.success && payload.data) {
        setGrnItems(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setListError("Failed to load GRNs.");
      }
    } catch {
      setListError("Network error. Check your connection and try again.");
    } finally {
      setListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadGrnList();
  }, [loadGrnList]);

  // ── Load create-form data ──────────────────────────────────────────
  async function loadCreateFormData() {
    setDataLoading(true);
    setDataError(null);
    try {
      const [formIdsRes, posRes] = await Promise.all([
        fetch("/api/accounting/settings/form-ids", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        fetch("/api/accounting/purchase-orders/grn-options", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
      ]);

      const [formIdsPayload, posPayload] = await Promise.all([
        formIdsRes.json() as Promise<{
          success: boolean;
          data: { items: FormIdConfig[] } | null;
        }>,
        posRes.json() as Promise<{
          success: boolean;
          data: { items: ApiGrnPoOption[] } | null;
        }>,
      ]);

      const grnConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "GRN") ?? null
          : null;

      const loadedPos: GrnPoOption[] =
        posPayload.success && posPayload.data
          ? posPayload.data.items.map((po) => ({
              id: po.id,
              poNumber: po.poNumber,
              poDate: po.poDate,
              supplierId: po.supplierId,
              supplierName: po.supplierName,
              supplierCode: po.supplierCode,
              supplierContact: po.supplierContact,
              supplierCity: po.supplierCity,
              currency: po.currency,
              status: po.statusLabel,
              lines: po.lines
                .filter((l) => Number(l.remainingQty) > 0)
                .map((l) => ({
                  poLineId: l.poLineId,
                  itemId: l.itemId,
                  itemLabel: l.itemLabel,
                  description: l.description,
                  // Show remaining open qty so the variance pill is meaningful
                  // when the PO has been partially received before.
                  orderedQty: l.remainingQty,
                  unitPrice: l.unitPrice,
                  uomName: l.uomName,
                  uomBase: l.uomBase,
                  requiresSerial: l.requiresSerial,
                })),
            }))
          : [];

      setPoOptions(loadedPos);
      setDraft(createInitialDraft(buildGrnNumber(grnConfig)));
    } catch {
      setDataError("Unable to load required data. Check your connection and try again.");
    } finally {
      setDataLoading(false);
    }
  }

  // ── Mode helpers ───────────────────────────────────────────────────
  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setScreenState({ mode: "create" });
    void loadCreateFormData();
  }

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  function openPreview(grnId: string) {
    setScreenState({ mode: "preview", grnId });
  }

  // Pending Forms inbox deep-links here with ?id=<grnId>.
  useOpenPreviewFromUrl(openPreview);

  // ── Save GRN ───────────────────────────────────────────────────────
  async function handleCreateGrn(currentDraft: GrnDraft) {
    const isOpeningBalance = currentDraft.openingBalanceMode;
    if (isOpeningBalance) {
      // Opening Balance branch (§1.2) — equity account is required, supplier
      // is forbidden, all line rates must be > 0 (rates set cost basis).
      if (!currentDraft.openingEquityAccount) {
        setToast({
          tone: "error",
          message: "Pick an equity account before saving the Opening Balance GRN.",
        });
        return;
      }
      const zeroRate = currentDraft.lines.find(
        (l) => Number(l.unitPrice || 0) <= 0,
      );
      if (zeroRate) {
        setToast({
          tone: "error",
          message: `Rate must be greater than 0 for "${zeroRate.itemLabel}".`,
        });
        return;
      }
    } else {
      if (!currentDraft.supplier) {
        setToast({
          tone: "error",
          message: "Select a supplier (or pick a PO) before saving the GRN.",
        });
        return;
      }
    }
    if (!currentDraft.lines.length) {
      setToast({
        tone: "error",
        message: "Add at least one line before saving the GRN.",
      });
      return;
    }
    if (currentDraft.mode === "withPo" && !currentDraft.poRef) {
      setToast({ tone: "error", message: "Pick a purchase order to receive against." });
      return;
    }

    const incompleteSerial = currentDraft.lines.find((line) => {
      if (!line.requiresSerial) return false;
      const target = Math.max(0, Math.floor(Number(line.receivedQty || 0)));
      // Zero-received lines need no serials — skip them.
      if (target === 0) return false;
      return line.serials.length !== target;
    });
    if (incompleteSerial) {
      setToast({
        tone: "error",
        message: `Add serial numbers for "${incompleteSerial.itemLabel}" before saving the GRN.`,
      });
      return;
    }

    setSaving(true);

    try {
      const body = {
        grnNumber: currentDraft.grnNumber,
        mode: currentDraft.mode,
        purchaseOrderId:
          currentDraft.mode === "withPo" ? currentDraft.poRef?.id ?? null : null,
        supplierId: isOpeningBalance ? null : currentDraft.supplier?.id ?? null,
        openingBalanceMode: isOpeningBalance,
        openingEquityAccountId: isOpeningBalance
          ? currentDraft.openingEquityAccount?.id ?? null
          : null,
        ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
        receiptDate: currentDraft.receiptDate,
        receivedBy: currentDraft.receivedBy,
        deliveryNoteRef: currentDraft.deliveryNoteRef,
        vehicleRef: currentDraft.vehicleRef,
        currency: currentDraft.currency,
        notes: currentDraft.notes,
        lines: currentDraft.lines.map((line, idx) => ({
          productId: line.itemId,
          purchaseOrderLineId: line.purchaseOrderLineId ?? null,
          description: line.description,
          orderedQty: line.orderedQty || "0",
          receivedQty: line.receivedQty || "0",
          unitPrice: line.unitPrice || "0",
          discount: line.discount || "0",
          uomName: line.uomName,
          uomBase: line.uomBase,
          condition: CONDITION_TO_API[line.condition] ?? "GOOD",
          requiresSerial: line.requiresSerial,
          serials: line.serials,
          lineOrder: idx,
        })),
      };

      const res = await fetch("/api/accounting/goods-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; grnNumber: string } | null;
        message?: string;
      };

      if (payload.success && payload.data) {
        const createdId = payload.data.id;
        void loadGrnList();
        setToast({
          tone: "success",
          message: `GRN ${payload.data.grnNumber} saved successfully.`,
        });
        setScreenState({ mode: "preview", grnId: createdId });
      } else {
        setToast({
          tone: "error",
          message: payload.message ?? "Failed to save GRN.",
        });
      }
    } catch {
      setToast({ tone: "error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ── Filter + paginate list ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return grnItems;
    return grnItems.filter((row) =>
      [
        row.grnNumber,
        row.poNumber,
        row.supplierName,
        row.receivedBy,
        row.statusLabel,
      ].some((value) => value.toLowerCase().includes(search))
    );
  }, [grnItems, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / GRN_LIST_PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * GRN_LIST_PAGE_SIZE;
    return filtered.slice(startIndex, startIndex + GRN_LIST_PAGE_SIZE);
  }, [currentPage, filtered]);

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";

  const tableRows = useMemo(
    () =>
      paginated.map((row) => ({
        id: row.id,
        "GRN No": row.grnNumber,
        "Linked PO": row.poNumber,
        Supplier: row.supplierName,
        Date: row.receiptDate,
        "Received By": row.receivedBy,
        ...(showBranchColumn ? { Branch: row.storeCode } : {}),
        Items: row.itemsCount.toString(),
        Status: GRN_STATUS_LABELS[row.status] ?? row.statusLabel,
        Value: `${row.currency} ${Number(row.receiptValue).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      })),
    [paginated, showBranchColumn]
  );

  const tableColumns = useMemo(
    () =>
      [
        "GRN No",
        "Linked PO",
        "Supplier",
        "Date",
        "Received By",
        ...(showBranchColumn ? ["Branch"] : []),
        "Items",
        "Status",
        "Value",
      ].map((label) => ({ key: label, label })),
    [showBranchColumn]
  );

  const paginationSummary = useMemo(() => {
    if (!filtered.length) return "Showing 0-0 of 0 GRNs";
    const startItem = (currentPage - 1) * GRN_LIST_PAGE_SIZE + 1;
    const endItem = Math.min(currentPage * GRN_LIST_PAGE_SIZE, filtered.length);
    return `Showing ${startItem}-${endItem} of ${filtered.length} GRNs`;
  }, [currentPage, filtered.length]);

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );

  // ── KPI metrics ────────────────────────────────────────────────────
  const metrics = useMemo(
    () => [
      {
        label: "GRNs in queue",
        value: String(kpis.totalGrns).padStart(2, "0"),
        detail: "All goods receipts captured at branch receiving desks.",
        icon: Receipt,
        tone: "amber" as const,
      },
      {
        label: "Awaiting approval",
        value: String(kpis.awaitingApproval).padStart(2, "0"),
        detail: "Draft GRNs waiting for review and approval.",
        icon: TimerReset,
        tone: "blue" as const,
      },
      {
        label: "Approved",
        value: String(kpis.approved).padStart(2, "0"),
        detail: "Receipts approved and pushed to inventory & PO closures.",
        icon: PackageCheck,
        tone: "green" as const,
      },
      {
        label: "Variance flagged",
        value: String(kpis.varianceFlagged).padStart(2, "0"),
        detail: `${formatCurrencyLkr(Number(kpis.approvedValueLkr))} of approved receipts on file.`,
        icon: Truck,
        tone: "violet" as const,
      },
    ],
    [kpis]
  );

  // ── Page intro ─────────────────────────────────────────────────────
  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "SUPPLIERS / GRN / CREATE",
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
              form={GRN_FORM_ID}
              disabled={saving || dataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save GRN"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return { eyebrow: "SUPPLIERS / GRN / PREVIEW" };
    }

    return {
      eyebrow: "SUPPLIERS / GRN",
      title: "Goods received note workspace.",
      action: (
        <BranchAwareCreateButton
          label="Create GRN"
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

      {screenState.mode === "list" && (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard title="GRN queue" description="Receipts captured at branch receiving desks.">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by GRN, PO, supplier, receiver, or status"
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
                  onClick={() => void loadGrnList()}
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

              {listLoading && !grnItems.length ? (
                <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                  Loading goods receipts…
                </div>
              ) : !filtered.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No GRNs matched the current search.
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

      {screenState.mode === "create" && (
        <>
          {dataLoading ? (
            <SurfaceCard>
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-[#786f69]">
                <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                Loading POs and GRN configuration…
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
            <GrnFormPanel
              formId={GRN_FORM_ID}
              draft={draft}
              onChange={setDraft}
              onSubmit={handleCreateGrn}
              poOptions={poOptions}
            />
          )}
        </>
      )}

      {screenState.mode === "preview" && (
        <GrnPreview
          grnId={screenState.grnId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadGrnList();
          }}
          onApproved={(poStatus) => {
            void loadGrnList();
            const tail = poStatus === "RECEIVED" ? " PO marked as fully received." : "";
            setToast({
              tone: "success",
              message: `GRN approved.${tail}`,
            });
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
