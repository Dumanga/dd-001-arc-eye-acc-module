"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Undo2,
  WalletCards,
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
  GoodsReturnFormPanel,
  type GrrDraft,
  type GrrGrnOption,
  type GrrReason,
  type GrrSupplierOption,
} from "@/components/accounting/goods-return-form-panel";
import { GoodsReturnPreview } from "@/components/accounting/goods-return-preview";
import type {
  GoodsReturnListItem,
  GoodsReturnKpis,
} from "@/app/api/accounting/goods-returns/route";
import type { GrrGrnOption as ApiGrrGrnOption } from "@/app/api/accounting/goods-receipts/grr-options/route";
import type { PoSupplierOption } from "@/app/api/accounting/suppliers/po-options/route";

const RETURN_FORM_ID = "goods-return-form";
const RETURN_LIST_PAGE_SIZE = 10;

type FormIdConfig = {
  formType: string;
  code: string;
  yearToken: string;
  nextNumber: string;
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; returnId: string };

// ─── Local UI helpers ───────────────────────────────────────────────────────

function buildLocalDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number, currencyCode = "LKR") {
  return `${currencyCode} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildReturnNumber(config: FormIdConfig | null) {
  if (!config) return "GR-2026-0001";
  return [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()]
    .filter(Boolean)
    .join("-");
}

function createInitialDraft(returnNumber: string): GrrDraft {
  return {
    returnNumber,
    mode: "withGrn",
    grnRef: null,
    supplier: null,
    returnDate: buildLocalDate(0),
    returnedBy: "",
    reasonHeader: "",
    currency: "LKR",
    notes: "",
    lines: [],
  };
}

function reasonToApi(reason: GrrReason): string {
  switch (reason) {
    case "Damaged":
      return "DAMAGED";
    case "Wrong Item":
      return "WRONG_ITEM";
    case "Expired":
      return "EXPIRED";
    case "Excess":
      return "EXCESS";
    case "Other":
      return "OTHER";
  }
}

function StatusBadge({
  statusKey,
  label,
}: {
  statusKey: string;
  label: string;
}) {
  const classes =
    statusKey === "APPROVED"
      ? "border-[#c7ead7] bg-[#effaf3] text-[#1f7a50]"
      : statusKey === "CANCELLED"
        ? "border-[#f3c4bb] bg-[#fff3f0] text-[#b94f37]"
        : "border-[#f4dfc8] bg-[#fff7ec] text-[#9a5a15]";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

const INITIAL_KPIS: GoodsReturnKpis = {
  totalReturns: 0,
  drafts: 0,
  approved: 0,
  approvedValueLkr: "0.00",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function GoodsReturnScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [rows, setRows] = useState<GoodsReturnListItem[]>([]);
  const [kpis, setKpis] = useState<GoodsReturnKpis>(INITIAL_KPIS);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);

  // Create-mode form data
  const [draft, setDraft] = useState<GrrDraft>(() => createInitialDraft("GR-2026-0001"));
  const [grnOptions, setGrnOptions] = useState<GrrGrnOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<GrrSupplierOption[]>([]);
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);

  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();

  const topRef = useRef<HTMLDivElement | null>(null);

  // ── Toast auto-dismiss ───────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ── Reset page on search change ──────────────────────────────────────
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ── Scroll to top on mode change ─────────────────────────────────────
  useEffect(() => {
    if (screenState.mode === "list") return;
    const frameId = window.requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  // ── Load goods returns list ──────────────────────────────────────────
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/goods-returns?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/goods-returns";
      const res = await fetch(url, {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { items: GoodsReturnListItem[]; kpis: GoodsReturnKpis } | null;
      };
      if (payload.success && payload.data) {
        setRows(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setListError("Failed to load goods returns.");
      }
    } catch {
      setListError("Network error. Check your connection and try again.");
    } finally {
      setListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ── Load create-mode data ────────────────────────────────────────────
  async function loadCreateData() {
    setCreateDataLoading(true);
    setCreateDataError(null);
    try {
      const [suppliersRes, grnsRes, formIdsRes, remarksRes] = await Promise.all([
        fetch("/api/accounting/suppliers/po-options", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        fetch("/api/accounting/goods-receipts/grr-options", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        fetch("/api/accounting/settings/form-ids", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
        fetch("/api/accounting/settings/remarks", {
          headers: { "x-portal": "ACCOUNTING" },
        }),
      ]);

      const [suppliersPayload, grnsPayload, formIdsPayload, remarksPayload] =
        await Promise.all([
          suppliersRes.json() as Promise<{
            success: boolean;
            data: { items: PoSupplierOption[] } | null;
          }>,
          grnsRes.json() as Promise<{
            success: boolean;
            data: { items: ApiGrrGrnOption[] } | null;
          }>,
          formIdsRes.json() as Promise<{
            success: boolean;
            data: { items: FormIdConfig[] } | null;
          }>,
          remarksRes.json() as Promise<{
            success: boolean;
            data: { items: { documentType: string; content: string }[] } | null;
          }>,
        ]);

      const loadedSuppliers: GrrSupplierOption[] =
        suppliersPayload.success && suppliersPayload.data
          ? suppliersPayload.data.items.map((s) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              contact: s.contact,
              city: s.city || "—",
              currency: s.currency,
            }))
          : [];

      const loadedGrns: GrrGrnOption[] =
        grnsPayload.success && grnsPayload.data
          ? grnsPayload.data.items.map((grn) => ({
              id: grn.id,
              grnNumber: grn.grnNumber,
              receiptDate: grn.receiptDate,
              supplierId: grn.supplierId,
              currency: grn.currency,
              status: grn.statusLabel,
              // Each picker line maps the API's remaining-returnable qty into
              // `receivedQty` so the form treats that as the cap when the user
              // types a return qty. The original received qty is also kept for
              // display purposes.
              lines: grn.lines.map((l) => ({
                grnLineId: l.grnLineId,
                itemId: l.itemId,
                itemLabel: l.itemLabel,
                description: l.description,
                receivedQty: l.remainingQty,
                unitPrice: l.unitPrice,
                uomName: l.uomName,
                uomBase: l.uomBase,
              })),
            }))
          : [];

      const grrConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "GRR") ?? null
          : null;

      const grrRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find(
              (item) => item.documentType === "GOODS_RETURN"
            )?.content ?? ""
          : "";

      setSupplierOptions(loadedSuppliers);
      setGrnOptions(loadedGrns);
      setDraft({
        ...createInitialDraft(buildReturnNumber(grrConfig)),
        notes: grrRemark,
      });
    } catch {
      setCreateDataError("Unable to load required data. Check your connection and try again.");
    } finally {
      setCreateDataLoading(false);
    }
  }

  // ── Mode helpers ─────────────────────────────────────────────────────
  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setScreenState({ mode: "create" });
    void loadCreateData();
  }

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  function openPreview(returnId: string) {
    setScreenState({ mode: "preview", returnId });
  }

  // Pending Forms inbox deep-links here with ?id=<returnId>.
  useOpenPreviewFromUrl(openPreview);

  // ── Save draft return ───────────────────────────────────────────────
  async function handleCreateReturn(currentDraft: GrrDraft) {
    if (!currentDraft.grnRef) {
      setToast({ tone: "error", message: "Pick a GRN to return against." });
      return;
    }
    if (!currentDraft.supplier) {
      setToast({ tone: "error", message: "Linked GRN has no supplier on file." });
      return;
    }
    if (!currentDraft.lines.length) {
      setToast({
        tone: "error",
        message: "The selected GRN has no received lines to return.",
      });
      return;
    }
    const totalReturn = currentDraft.lines.reduce(
      (sum, line) => sum + Number(line.returnQty || 0),
      0
    );
    if (totalReturn <= 0) {
      setToast({
        tone: "error",
        message: "Set return qty for at least one line before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      const body = {
        returnNumber: currentDraft.returnNumber,
        goodsReceiptId: currentDraft.grnRef.id,
        ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
        returnDate: currentDraft.returnDate,
        returnedBy: currentDraft.returnedBy,
        reasonHeader: currentDraft.reasonHeader,
        notes: currentDraft.notes,
        lines: currentDraft.lines
          // Only persist lines with return qty > 0 — empty rows would just
          // bloat the document.
          .filter((line) => Number(line.returnQty || 0) > 0)
          .map((line, idx) => ({
            goodsReceiptLineId: line.goodsReceiptLineId ?? "",
            productId: line.itemId,
            description: line.description,
            receivedQty: line.receivedQty || "0",
            returnQty: line.returnQty || "0",
            unitPrice: line.unitPrice || "0",
            uomName: line.uomName,
            uomBase: line.uomBase,
            reason: reasonToApi(line.reason),
            lineOrder: idx,
          })),
      };

      const res = await fetch("/api/accounting/goods-returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; returnNumber: string } | null;
        message?: string;
      };

      if (payload.success && payload.data) {
        const createdId = payload.data.id;
        void loadList();
        setToast({
          tone: "success",
          message: `Return ${payload.data.returnNumber} saved as draft.`,
        });
        setScreenState({ mode: "preview", returnId: createdId });
      } else {
        setToast({
          tone: "error",
          message: payload.message ?? "Failed to save goods return.",
        });
      }
    } catch {
      setToast({ tone: "error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // ── Filter + paginate list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) =>
      [
        row.returnNumber,
        row.linkedGrnNumber,
        row.supplierName,
        row.supplierCode,
        row.statusLabel,
      ].some((value) => value.toLowerCase().includes(search))
    );
  }, [rows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / RETURN_LIST_PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * RETURN_LIST_PAGE_SIZE;
    return filtered.slice(start, start + RETURN_LIST_PAGE_SIZE);
  }, [currentPage, filtered]);

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";

  const tableColumns = useMemo(
    () =>
      [
        "GR No",
        "Linked GRN",
        "Supplier",
        "Date",
        ...(showBranchColumn ? ["Branch"] : []),
        "Items",
        "Status",
        "Value",
      ].map((label) => ({ key: label, label })),
    [showBranchColumn]
  );

  const tableRows = useMemo(
    () =>
      paginated.map((row) => ({
        id: row.id,
        "GR No": row.returnNumber,
        "Linked GRN": row.linkedGrnNumber,
        Supplier: `${row.supplierCode} - ${row.supplierName}`,
        Date: row.returnDate,
        ...(showBranchColumn ? { Branch: row.storeCode } : {}),
        Items: row.itemsCount.toString(),
        Status: <StatusBadge statusKey={row.status} label={row.statusLabel} />,
        Value: `${row.currency} ${Number(row.totalValue).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      })),
    [paginated, showBranchColumn]
  );

  const paginationSummary = filtered.length
    ? `Showing ${(currentPage - 1) * RETURN_LIST_PAGE_SIZE + 1}-${Math.min(
        currentPage * RETURN_LIST_PAGE_SIZE,
        filtered.length
      )} of ${filtered.length} returns`
    : "Showing 0-0 of 0 returns";
  const paginationPages = Array.from({ length: totalPages }, (_, idx) => idx + 1);

  // ── KPI metrics ──────────────────────────────────────────────────────
  const metrics = [
    {
      label: "Returns",
      value: String(kpis.totalReturns).padStart(2, "0"),
      detail: "Goods returns captured against suppliers.",
      icon: Undo2,
      tone: "amber" as const,
    },
    {
      label: "Drafts",
      value: String(kpis.drafts).padStart(2, "0"),
      detail: "Drafts pending approval.",
      icon: FileText,
      tone: "blue" as const,
    },
    {
      label: "Approved",
      value: String(kpis.approved).padStart(2, "0"),
      detail: "Approved returns posted to ledgers.",
      icon: CircleCheck,
      tone: "green" as const,
    },
    {
      label: "Approved Value",
      value: formatCurrency(Number(kpis.approvedValueLkr), "LKR").replace(".00", ""),
      detail: "Total LKR value of approved returns in this register.",
      icon: WalletCards,
      tone: "violet" as const,
    },
  ];

  // ── Page intro ───────────────────────────────────────────────────────
  const intro: {
    eyebrow: string;
    title?: string;
    description?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "SUPPLIERS / GOODS RETURN / CREATE",
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
              disabled={saving || createDataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save Return"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return { eyebrow: "SUPPLIERS / GOODS RETURN / PREVIEW" };
    }

    return {
      eyebrow: "SUPPLIERS / GOODS RETURN",
      title: "Goods return workspace.",
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
      <div ref={topRef}>
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

          <SurfaceCard
            title="Supplier return register"
            description="Rejected, damaged, or excess supplier stock returned for credit."
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by GR number, GRN, supplier, or status"
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
                  onClick={() => void loadList()}
                  disabled={listLoading}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {listError ? (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {listError}
                </div>
              ) : null}

              {listLoading && !rows.length ? (
                <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                  Loading goods returns…
                </div>
              ) : !filtered.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No supplier returns matched this search.
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
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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
          {createDataLoading ? (
            <SurfaceCard>
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-[#786f69]">
                <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
                Loading approved GRNs and return configuration…
              </div>
            </SurfaceCard>
          ) : createDataError ? (
            <SurfaceCard>
              <div className="py-6">
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {createDataError}
                </div>
                <button
                  type="button"
                  onClick={() => void loadCreateData()}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#f2bcae] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#b94f37] transition hover:bg-[#fff2ee]"
                >
                  Retry
                </button>
              </div>
            </SurfaceCard>
          ) : (
            <GoodsReturnFormPanel
              formId={RETURN_FORM_ID}
              draft={draft}
              onChange={setDraft}
              onSubmit={handleCreateReturn}
              supplierOptions={supplierOptions}
              grnOptions={grnOptions}
            />
          )}
        </>
      )}

      {screenState.mode === "preview" && (
        <GoodsReturnPreview
          returnId={screenState.returnId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadList();
          }}
          onApproved={() => {
            void loadList();
            setToast({
              tone: "success",
              message: "Goods return approved.",
            });
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
