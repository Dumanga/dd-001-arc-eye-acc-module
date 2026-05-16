"use client";

import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Layers,
  Loader2,
  PackageX,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccountingPageIntro,
  DataTable,
  PremiumMetricGrid,
  StatusToast,
  SurfaceCard,
  type ToastState,
} from "@/components/accounting/accounting-ui";
import type {
  StockReportItem,
  StockReportKpis,
} from "@/app/api/accounting/inventory/stock-report/route";
import {
  StockReportPreview,
  type StockReportStatusFilter,
} from "@/components/accounting/stock-report-preview";

const PAGE_SIZE = 15;

const ITEM_TYPE_PILL: Record<string, string> = {
  INVENTORY_ITEM: "border-blue-200 bg-blue-50 text-blue-700",
  VOUCHER: "border-violet-200 bg-violet-50 text-violet-700",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  INVENTORY_ITEM: "Inventory",
  VOUCHER: "Voucher",
};

function formatMoney(value: string, currency = "LKR") {
  const n = Number(value);
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function stockToneClass(qty: number): string {
  if (qty <= 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (qty <= 5) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stockToneLabel(qty: number): string {
  if (qty <= 0) return "Out of stock";
  if (qty <= 5) return "Low stock";
  return "Healthy";
}

type ScreenState =
  | { mode: "list" }
  | { mode: "preview"; selectedStatuses: StockReportStatusFilter[]; generatedAt: Date };

export function StockReportScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [items, setItems] = useState<StockReportItem[]>([]);
  const [kpis, setKpis] = useState<StockReportKpis>({
    totalProducts: 0,
    totalUnits: "0",
    totalValueLkr: "0.00",
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Export popup state — anchored next to the Export button on the toolbar.
  const [exportPopupOpen, setExportPopupOpen] = useState(false);
  const exportPopupRef = useRef<HTMLDivElement>(null);
  const [pickedStatuses, setPickedStatuses] = useState<Set<StockReportStatusFilter>>(
    new Set(["HEALTHY", "LOW", "OUT"]),
  );

  useEffect(() => {
    if (!exportPopupOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!exportPopupRef.current) return;
      if (!exportPopupRef.current.contains(event.target as Node)) {
        setExportPopupOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportPopupOpen]);

  function toggleStatus(status: StockReportStatusFilter) {
    setPickedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function handleExport() {
    if (pickedStatuses.size === 0) {
      setToast({
        tone: "error",
        message: "Select at least one status to include in the report.",
      });
      return;
    }
    setExportPopupOpen(false);
    setScreenState({
      mode: "preview",
      selectedStatuses: Array.from(pickedStatuses) as StockReportStatusFilter[],
      generatedAt: new Date(),
    });
  }

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/inventory/stock-report", {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: { items: StockReportItem[]; kpis: StockReportKpis } | null;
      };
      if (payload.success && payload.data) {
        setItems(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setError(payload.message || "Failed to load stock report.");
      }
    } catch {
      setError("Network error while loading stock report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = [item.code, item.name, ITEM_TYPE_LABEL[item.itemType]]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const pagedItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationSummary = filteredItems.length
    ? `Showing ${startIndex + 1}-${startIndex + pagedItems.length} of ${filteredItems.length} products`
    : "No products to show";

  const tableColumns = useMemo(
    () =>
      ["Code", "Product", "Type", "UOM", "On Hand", "Avg Cost", "Stock Value", "Status"].map(
        (label) => ({ key: label, label }),
      ),
    [],
  );

  const tableRows = pagedItems.map((item) => {
    const qty = Number(item.totalQtyOnHand);
    const branchSummary = item.branchStock.length
      ? item.branchStock.map((b) => `${b.storeCode}: ${b.qtyOnHand}`).join(" · ")
      : "No branch stock";
    return {
      Code: <span className="font-semibold text-[#1f1d1c]">{item.code}</span>,
      Product: (
        <div className="flex flex-col">
          <span className="font-medium text-[#1f1d1c]">{item.name}</span>
          <span className="text-xs text-[#8c8079]">{branchSummary}</span>
        </div>
      ),
      Type: (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            ITEM_TYPE_PILL[item.itemType] ?? ITEM_TYPE_PILL.INVENTORY_ITEM
          }`}
        >
          {ITEM_TYPE_LABEL[item.itemType] ?? item.itemType}
        </span>
      ),
      UOM: item.uomBase || "—",
      "On Hand": (
        <span className="font-semibold text-[#1f1d1c] tabular-nums">{item.totalQtyOnHand}</span>
      ),
      "Avg Cost": (
        <span className="text-[#3f3b38] tabular-nums">{formatMoney(item.costPrice)}</span>
      ),
      "Stock Value": (
        <span className="font-semibold text-[#1f1d1c] tabular-nums">
          {formatMoney(item.totalStockValue)}
        </span>
      ),
      Status: (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stockToneClass(qty)}`}
        >
          {stockToneLabel(qty)}
        </span>
      ),
    };
  });

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  const metrics = useMemo(
    () => [
      {
        label: "Total Products",
        value: String(kpis.totalProducts).padStart(2, "0"),
        detail: "Inventory + voucher products on file.",
        icon: Layers,
        tone: "amber" as const,
      },
      {
        label: "Total Units",
        value: kpis.totalUnits,
        detail: "Sum of qty on hand across branches.",
        icon: Boxes,
        tone: "blue" as const,
      },
      {
        label: "Stock Value (LKR)",
        value: `LKR ${kpis.totalValueLkr}`,
        detail: "Qty × static cost price (UI hint).",
        icon: Coins,
        tone: "green" as const,
      },
      {
        label: "Low / Out of Stock",
        value: `${String(kpis.lowStockCount).padStart(2, "0")} / ${String(kpis.outOfStockCount).padStart(2, "0")}`,
        detail: "Items at or below 5 units / fully out.",
        icon: kpis.outOfStockCount > 0 ? PackageX : AlertTriangle,
        tone: "violet" as const,
      },
    ],
    [kpis],
  );

  if (screenState.mode === "preview") {
    return (
      <>
        <AccountingPageIntro eyebrow="INVENTORY / STOCK REPORTS / PREVIEW" />
        <StockReportPreview
          items={items}
          selectedStatuses={screenState.selectedStatuses}
          generatedAt={screenState.generatedAt}
          onBack={() => setScreenState({ mode: "list" })}
        />
        {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
      </>
    );
  }

  return (
    <>
      <AccountingPageIntro eyebrow="INVENTORY / STOCK REPORTS" />

      <PremiumMetricGrid items={metrics} />

      <SurfaceCard
        title="Stock register"
        description="Per-product stock on hand with branch breakdown and value at static cost price."
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
                placeholder="Search by code, name, or type"
                className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setCurrentPage(1);
                void loadReport();
              }}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0]"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <div className="relative" ref={exportPopupRef}>
              <button
                type="button"
                onClick={() => setExportPopupOpen((current) => !current)}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#ff7a12] px-4 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              {exportPopupOpen ? (
                <div className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-2xl border border-[#eadfd5] bg-white shadow-[0_18px_38px_rgba(42,34,28,0.12)]">
                  <div className="flex items-start justify-between gap-3 border-b border-[#f0e5dc] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1f1d1c]">
                        Filter by status
                      </p>
                      <p className="mt-0.5 text-xs text-[#7c6f65]">
                        Pick one or more to include in the export.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExportPopupOpen(false)}
                      aria-label="Close export popup"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e7ddd4] bg-white text-[#6f655d] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-1 p-2">
                    {(
                      [
                        { value: "HEALTHY", label: "Healthy", dot: "bg-emerald-500" },
                        { value: "LOW", label: "Low stock (≤ 5)", dot: "bg-amber-500" },
                        { value: "OUT", label: "Out of stock", dot: "bg-rose-500" },
                      ] as const
                    ).map((opt) => {
                      const isPicked = pickedStatuses.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleStatus(opt.value)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${
                            isPicked ? "bg-[#fff1e2] text-[#a95915]" : "text-[#5c534d] hover:bg-[#fff8f0]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                            <span className="text-sm font-medium">{opt.label}</span>
                          </span>
                          {isPicked ? (
                            <Check className="h-4 w-4 text-[#ff7101]" />
                          ) : (
                            <span className="h-4 w-4 rounded border border-[#cfc4ba]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-[#f0e5dc] p-2">
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={pickedStatuses.size === 0}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#ff7a12] text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading stock report…
              </span>
            </div>
          ) : !filteredItems.length ? (
            <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
              No products match your search.
            </div>
          ) : (
            <DataTable columns={tableColumns} rows={tableRows} />
          )}

          {filteredItems.length ? (
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

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
