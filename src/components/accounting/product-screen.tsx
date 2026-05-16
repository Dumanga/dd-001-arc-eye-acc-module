"use client";

import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Eye,
  Loader2,
  PackagePlus,
  PencilLine,
  Printer,
  ScanBarcode,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountingPageIntro, PremiumMetricGrid, SurfaceCard } from "@/components/accounting/accounting-ui";
import { BarcodeLabelModal } from "@/components/accounting/barcode-label-modal";
import { ProductFormPanel } from "@/components/accounting/product-form-panel";
import type { ApiResponse } from "@/lib/api/response";
import {
  PRODUCT_LIST_PAGE_SIZE,
  productHasPurchaseSide,
  productHasSalesSide,
  type ProductFormValues,
  type ProductListSort,
  type ProductRecord,
  type ProductsPayload,
} from "@/lib/accounting/product-types";

const PRODUCT_FORM_ID = "product-form";

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "view"; product: ProductRecord }
  | { mode: "edit"; product: ProductRecord };

type ToastState = {
  tone: "success" | "error";
  message: string;
};

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload.data as T;
}

function formatCurrency(value: string) {
  const numericValue = Number(value || 0);

  return `LKR ${numericValue.toLocaleString("en-LK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatCurrencyOrPlaceholder(value: string, enabled: boolean) {
  return enabled ? (value ? formatCurrency(value) : "Not set") : "Not used";
}

function StatusToast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const isSuccess = toast.tone === "success";

  return (
    <div className="fixed right-5 top-5 z-[110] w-full max-w-sm">
      <div
        className={`flex items-start gap-3 rounded-[24px] border px-4 py-3 shadow-[0_18px_42px_rgba(27,24,22,0.12)] ${
          isSuccess
            ? "border-[#bfe8cd] bg-[linear-gradient(180deg,#f5fff8_0%,#eafff0_100%)]"
            : "border-[#f3c4bb] bg-[linear-gradient(180deg,#fff8f6_0%,#fff0ec_100%)]"
        }`}
      >
        <span
          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white ${
            isSuccess ? "bg-[#18a66a]" : "bg-[#d75d3d]"
          }`}
        >
          {isSuccess ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isSuccess ? "text-[#176947]" : "text-[#a4442c]"}`}>
            {isSuccess ? "Success" : "Unable to Save"}
          </p>
          <p className={`mt-1 text-sm leading-6 ${isSuccess ? "text-[#2f5a43]" : "text-[#7b4f44]"}`}>
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition ${
            isSuccess ? "text-[#4e7b60] hover:bg-white/70" : "text-[#925545] hover:bg-white/70"
          }`}
          aria-label="Dismiss status message"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(320, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(320, maxHeight) - 10) : rect.bottom + 10;

      setPanelStyle({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          open
            ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
            : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
      >
        <span className={selectedOption ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedOption?.label || placeholder}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`}
        />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {options.map((option) => {
                  const isSelected = option.value === value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                          : "text-[#2d2926] hover:bg-[#fff7f0]"
                      }`}
                    >
                      <span>{option.label}</span>
                      {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function ProductScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [listPayload, setListPayload] = useState<ProductsPayload | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<ProductListSort>("latest");
  const [pageSize, setPageSize] = useState(PRODUCT_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<ProductRecord | null>(null);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  const sortOptions = [
    { label: "Sort: Latest", value: "latest" },
    { label: "Name: A to Z", value: "name-asc" },
    { label: "Name: Z to A", value: "name-desc" },
    { label: "Price: High to Low", value: "price-high" },
    { label: "Price: Low to High", value: "price-low" },
    { label: "Code: A to Z", value: "code-asc" },
  ];
  const pageSizeOptions = [
    { label: "10 per page", value: "10" },
    { label: "20 per page", value: "20" },
    { label: "30 per page", value: "30" },
    { label: "50 per page", value: "50" },
  ];

  const loadProducts = useCallback(async () => {
    if (screenState.mode !== "list") {
      return;
    }

    setLoading(true);
    setPageError(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        sort: sortBy,
      });

      if (debouncedSearchTerm) {
        params.set("query", debouncedSearchTerm);
      }

      const data = await requestJson<ProductsPayload>(`/api/accounting/products?${params.toString()}`, {
        cache: "no-store",
      });
      setListPayload(data);
      if (data.page !== currentPage) {
        setCurrentPage(data.page);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, pageSize, screenState.mode, sortBy]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    if (screenState.mode === "list") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [screenState.mode]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const closeFormMode = useCallback(() => {
    setScreenState({ mode: "list" });
    setFormError(null);
    setEditDirty(false);
  }, []);

  const openCreateMode = useCallback(() => {
    setScreenState({ mode: "create" });
    setFormError(null);
    setEditDirty(false);
  }, []);

  const openEditMode = useCallback((product: ProductRecord) => {
    setScreenState({ mode: "edit", product });
    setFormError(null);
    setEditDirty(false);
  }, []);

  const openViewMode = useCallback((product: ProductRecord) => {
    setScreenState({ mode: "view", product });
    setFormError(null);
    setEditDirty(false);
  }, []);

  const products = listPayload?.items ?? [];
  const totalCount = listPayload?.totalCount ?? 0;
  const totalPages = listPayload?.totalPages ?? 1;
  const metrics = useMemo(
    () => {
      const metricsSummary = listPayload?.summary ?? {
        registeredProducts: 0,
        serializedItems: 0,
        inventoryItems: 0,
        totalStockOnHand: 0,
        averageMargin: 0,
      };

      return [
        {
          label: "Registered Products",
          value: String(metricsSummary.registeredProducts).padStart(2, "0"),
          detail: "Visible in the product master list and ready for inventory-side usage.",
          icon: Boxes,
          tone: "amber" as const,
        },
        {
          label: "Serialized Items",
          value: String(metricsSummary.serializedItems).padStart(2, "0"),
          detail: "Products currently marked for serial number tracking.",
          icon: ScanBarcode,
          tone: "blue" as const,
        },
        {
          label: "On Hand",
          value: metricsSummary.totalStockOnHand.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          }),
          detail: `${String(metricsSummary.inventoryItems).padStart(2, "0")} inventory items currently tracked.`,
          icon: PackagePlus,
          tone: "green" as const,
        },
        {
          label: "Avg. Margin",
          value: `${metricsSummary.averageMargin}%`,
          detail: "Simple pricing margin preview across the saved product master list.",
          icon: WalletCards,
          tone: "violet" as const,
        },
      ];
    },
    [listPayload?.summary]
  );

  async function submitCreate(form: ProductFormValues, keepCreateMode: boolean) {
    setSaving(true);
    setFormError(null);

    try {
      await requestJson<ProductRecord>("/api/accounting/products", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setCurrentPage(1);
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setPageError(null);
      setToast({
        tone: "success",
        message: keepCreateMode ? "Product created. The form is ready for the next product." : "Product created successfully.",
      });

      if (!keepCreateMode) {
        closeFormMode();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create product.";
      setFormError(message);
      setToast({
        tone: "error",
        message,
      });
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(form: ProductFormValues) {
    await submitCreate(form, false);
  }

  async function handleCreateAndNext(form: ProductFormValues) {
    await submitCreate(form, true);
  }

  async function handleUpdate(form: ProductFormValues) {
    if (screenState.mode !== "edit") {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await requestJson<ProductRecord>("/api/accounting/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: screenState.product.id,
          ...form,
        }),
      });

      setPageError(null);
      setToast({
        tone: "success",
        message: "Product updated successfully.",
      });
      closeFormMode();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update product.";
      setFormError(message);
      setToast({
        tone: "error",
        message,
      });
      throw error;
    } finally {
      setSaving(false);
    }
  }

  const intro = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "INVENTORY / STOCK / CREATE",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeFormMode}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={PRODUCT_FORM_ID}
              data-intent="create"
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating..." : "Create Product"}
            </button>
            <button
              type="submit"
              form={PRODUCT_FORM_ID}
              data-intent="create-and-next"
              disabled={saving}
              className="rounded-xl bg-[#1f9f75] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#177a5a] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Create and Next"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "view") {
      return {
        eyebrow: "INVENTORY / STOCK / VIEW",
        action: (
          <button
            type="button"
            onClick={closeFormMode}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ),
      };
    }

    if (screenState.mode === "edit") {
      return {
        eyebrow: "INVENTORY / STOCK / EDIT",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeFormMode}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={PRODUCT_FORM_ID}
              data-intent="update"
              disabled={saving || !editDirty}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Updating..." : "Update Product"}
            </button>
          </div>
        ),
      };
    }

    return {
      eyebrow: "INVENTORY / STOCK",
      action: (
        <button
          type="button"
          onClick={openCreateMode}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          New Product
          <ArrowRight className="h-4 w-4" />
        </button>
      ),
    };
  })();

  return (
    <>
      <div ref={topSectionRef}>
        <AccountingPageIntro eyebrow={intro.eyebrow} action={intro.action} />
      </div>

      {screenState.mode === "list" ? (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard title="Product register" description="Compact product register with API-driven search, sorting, paging, and inline edit access.">
            <div className="grid gap-4">
              {pageError ? (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {pageError}
                </div>
              ) : null}

              <div className="grid gap-3 rounded-[20px] border border-[#e9e1d8] bg-[#fffaf5] px-4 py-3 xl:grid-cols-[1.3fr_0.8fr_0.7fr]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by item code, item name, category, brand, or model"
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>

                <div>
                  <FilterSelect
                    value={sortBy}
                    onChange={(value) => {
                      setSortBy(value as ProductListSort);
                      setCurrentPage(1);
                    }}
                    options={sortOptions}
                    placeholder="Sort products"
                  />
                </div>

                <div>
                  <FilterSelect
                    value={String(pageSize)}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                    options={pageSizeOptions}
                    placeholder="Page size"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-10 text-sm text-[#786f69]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                  Loading products...
                </div>
              ) : products.length ? null : (
                <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
                  <p className="text-base font-semibold text-[#1f1d1c]">No products matched this search.</p>
                  <p className="mt-2 text-sm text-[#786f69]">Try a different keyword or change the sort and page settings.</p>
                </div>
              )}

              {products.map((product) => {
                const hasPurchaseSide = productHasPurchaseSide(product.tradeMode);
                const hasSalesSide = productHasSalesSide(product.tradeMode);
                const productTitle = product.purchaseName || product.salesName || "Unnamed product";

                return (
                <div
                  key={product.id}
                  className="rounded-[20px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf5_100%)] px-4 py-3"
                >
                  <div className="grid gap-3 xl:grid-cols-[1.15fr_0.9fr_1fr_auto] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#fff0e2] px-2.5 py-1 text-[11px] font-semibold text-[#b45b12]">
                          {product.itemCode}
                        </span>
                        <span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#315d9b]">
                          {product.itemType}
                        </span>
                        <span className="rounded-full bg-[#f4efe9] px-2.5 py-1 text-[11px] font-semibold text-[#6f6258]">
                          {product.tradeMode}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            product.serialNumberAvailability === "Yes"
                              ? "bg-[#edf9f1] text-[#1b7a50]"
                              : "bg-[#fff3e8] text-[#b56a16]"
                          }`}
                        >
                          Serial {product.serialNumberAvailability}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-[0_8px_18px_rgba(31,29,28,0.08)] ${
                            product.productStatus === "Active"
                              ? "border-[#18a66a] bg-[#18a66a] text-white"
                              : "border-[#d75d3d] bg-[#d75d3d] text-white"
                          }`}
                        >
                          {product.productStatus}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate font-sans text-lg font-semibold text-[#1f1d1c]">
                        {productTitle}
                      </h3>
                      <p className="mt-1 truncate text-sm text-[#7a7068]">
                        {product.itemCategoryLabel || "Unassigned"} | {product.itemBrandLabel || "Unassigned"} |{" "}
                        {product.itemModelLabel || "Unassigned"}
                      </p>
                      {hasPurchaseSide && product.purchaseName && hasSalesSide && product.salesName && product.salesName !== product.purchaseName ? (
                        <p className="mt-1 truncate text-xs text-[#8b7f74]">Sales name: {product.salesName}</p>
                      ) : hasSalesSide && product.salesName && !hasPurchaseSide ? (
                        <p className="mt-1 truncate text-xs text-[#8b7f74]">Sales-only product setup.</p>
                      ) : hasPurchaseSide && !hasSalesSide ? (
                        <p className="mt-1 truncate text-xs text-[#8b7f74]">Purchase-only product setup.</p>
                      ) : null}
                    </div>

                    <div className="rounded-[16px] border border-[#eee4db] bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">Pricing</p>
                      <p className="mt-2 text-sm font-medium text-[#1f1d1c]">Cost: {formatCurrencyOrPlaceholder(product.costPrice, hasPurchaseSide)}</p>
                      <p className="mt-1 text-sm text-[#70665f]">Sell: {formatCurrencyOrPlaceholder(product.salesPrice, hasSalesSide)}</p>
                      <p className="mt-1 text-sm font-semibold text-[#1f1d1c]">
                        On hand: {hasPurchaseSide ? Number(product.stockOnHand || 0).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "Not tracked"}
                      </p>
                      {hasPurchaseSide && product.branchStock && product.branchStock.length > 0 ? (
                        <p className="mt-1 text-xs text-[#70665f]">
                          {product.branchStock
                            .map((row) => `${row.storeCode}: ${Number(row.qtyOnHand || 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-[#8b7f74]">UOM: {product.purchaseUomCategoryLabel}</p>
                    </div>

                    <div className="rounded-[16px] border border-[#eee4db] bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">Accounts</p>
                      <p className="mt-2 text-sm font-medium text-[#1f1d1c]">Inventory: {hasPurchaseSide ? product.inventoryAccountLabel || "Not set" : "Not used"}</p>
                      <p className="mt-1 text-sm text-[#70665f]">COGS: {hasPurchaseSide ? product.cogsAccountLabel || "Not set" : "Not used"}</p>
                      <p className="mt-1 text-sm text-[#70665f]">Income: {hasSalesSide ? product.incomeAccountLabel || "Not set" : "Not used"}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => openViewMode(product)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#d9e5f8] bg-[#f6f9ff] px-3.5 py-2 text-sm font-semibold text-[#315d9b] transition hover:bg-[#eef4ff]"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditMode(product)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3.5 py-2 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarcodeProduct(product)}
                        disabled={!product.itemCode.trim()}
                        title={product.itemCode.trim() ? "Generate barcode labels" : "No item code on this product"}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#dceadd] bg-[#f4faf4] px-3.5 py-2 text-sm font-semibold text-[#306b3a] transition hover:bg-[#ecf6ed] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Printer className="h-4 w-4" />
                        Download Barcode
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}

              <div className="flex flex-col gap-3 border-t border-[#ece4db] pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-[#786f69]">
                  <p>
                    Showing {totalCount ? (currentPage - 1) * pageSize + 1 : 0}-
                    {Math.min(currentPage * pageSize, totalCount)} of {totalCount} products
                  </p>
                  <p className="mt-1">Page {currentPage} of {totalPages}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      currentPage === 1
                        ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                        : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                    }`}
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition ${
                        page === currentPage
                          ? "bg-[#ff7a12] text-white shadow-[0_12px_24px_rgba(255,122,18,0.2)]"
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
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      currentPage === totalPages
                        ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                        : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </>
      ) : (
        <ProductFormPanel
          mode={screenState.mode}
          formId={PRODUCT_FORM_ID}
          initialProduct={screenState.mode === "create" ? undefined : screenState.product}
          onCreate={handleCreate}
          onCreateAndNext={handleCreateAndNext}
          onUpdate={handleUpdate}
          onDirtyChange={setEditDirty}
          serverError={formError}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}

      <BarcodeLabelModal
        open={barcodeProduct !== null}
        product={
          barcodeProduct
            ? {
                itemCode: barcodeProduct.itemCode,
                name: barcodeProduct.salesName || barcodeProduct.purchaseName || "Unnamed product",
                // Labels are for retail-facing scanning, so prefer
                // the sales price. Fall back to cost price so BUY-only
                // items still get a price line on the label.
                price: barcodeProduct.salesPrice || barcodeProduct.costPrice || null,
              }
            : null
        }
        onClose={() => setBarcodeProduct(null)}
      />
    </>
  );
}
