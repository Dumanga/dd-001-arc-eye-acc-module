"use client";

import {
  BadgeDollarSign,
  Check,
  ChevronDown,
  Loader2,
  Package2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type { ApiResponse } from "@/lib/api/response";
import type {
  ProductFormValues,
  ProductRecord,
  ProductSelectOption,
  ProductTradeMode,
} from "@/lib/accounting/product-types";
import {
  normalizeProductMasterName,
  type ProductMasterType,
} from "@/lib/accounting/product-master-types";
import { productHasPurchaseSide, productHasSalesSide } from "@/lib/accounting/product-types";
import type { UomCategoryDefinition } from "@/lib/accounting/uom-config";
import type { UomPayload } from "@/lib/accounting/uom-types";

export type ProductFormState = {
  itemType: string;
  tradeMode: ProductTradeMode;
  itemCode: string;
  itemCategory: string;
  itemBrand: string;
  itemModel: string;
  purchaseName: string;
  costPrice: string;
  purchaseUom: string;
  inventoryAccount: string;
  cogsAccount: string;
  preferredSuppliers: string[];
  serialNumberAvailability: "Yes" | "No";
  productStatus: "Active" | "Inactive";
  salesName: string;
  salesPrice: string;
  salesUom: string;
  incomeAccount: string;
};

const itemTypeOptions = ["Inventory Item", "Service Item", "Group Item", "Voucher"];
const productTradeModeOptions = ["Both", "Buy This", "Sell This"] as const;
const ASYNC_OPTIONS_PAGE_SIZE = 20;

type AsyncLookupOption = ProductSelectOption;
type ProductItemTypeOption = ProductFormValues["itemType"];
type ProductTradeModeOption = ProductFormValues["tradeMode"];

type AsyncLookupOptionsPayload = {
  items: AsyncLookupOption[];
  nextCursor: string | null;
  hasMore: boolean;
};

const initialState: ProductFormState = {
  itemType: "",
  tradeMode: "Both",
  itemCode: "",
  itemCategory: "",
  itemBrand: "",
  itemModel: "",
  purchaseName: "",
  costPrice: "",
  purchaseUom: "",
  inventoryAccount: "",
  cogsAccount: "",
  preferredSuppliers: [],
  serialNumberAvailability: "No",
  productStatus: "Active",
  salesName: "",
  salesPrice: "",
  salesUom: "",
  incomeAccount: "",
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

function buildOption(id?: string, label?: string): AsyncLookupOption | null {
  return id && label ? { id, label } : null;
}

function createFormState(initialProduct?: ProductRecord, defaultUomCategoryName?: string): ProductFormState {
  if (!initialProduct) {
    return {
      ...initialState,
      purchaseUom: defaultUomCategoryName ?? "",
      salesUom: defaultUomCategoryName ?? "",
    };
  }

  return {
    itemType: initialProduct.itemType,
    tradeMode: initialProduct.tradeMode,
    itemCode: initialProduct.itemCode,
    itemCategory: initialProduct.itemCategoryLabel,
    itemBrand: initialProduct.itemBrandLabel,
    itemModel: initialProduct.itemModelLabel,
    purchaseName: initialProduct.purchaseName,
    costPrice: initialProduct.costPrice,
    purchaseUom: initialProduct.purchaseUomCategoryLabel,
    inventoryAccount: initialProduct.inventoryAccountLabel,
    cogsAccount: initialProduct.cogsAccountLabel,
    preferredSuppliers: initialProduct.preferredSuppliers.map((supplier) => supplier.label),
    serialNumberAvailability: initialProduct.serialNumberAvailability,
    productStatus: initialProduct.productStatus,
    salesName: initialProduct.salesName,
    salesPrice: initialProduct.salesPrice,
    salesUom: initialProduct.salesUomCategoryLabel,
    incomeAccount: initialProduct.incomeAccountLabel,
  };
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-[#3f3a36]">
      {label}
      {required ? <span className="ml-1 text-[#ff7101]">*</span> : null}
    </label>
  );
}

function buildPerUnitLabel(label: string, baseUnit?: string | null) {
  const normalizedBaseUnit = baseUnit?.trim();

  if (!normalizedBaseUnit) {
    return label;
  }

  return `${label} (Per ${normalizedBaseUnit})`;
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
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

  useEffect(() => {
    if (!(disabled && open)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, open]);

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
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{value || placeholder}</span>
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
                  const isSelected = option === value;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        onChange(option);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                          : "text-[#2d2926] hover:bg-[#fff7f0]"
                      }`}
                    >
                      <span>{option}</span>
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

function AsyncSelectField({
  value,
  selectedOption,
  onSelect,
  placeholder,
  searchPlaceholder,
  endpoint,
  baseParams,
  emptyMessage,
  emptySearchMessage,
  disabled,
  excludedOptionLabels = [],
}: {
  value: string;
  selectedOption: AsyncLookupOption | null;
  onSelect: (option: AsyncLookupOption) => void;
  placeholder: string;
  searchPlaceholder: string;
  endpoint: string;
  baseParams?: Record<string, string>;
  emptyMessage: string;
  emptySearchMessage: string;
  disabled?: boolean;
  excludedOptionLabels?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [options, setOptions] = useState<AsyncLookupOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeQueryKeyRef = useRef("");
  const selectedLabel = selectedOption?.label || value || placeholder;
  const serializedBaseParams = JSON.stringify(baseParams ?? {});
  const normalizedBaseParams = useMemo(
    () =>
      Object.entries(JSON.parse(serializedBaseParams) as Record<string, string>)
        .filter(([, optionValue]) => Boolean(optionValue))
        .sort(([left], [right]) => left.localeCompare(right)),
    [serializedBaseParams]
  );
  const baseQueryKey = useMemo(() => JSON.stringify(normalizedBaseParams), [normalizedBaseParams]);
  const visibleOptions = options.filter(
    (option) =>
      selectedOption?.id === option.id ||
      !excludedOptionLabels.some((label) => label && label === option.label)
  );

  useEffect(() => {
    if (!(disabled && open)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, open]);

  const loadOptions = useCallback(
    async ({ append, cursor, queryKey }: { append: boolean; cursor: string | null; queryKey: string }) => {
      const params = new URLSearchParams({
        limit: String(ASYNC_OPTIONS_PAGE_SIZE),
      });

      for (const [key, optionValue] of normalizedBaseParams) {
        params.set(key, optionValue);
      }

      if (debouncedSearchTerm) {
        params.set("q", debouncedSearchTerm);
      }

      if (cursor) {
        params.set("cursor", cursor);
      }

      const payload = await requestJson<AsyncLookupOptionsPayload>(`${endpoint}?${params.toString()}`);

      if (activeQueryKeyRef.current !== queryKey) {
        return;
      }

      setOptions((current) => {
        if (!append) {
          return payload.items;
        }

        const seen = new Set(current.map((option) => option.id));
        const merged = [...current];

        for (const option of payload.items) {
          if (!seen.has(option.id)) {
            merged.push(option);
            seen.add(option.id);
          }
        }

        return merged;
      });
      setNextCursor(payload.nextCursor);
      setHasMore(payload.hasMore);
    },
    [debouncedSearchTerm, endpoint, normalizedBaseParams]
  );

  const loadFirstPage = useCallback(async () => {
    const queryKey = `${endpoint}:${baseQueryKey}:${debouncedSearchTerm}`;
    activeQueryKeyRef.current = queryKey;
    setLoading(true);
    setLoadingMore(false);
    setErrorMessage(null);
    setOptions([]);
    setNextCursor(null);
    setHasMore(false);

    try {
      await loadOptions({ append: false, cursor: null, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load options.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoading(false);
      }
    }
  }, [baseQueryKey, debouncedSearchTerm, endpoint, loadOptions]);

  const loadMore = useCallback(async () => {
    if (!open || loading || loadingMore || !hasMore || !nextCursor) {
      return;
    }

    const queryKey = `${endpoint}:${baseQueryKey}:${debouncedSearchTerm}`;
    setLoadingMore(true);
    setErrorMessage(null);

    try {
      await loadOptions({ append: true, cursor: nextCursor, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load more options.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoadingMore(false);
      }
    }
  }, [baseQueryKey, debouncedSearchTerm, endpoint, hasMore, loadOptions, loading, loadingMore, nextCursor, open]);

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
      const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(200, Math.min(360, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(360, maxHeight) - 10) : rect.bottom + 10;

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

  useEffect(() => {
    if (!open) {
      activeQueryKeyRef.current = "";
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setOptions([]);
      setNextCursor(null);
      setHasMore(false);
      setErrorMessage(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus();
      setDebouncedSearchTerm(searchTerm.trim());
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [open, searchTerm]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    void loadFirstPage();
  }, [debouncedSearchTerm, disabled, loadFirstPage, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const currentList = listRef.current;

    if (!currentList) {
      return;
    }

    const listElement = currentList;

    function handleScroll() {
      if (listElement.scrollTop + listElement.clientHeight >= listElement.scrollHeight - 48) {
        void loadMore();
      }
    }

    listElement.addEventListener("scroll", handleScroll);

    return () => {
      listElement.removeEventListener("scroll", handleScroll);
    };
  }, [loadMore, open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedOption || value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
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
              <div className="border-b border-[#efe4db] bg-white/90 p-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-[#fffdfa] py-2.5 pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </div>
              </div>
              <div ref={listRef} className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[#7a7068]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                    Loading options...
                  </div>
                ) : visibleOptions.length > 0 ? (
                  visibleOptions.map((option) => {
                    const isSelected = selectedOption?.id === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onSelect(option);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                          isSelected
                            ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                            : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span>{option.label}</span>
                        {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-[#8a7e74]">
                    {debouncedSearchTerm ? emptySearchMessage : emptyMessage}
                  </div>
                )}

                {errorMessage ? (
                  <div className="mx-1 mt-2 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-3 text-sm text-[#b94f37]">
                    <p>{errorMessage}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (options.length === 0) {
                          void loadFirstPage();
                          return;
                        }

                        void loadMore();
                      }}
                      className="mt-2 font-semibold text-[#b45b12]"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}

                {loadingMore ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-[#7a7068]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                    Loading more...
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function CreatableAsyncSelectField({
  value,
  selectedOption,
  onSelect,
  placeholder,
  searchPlaceholder,
  createPlaceholder,
  endpoint,
  masterType,
  emptyMessage,
  emptySearchMessage,
  disabled,
}: {
  value: string;
  selectedOption: AsyncLookupOption | null;
  onSelect: (option: AsyncLookupOption) => void;
  placeholder: string;
  searchPlaceholder: string;
  createPlaceholder: string;
  endpoint: string;
  masterType: ProductMasterType;
  emptyMessage: string;
  emptySearchMessage: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [createValue, setCreateValue] = useState("");
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [options, setOptions] = useState<AsyncLookupOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeQueryKeyRef = useRef("");
  const selectedLabel = selectedOption?.label || value || placeholder;
  const normalizedCreateValue = normalizeProductMasterName(createValue);

  useEffect(() => {
    if (!(disabled && open)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, open]);

  const loadOptions = useCallback(
    async ({ append, cursor, queryKey }: { append: boolean; cursor: string | null; queryKey: string }) => {
      const params = new URLSearchParams({
        type: masterType,
        limit: String(ASYNC_OPTIONS_PAGE_SIZE),
      });

      if (debouncedSearchTerm) {
        params.set("q", debouncedSearchTerm);
      }

      if (cursor) {
        params.set("cursor", cursor);
      }

      const payload = await requestJson<AsyncLookupOptionsPayload>(`${endpoint}?${params.toString()}`);

      if (activeQueryKeyRef.current !== queryKey) {
        return;
      }

      setOptions((current) => {
        if (!append) {
          return payload.items;
        }

        const seen = new Set(current.map((option) => option.id));
        const merged = [...current];

        for (const option of payload.items) {
          if (!seen.has(option.id)) {
            merged.push(option);
            seen.add(option.id);
          }
        }

        return merged;
      });
      setNextCursor(payload.nextCursor);
      setHasMore(payload.hasMore);
    },
    [debouncedSearchTerm, endpoint, masterType]
  );

  const loadFirstPage = useCallback(async () => {
    const queryKey = `${masterType}:${debouncedSearchTerm}`;
    activeQueryKeyRef.current = queryKey;
    setLoading(true);
    setLoadingMore(false);
    setErrorMessage(null);
    setOptions([]);
    setNextCursor(null);
    setHasMore(false);

    try {
      await loadOptions({ append: false, cursor: null, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load options.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoading(false);
      }
    }
  }, [debouncedSearchTerm, loadOptions, masterType]);

  const loadMore = useCallback(async () => {
    if (!open || mode !== "search" || loading || loadingMore || !hasMore || !nextCursor) {
      return;
    }

    const queryKey = `${masterType}:${debouncedSearchTerm}`;
    setLoadingMore(true);
    setErrorMessage(null);

    try {
      await loadOptions({ append: true, cursor: nextCursor, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load more options.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoadingMore(false);
      }
    }
  }, [debouncedSearchTerm, hasMore, loadOptions, loading, loadingMore, masterType, mode, nextCursor, open]);

  const handleCreate = useCallback(async () => {
    if (!normalizedCreateValue || creating) {
      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const created = await requestJson<AsyncLookupOption>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          type: masterType,
          name: normalizedCreateValue,
        }),
      });

      onSelect(created);
      setCreateValue("");
      setMode("search");
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create option.");
    } finally {
      setCreating(false);
    }
  }, [creating, endpoint, masterType, normalizedCreateValue, onSelect]);

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
      const openUpward = spaceBelow < 280 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(220, Math.min(360, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(360, maxHeight) - 10) : rect.bottom + 10;

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

  useEffect(() => {
    if (!open) {
      activeQueryKeyRef.current = "";
      setMode("search");
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setCreateValue("");
      setOptions([]);
      setNextCursor(null);
      setHasMore(false);
      setErrorMessage(null);
      setLoading(false);
      setLoadingMore(false);
      setCreating(false);
      return;
    }

    if (mode === "search") {
      const timeoutId = window.setTimeout(() => {
        searchInputRef.current?.focus();
        setDebouncedSearchTerm(searchTerm.trim());
      }, 280);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      createInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [mode, open, searchTerm]);

  useEffect(() => {
    if (!open || mode !== "search") {
      return;
    }

    void loadFirstPage();
  }, [debouncedSearchTerm, loadFirstPage, mode, open]);

  useEffect(() => {
    if (!open || mode !== "search") {
      return;
    }

    const currentList = listRef.current;

    if (!currentList) {
      return;
    }

    const listElement = currentList;

    function handleScroll() {
      if (listElement.scrollTop + listElement.clientHeight >= listElement.scrollHeight - 48) {
        void loadMore();
      }
    }

    listElement.addEventListener("scroll", handleScroll);

    return () => {
      listElement.removeEventListener("scroll", handleScroll);
    };
  }, [loadMore, mode, open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#5f5750]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedOption || value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
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
              <div className="border-b border-[#efe4db] bg-white/90 p-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("search");
                      setErrorMessage(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      mode === "search"
                        ? "bg-[#fff1e2] text-[#b45b12]"
                        : "bg-[#f6efe7] text-[#8a7e74] hover:bg-[#fff7f0]"
                    }`}
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("create");
                      setErrorMessage(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      mode === "create"
                        ? "bg-[#effbf4] text-[#176445]"
                        : "bg-[#f6efe7] text-[#8a7e74] hover:bg-[#fff7f0]"
                    }`}
                  >
                    Create
                  </button>
                </div>

                {mode === "search" ? (
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder={searchPlaceholder}
                      className="w-full rounded-2xl border border-[#e2d8cf] bg-[#fffdfa] py-2.5 pl-10 pr-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                    />
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={createInputRef}
                      type="text"
                      value={createValue}
                      onChange={(event) => setCreateValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCreate();
                        }
                      }}
                      placeholder={createPlaceholder}
                      className="min-w-0 flex-1 rounded-2xl border border-[#e2d8cf] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleCreate();
                      }}
                      disabled={!normalizedCreateValue || creating}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl transition ${
                        normalizedCreateValue && !creating
                          ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                          : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                      }`}
                      aria-label="Create option"
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>

              {mode === "search" ? (
                <div ref={listRef} className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[#7a7068]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                      Loading options...
                    </div>
                  ) : options.length > 0 ? (
                    options.map((option) => {
                      const isSelected = selectedOption?.id === option.id;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            onSelect(option);
                            setOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                            isSelected
                              ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                              : "text-[#2d2926] hover:bg-[#fff7f0]"
                          }`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span>{option.label}</span>
                          {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-sm text-[#8a7e74]">
                      {debouncedSearchTerm ? emptySearchMessage : emptyMessage}
                    </div>
                  )}

                  {loadingMore ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-[#7a7068]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                      Loading more...
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="p-3 text-sm text-[#7a7068]">
                  Create a new value here and it will be selected immediately for this product.
                </div>
              )}

              {errorMessage ? (
                <div className="border-t border-[#efe4db] bg-[#fff3f0] px-3 py-3 text-sm text-[#b94f37]">
                  {errorMessage}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[#a2978c] ${
        disabled
          ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#5f5750]"
          : "border-[#e2d8cf] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
      }`}
    />
  );
}

function PriceField({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#7f746c]">
        LKR
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-2xl border py-3 pl-14 pr-4 text-sm outline-none transition placeholder:text-[#a2978c] ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#5f5750]"
            : "border-[#e2d8cf] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        }`}
      />
    </div>
  );
}

function SelectionCard({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
  activeClassName,
  activeIconClassName,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  activeClassName: string;
  activeIconClassName: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex min-h-[62px] items-center gap-2.5 rounded-[18px] border px-3 py-2.5 text-left transition ${
        active
          ? activeClassName
          : disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#7b7068]"
            : "border-[#e7ddd4] bg-white text-[#72675f] hover:border-[#e0d2c6] hover:bg-[#fffaf4]"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border transition ${
          active
            ? activeIconClassName
            : disabled
              ? "border-[#ddd2c8] bg-[#efe7df] text-[#96897f]"
              : "border-[#eee3d9] bg-[#fbf6f1] text-[#8f8378] group-hover:border-[#e2d5c9]"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 text-sm font-semibold leading-5">{label}</span>
      <span
        className={`absolute right-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full border transition ${
          active
            ? "border-white/80 bg-white text-[#1f1d1c] shadow-[0_8px_16px_rgba(31,29,28,0.10)]"
            : "border-[#eadfd5] bg-[#fffdfa] text-transparent"
        }`}
      >
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}

function BinarySelector({
  value,
  onChange,
  disabled,
}: {
  value: "Yes" | "No";
  onChange: (value: "Yes" | "No") => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {(
        [
          {
            value: "No" as const,
            label: "No",
            icon: X,
            activeClassName:
              "border-[#ffd5c4] bg-[linear-gradient(180deg,#fff7f3_0%,#fff1e9_100%)] text-[#b45c1c] shadow-[0_12px_24px_rgba(255,122,18,0.10)]",
            activeIconClassName: "border-[#ffc8a7] bg-white text-[#d46b21]",
          },
          {
            value: "Yes" as const,
            label: "Yes",
            icon: Check,
            activeClassName:
              "border-[#bfe4cf] bg-[linear-gradient(180deg,#f6fff9_0%,#ebfbf2_100%)] text-[#176445] shadow-[0_12px_24px_rgba(24,166,106,0.10)]",
            activeIconClassName: "border-[#b6e0c7] bg-white text-[#178456]",
          },
        ] satisfies Array<{
          value: "Yes" | "No";
          label: string;
          icon: LucideIcon;
          activeClassName: string;
          activeIconClassName: string;
        }>
      ).map((option) => (
        <SelectionCard
          key={option.value}
          label={option.label}
          icon={option.icon}
          active={value === option.value}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onChange(option.value);
            }
          }}
          activeClassName={option.activeClassName}
          activeIconClassName={option.activeIconClassName}
        />
      ))}
    </div>
  );
}

function ProductTradeModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ProductTradeMode;
  onChange: (value: ProductTradeMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2.5 lg:grid-cols-3">
      {(
        [
          {
            value: "Both" as ProductTradeMode,
            label: "Both",
            icon: Sparkles,
            activeClassName:
              "border-[#ffd5c4] bg-[linear-gradient(180deg,#fff8f1_0%,#fff0e5_100%)] text-[#b45c1c] shadow-[0_12px_24px_rgba(255,122,18,0.10)]",
            activeIconClassName: "border-[#ffc8a7] bg-white text-[#d46b21]",
          },
          {
            value: "Buy This" as ProductTradeMode,
            label: "Buy",
            icon: Package2,
            activeClassName:
              "border-[#bfe4cf] bg-[linear-gradient(180deg,#f6fff9_0%,#ebfbf2_100%)] text-[#176445] shadow-[0_12px_24px_rgba(24,166,106,0.10)]",
            activeIconClassName: "border-[#b6e0c7] bg-white text-[#178456]",
          },
          {
            value: "Sell This" as ProductTradeMode,
            label: "Sell",
            icon: BadgeDollarSign,
            activeClassName:
              "border-[#d9e5f8] bg-[linear-gradient(180deg,#f7faff_0%,#eef5ff_100%)] text-[#315d9b] shadow-[0_12px_24px_rgba(49,93,155,0.10)]",
            activeIconClassName: "border-[#cfe0fb] bg-white text-[#315d9b]",
          },
        ] satisfies Array<{
          value: ProductTradeMode;
          label: string;
          icon: LucideIcon;
          activeClassName: string;
          activeIconClassName: string;
        }>
      ).map((option) => (
        <SelectionCard
          key={option.value}
          label={option.label}
          icon={option.icon}
          active={value === option.value}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onChange(option.value);
            }
          }}
          activeClassName={option.activeClassName}
          activeIconClassName={option.activeIconClassName}
        />
      ))}
    </div>
  );
}

function ProductStatusSelector({
  value,
  onChange,
  disabled,
}: {
  value: "Active" | "Inactive";
  onChange: (value: "Active" | "Inactive") => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {(
        [
          {
            value: "Active" as const,
            label: "Active",
            icon: ShieldCheck,
            activeClassName:
              "border-[#bfe4cf] bg-[linear-gradient(180deg,#f6fff9_0%,#ebfbf2_100%)] text-[#176445] shadow-[0_12px_24px_rgba(24,166,106,0.10)]",
            activeIconClassName: "border-[#b6e0c7] bg-white text-[#178456]",
          },
          {
            value: "Inactive" as const,
            label: "Inactive",
            icon: X,
            activeClassName:
              "border-[#ffd5c4] bg-[linear-gradient(180deg,#fff7f3_0%,#fff1e9_100%)] text-[#b45c1c] shadow-[0_12px_24px_rgba(255,122,18,0.10)]",
            activeIconClassName: "border-[#ffc8a7] bg-white text-[#d46b21]",
          },
        ] satisfies Array<{
          value: "Active" | "Inactive";
          label: string;
          icon: LucideIcon;
          activeClassName: string;
          activeIconClassName: string;
        }>
      ).map((option) => (
        <SelectionCard
          key={option.value}
          label={option.label}
          icon={option.icon}
          active={value === option.value}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onChange(option.value);
            }
          }}
          activeClassName={option.activeClassName}
          activeIconClassName={option.activeIconClassName}
        />
      ))}
    </div>
  );
}

function SupplierSelector({
  value,
  onAdd,
  onRemove,
  disabled,
}: {
  value: AsyncLookupOption[];
  onAdd: (supplier: AsyncLookupOption) => void;
  onRemove: (supplierId: string) => void;
  disabled?: boolean;
}) {
  const [selectedSupplier, setSelectedSupplier] = useState<AsyncLookupOption | null>(null);

  return (
    <div className="grid gap-3">
      {!disabled ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <AsyncSelectField
              value={selectedSupplier?.label || ""}
              selectedOption={selectedSupplier}
              onSelect={setSelectedSupplier}
              placeholder="Choose supplier"
              searchPlaceholder="Search suppliers"
              endpoint="/api/accounting/suppliers/options"
              emptyMessage="No suppliers available."
              emptySearchMessage="No matching suppliers."
              excludedOptionLabels={value.map((supplier) => supplier.label)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (selectedSupplier) {
                onAdd(selectedSupplier);
                setSelectedSupplier(null);
              }
            }}
            disabled={!selectedSupplier}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              selectedSupplier
                ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
            }`}
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
        </div>
      ) : null}

      <div className="flex min-h-[56px] flex-wrap gap-2 rounded-[22px] border border-dashed border-[#e5d7cb] bg-[#fffaf4] p-3">
        {value.length ? (
          value.map((supplier) => (
            <span
              key={supplier.id}
              className="inline-flex items-center gap-2 rounded-full border border-[#ffd9bb] bg-white px-3 py-2 text-sm font-medium text-[#5b514a]"
            >
              {supplier.label}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onRemove(supplier.id)}
                  className="rounded-full bg-[#fff1e2] p-1 text-[#b45b12] transition hover:bg-[#ffe3cf]"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))
        ) : (
          <p className="self-center text-sm text-[#8b7f74]">Preferred suppliers will appear here as tags.</p>
        )}
      </div>
    </div>
  );
}

export type ProductFormPanelMode = "create" | "edit" | "view";

export function ProductFormPanel({
  mode = "create",
  formId = "product-create-form",
  initialProduct,
  onCreate,
  onCreateAndNext,
  onUpdate,
  onDirtyChange,
  serverError,
}: {
  mode?: ProductFormPanelMode;
  formId?: string;
  initialProduct?: ProductRecord;
  onCreate?: (form: ProductFormValues) => Promise<void> | void;
  onCreateAndNext?: (form: ProductFormValues) => Promise<void> | void;
  onUpdate?: (form: ProductFormValues) => Promise<void> | void;
  onDirtyChange?: (value: boolean) => void;
  serverError?: string | null;
}) {
  const isEditMode = mode === "edit";
  const isViewMode = mode === "view";
  const [form, setForm] = useState<ProductFormState>(() => createFormState(initialProduct));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [uomCategories, setUomCategories] = useState<UomCategoryDefinition[]>([]);
  const [uomLoading, setUomLoading] = useState(true);
  const [uomError, setUomError] = useState<string | null>(null);
  const [selectedCategoryOption, setSelectedCategoryOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.itemCategoryId, initialProduct?.itemCategoryLabel)
  );
  const [selectedBrandOption, setSelectedBrandOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.itemBrandId, initialProduct?.itemBrandLabel)
  );
  const [selectedModelOption, setSelectedModelOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.itemModelId, initialProduct?.itemModelLabel)
  );
  const [selectedInventoryAccountOption, setSelectedInventoryAccountOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.inventoryAccountId, initialProduct?.inventoryAccountLabel)
  );
  const [selectedCogsAccountOption, setSelectedCogsAccountOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.cogsAccountId, initialProduct?.cogsAccountLabel)
  );
  const [selectedIncomeAccountOption, setSelectedIncomeAccountOption] = useState<AsyncLookupOption | null>(() =>
    buildOption(initialProduct?.incomeAccountId, initialProduct?.incomeAccountLabel)
  );
  const [selectedPreferredSuppliers, setSelectedPreferredSuppliers] = useState<AsyncLookupOption[]>(
    () => initialProduct?.preferredSuppliers ?? []
  );
  const [salesNameManuallyEdited, setSalesNameManuallyEdited] = useState(
    () => Boolean(initialProduct && initialProduct.salesName !== initialProduct.purchaseName)
  );
  const uomOptionLabels = useMemo(() => uomCategories.map((category) => category.name), [uomCategories]);
  const defaultUomCategory = useMemo(
    () => uomCategories.find((category) => category.code === "UNIT") ?? null,
    [uomCategories]
  );
  const selectedPurchaseUomCategory = useMemo(
    () => uomCategories.find((category) => category.name === form.purchaseUom) ?? null,
    [form.purchaseUom, uomCategories]
  );
  const selectedSalesUomCategory = useMemo(
    () => uomCategories.find((category) => category.name === form.salesUom) ?? null,
    [form.salesUom, uomCategories]
  );
  const normalizedTradeMode = (productTradeModeOptions.includes(form.tradeMode)
    ? form.tradeMode
    : "Both") as ProductTradeModeOption;
  const hasPurchaseSide = productHasPurchaseSide(normalizedTradeMode);
  const hasSalesSide = productHasSalesSide(normalizedTradeMode);
  const salesNameLocked = hasPurchaseSide && hasSalesSide && !form.purchaseName.trim();
  const salesNameDisabled = isViewMode || salesNameLocked;

  // Vouchers are always serial-tracked (each voucher gets a unique serial
  // that flows ACTIVE → ISSUED → REDEEMED through GRN, POS, redemption).
  // Force the binary toggle to "Yes" and lock it as soon as the operator
  // picks Voucher as the item type.
  const isVoucherItem = form.itemType === "Voucher";
  // Service items have no inventory leg — they hit COGS at GRN time and have
  // no stock to carry. The Inventory Account field is hidden + skipped from
  // validation/payload below.
  const isServiceItem = form.itemType === "Service Item";
  useEffect(() => {
    if (isVoucherItem && form.serialNumberAvailability !== "Yes") {
      setForm((current) => ({ ...current, serialNumberAvailability: "Yes" }));
    }
  }, [isVoucherItem, form.serialNumberAvailability]);

  // Voucher products are sales-only per accounting-theories.md § 7.3
  // (cost = 0, no purchase-side configuration). Force Trade Mode to
  // "Sell This" the moment the operator picks Voucher as the item type
  // so the Purchase Information section disappears and only the
  // sales-side accounts (income → liability dropdown) remain.
  useEffect(() => {
    if (isVoucherItem && form.tradeMode !== "Sell This") {
      setForm((current) => ({ ...current, tradeMode: "Sell This" as ProductTradeMode }));
    }
  }, [isVoucherItem, form.tradeMode]);

  useEffect(() => {
    setForm(createFormState(initialProduct, defaultUomCategory?.name));
    setTouched({});
    setSelectedCategoryOption(buildOption(initialProduct?.itemCategoryId, initialProduct?.itemCategoryLabel));
    setSelectedBrandOption(buildOption(initialProduct?.itemBrandId, initialProduct?.itemBrandLabel));
    setSelectedModelOption(buildOption(initialProduct?.itemModelId, initialProduct?.itemModelLabel));
    setSelectedInventoryAccountOption(
      buildOption(initialProduct?.inventoryAccountId, initialProduct?.inventoryAccountLabel)
    );
    setSelectedCogsAccountOption(buildOption(initialProduct?.cogsAccountId, initialProduct?.cogsAccountLabel));
    setSelectedIncomeAccountOption(buildOption(initialProduct?.incomeAccountId, initialProduct?.incomeAccountLabel));
    setSelectedPreferredSuppliers(initialProduct?.preferredSuppliers ?? []);
    setSalesNameManuallyEdited(Boolean(initialProduct && initialProduct.salesName !== initialProduct.purchaseName));
  }, [defaultUomCategory?.name, initialProduct, mode]);

  useEffect(() => {
    let active = true;

    async function loadUomCategories() {
      setUomLoading(true);
      setUomError(null);

      try {
        const payload = await requestJson<UomPayload>("/api/accounting/uom");

        if (!active) {
          return;
        }

        setUomCategories(payload.categories);
      } catch (error) {
        if (!active) {
          return;
        }

        setUomCategories([]);
        setUomError(error instanceof Error ? error.message : "Unable to load UOM categories.");
      } finally {
        if (active) {
          setUomLoading(false);
        }
      }
    }

    void loadUomCategories();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!defaultUomCategory) {
      return;
    }

    setForm((current) => {
      const nextPurchaseUom = current.purchaseUom || defaultUomCategory.name;
      const nextSalesUom = current.salesUom || nextPurchaseUom;

      if (
        nextPurchaseUom === current.purchaseUom &&
        nextSalesUom === current.salesUom
      ) {
        return current;
      }

      return {
        ...current,
        purchaseUom: nextPurchaseUom,
        salesUom: nextSalesUom,
      };
    });
  }, [defaultUomCategory]);

  const errors = useMemo(() => {
    return {
      itemType: form.itemType ? "" : "Select the item type.",
      tradeMode: normalizedTradeMode ? "" : "Select whether this item is for buying, selling, or both.",
      itemCode: !form.itemCode.trim()
        ? "Enter an item code."
        : /\s/.test(form.itemCode)
          ? "Spaces are not allowed in the item code."
          : form.itemCode.length > 30
            ? "Item code must be 30 characters or less."
            : "",
      purchaseName: !hasPurchaseSide
        ? ""
        : form.purchaseName.trim()
          ? ""
          : "Enter the purchase description.",
      costPrice: !hasPurchaseSide ? "" : form.costPrice.trim() ? "" : "Enter the cost price.",
      purchaseUom: !hasPurchaseSide ? "" : form.purchaseUom ? "" : "Select the purchase UOM.",
      inventoryAccount:
        !hasPurchaseSide || isServiceItem
          ? ""
          : form.inventoryAccount
            ? ""
            : "Select the inventory account.",
      cogsAccount: !hasPurchaseSide ? "" : form.cogsAccount ? "" : "Select the COGS account.",
      salesName: !hasSalesSide
        ? ""
        : hasPurchaseSide && !form.purchaseName.trim()
          ? ""
          : form.salesName.trim()
            ? ""
            : "Enter the sales description.",
      salesPrice: !hasSalesSide ? "" : form.salesPrice.trim() ? "" : "Enter the sales price.",
      salesUom: !hasSalesSide ? "" : form.salesUom ? "" : "Select the sales UOM.",
      incomeAccount: !hasSalesSide ? "" : form.incomeAccount ? "" : "Select the income account.",
    };
  }, [form, hasPurchaseSide, hasSalesSide, isServiceItem, normalizedTradeMode]);

  function setValue<Key extends keyof ProductFormState>(key: Key, value: ProductFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function markTouched(name: string) {
    setTouched((current) => ({ ...current, [name]: true }));
  }

  function handleSharedUomChange(value: string) {
    setForm((current) => ({
      ...current,
      purchaseUom: value,
      salesUom: value,
    }));
    setTouched((current) => ({
      ...current,
      purchaseUom: true,
      salesUom: true,
    }));
  }

  function handleTradeModeChange(value: ProductTradeMode) {
    setForm((current) => {
      const sharedUom = current.purchaseUom || current.salesUom || defaultUomCategory?.name || "";
      const nextPurchaseName =
        value === "Both" && !current.purchaseName.trim() && current.salesName.trim()
          ? current.salesName
          : current.purchaseName;
      const nextSalesName =
        value === "Both" && !current.salesName.trim() && nextPurchaseName.trim()
          ? nextPurchaseName
          : current.salesName;

      return {
        ...current,
        tradeMode: value,
        purchaseName: nextPurchaseName,
        salesName: nextSalesName,
        purchaseUom: sharedUom,
        salesUom: sharedUom,
      };
    });
    markTouched("tradeMode");
    setSalesNameManuallyEdited((current) => {
      if (value !== "Both") {
        return current;
      }

      const nextPurchaseName = form.purchaseName.trim() || form.salesName.trim();
      const nextSalesName = form.salesName.trim() || nextPurchaseName;
      return nextSalesName !== nextPurchaseName;
    });
  }

  function handlePurchaseNameChange(value: string) {
    if (!hasSalesSide) {
      setValue("purchaseName", value);
      markTouched("purchaseName");
      return;
    }

    setForm((current) => {
      const shouldSyncSalesName =
        !salesNameManuallyEdited ||
        !current.salesName.trim() ||
        current.salesName === current.purchaseName;
      const nextPurchaseName = value;
      const nextSalesName = nextPurchaseName.trim()
        ? shouldSyncSalesName
          ? nextPurchaseName
          : current.salesName
        : normalizedTradeMode === "Both"
          ? ""
          : current.salesName;

      return {
        ...current,
        purchaseName: nextPurchaseName,
        salesName: nextSalesName,
      };
    });
    setTouched((current) => ({
      ...current,
      purchaseName: true,
    }));

    if (!value.trim()) {
      setSalesNameManuallyEdited(false);
    }
  }

  function handleSalesNameChange(value: string) {
    setValue("salesName", value);
    markTouched("salesName");
    setSalesNameManuallyEdited(value !== form.purchaseName);
  }

  const normalizedForm = useMemo<ProductFormValues>(
    () => ({
      itemType: (itemTypeOptions.includes(form.itemType)
        ? form.itemType
        : "Inventory Item") as ProductItemTypeOption,
      tradeMode: normalizedTradeMode,
      itemCode: form.itemCode.trim(),
      itemCategoryId: selectedCategoryOption?.id ?? "",
      itemBrandId: selectedBrandOption?.id ?? "",
      itemModelId: selectedModelOption?.id ?? "",
      purchaseName: hasPurchaseSide ? form.purchaseName.trim() : "",
      costPrice: hasPurchaseSide ? form.costPrice.trim() : "",
      purchaseUomCategoryId: hasPurchaseSide ? selectedPurchaseUomCategory?.id ?? selectedSalesUomCategory?.id ?? "" : "",
      inventoryAccountId: hasPurchaseSide && !isServiceItem ? selectedInventoryAccountOption?.id ?? "" : "",
      cogsAccountId: hasPurchaseSide ? selectedCogsAccountOption?.id ?? "" : "",
      preferredSupplierIds: hasPurchaseSide ? selectedPreferredSuppliers.map((supplier) => supplier.id) : [],
      serialNumberAvailability: form.serialNumberAvailability,
      productStatus: form.productStatus,
      salesName: hasSalesSide ? form.salesName.trim() : "",
      salesPrice: hasSalesSide ? form.salesPrice.trim() : "",
      salesUomCategoryId: hasSalesSide ? selectedSalesUomCategory?.id ?? selectedPurchaseUomCategory?.id ?? "" : "",
      incomeAccountId: hasSalesSide ? selectedIncomeAccountOption?.id ?? "" : "",
    }),
    [
      form,
      hasPurchaseSide,
      hasSalesSide,
      isServiceItem,
      normalizedTradeMode,
      selectedCategoryOption,
      selectedBrandOption,
      selectedModelOption,
      selectedPurchaseUomCategory,
      selectedInventoryAccountOption,
      selectedCogsAccountOption,
      selectedPreferredSuppliers,
      selectedSalesUomCategory,
      selectedIncomeAccountOption,
    ]
  );

  const comparableInitialForm = useMemo(
    () =>
      JSON.stringify({
        itemType: initialProduct?.itemType ?? "Inventory Item",
        tradeMode: initialProduct?.tradeMode ?? "Both",
        itemCode: initialProduct?.itemCode ?? "",
        itemCategoryId: initialProduct?.itemCategoryId ?? "",
        itemBrandId: initialProduct?.itemBrandId ?? "",
        itemModelId: initialProduct?.itemModelId ?? "",
        purchaseName: initialProduct?.purchaseName ?? "",
        costPrice: initialProduct?.costPrice ?? "",
        purchaseUomCategoryId: initialProduct?.purchaseUomCategoryId ?? "",
        inventoryAccountId: initialProduct?.inventoryAccountId ?? "",
        cogsAccountId: initialProduct?.cogsAccountId ?? "",
        preferredSupplierIds: (initialProduct?.preferredSuppliers ?? []).map((supplier) => supplier.id),
        serialNumberAvailability: initialProduct?.serialNumberAvailability ?? "No",
        productStatus: initialProduct?.productStatus ?? "Active",
        salesName: initialProduct?.salesName ?? "",
        salesPrice: initialProduct?.salesPrice ?? "",
        salesUomCategoryId: initialProduct?.salesUomCategoryId ?? "",
        incomeAccountId: initialProduct?.incomeAccountId ?? "",
      } satisfies ProductFormValues),
    [initialProduct]
  );
  const comparableCurrentForm = useMemo(() => JSON.stringify(normalizedForm), [normalizedForm]);
  const isDirty = isEditMode && comparableCurrentForm !== comparableInitialForm;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function resetAsyncSelections() {
    setSelectedCategoryOption(null);
    setSelectedBrandOption(null);
    setSelectedModelOption(null);
    setSelectedInventoryAccountOption(null);
    setSelectedCogsAccountOption(null);
    setSelectedIncomeAccountOption(null);
    setSelectedPreferredSuppliers([]);
  }

  function validateAll() {
    setTouched({
      itemType: true,
      tradeMode: true,
      itemCode: true,
      purchaseName: true,
      costPrice: true,
      purchaseUom: true,
      inventoryAccount: true,
      cogsAccount: true,
      salesName: true,
      salesPrice: true,
      salesUom: true,
      incomeAccount: true,
    });

    return !Object.values(errors).some(Boolean);
  }

  const sectionClassName =
    "rounded-[26px] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7f0_100%)] p-5 shadow-[0_16px_34px_rgba(27,24,22,0.04)]";

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault();

        if (isViewMode) {
          return;
        }

        if (!validateAll()) {
          return;
        }

        const nativeEvent = event.nativeEvent as SubmitEvent;
        const submitter = nativeEvent.submitter as HTMLButtonElement | null;
        const intent = submitter?.dataset.intent ?? (isEditMode ? "update" : "create");

        try {
          if (intent === "create-and-next") {
            await onCreateAndNext?.(normalizedForm);
            setForm(createFormState(undefined, defaultUomCategory?.name));
            setTouched({});
            setSalesNameManuallyEdited(false);
            resetAsyncSelections();
            return;
          }

          if (intent === "update") {
            await onUpdate?.(normalizedForm);
            return;
          }

          await onCreate?.(normalizedForm);
        } catch {
          return;
        }
      }}
    >
      <section className={sectionClassName}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#ff7101]" />
          <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Main Item Information</h3>
        </div>
        {serverError && !isViewMode ? (
          <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {serverError}
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <FieldLabel label="Item Type" required />
            <SelectField value={form.itemType} onChange={(value) => { setValue("itemType", value); markTouched("itemType"); }} options={itemTypeOptions} placeholder="Select item type" disabled={isViewMode} />
            {touched.itemType && errors.itemType ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.itemType}</p> : null}
          </div>
          <div>
            <FieldLabel label="Item Code" required />
            <TextField value={form.itemCode} onChange={(value) => { setValue("itemCode", value.replace(/\s/g, "")); markTouched("itemCode"); }} placeholder="Enter item code" maxLength={30} disabled={isViewMode} />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={touched.itemCode && errors.itemCode ? "font-medium text-[#c14d22]" : "text-[#8b7f74]"}>
                {touched.itemCode && errors.itemCode
                  ? errors.itemCode
                  : "Codes support letters, numbers, and symbols. Final uniqueness is checked when you save."}
              </span>
              <span className="text-[#9a8f85]">{form.itemCode.length}/30</span>
            </div>
          </div>
          <div>
            <FieldLabel label="Item Category" />
            <CreatableAsyncSelectField
              value={form.itemCategory}
              selectedOption={selectedCategoryOption}
              onSelect={(option) => {
                setSelectedCategoryOption(option);
                setValue("itemCategory", option.label);
              }}
              placeholder="Select category"
              searchPlaceholder="Search categories"
              createPlaceholder="Enter category name"
              endpoint="/api/accounting/product-masters"
              masterType="category"
              emptyMessage="No categories created yet."
              emptySearchMessage="No matching categories."
              disabled={isViewMode}
            />
          </div>
          <div>
            <FieldLabel label="Item Brand" />
            <CreatableAsyncSelectField
              value={form.itemBrand}
              selectedOption={selectedBrandOption}
              onSelect={(option) => {
                setSelectedBrandOption(option);
                setValue("itemBrand", option.label);
              }}
              placeholder="Select brand"
              searchPlaceholder="Search brands"
              createPlaceholder="Enter brand name"
              endpoint="/api/accounting/product-masters"
              masterType="brand"
              emptyMessage="No brands created yet."
              emptySearchMessage="No matching brands."
              disabled={isViewMode}
            />
          </div>
          <div>
            <FieldLabel label="Item Model" />
            <CreatableAsyncSelectField
              value={form.itemModel}
              selectedOption={selectedModelOption}
              onSelect={(option) => {
                setSelectedModelOption(option);
                setValue("itemModel", option.label);
              }}
              placeholder="Select model"
              searchPlaceholder="Search models"
              createPlaceholder="Enter model name"
              endpoint="/api/accounting/product-masters"
              masterType="model"
              emptyMessage="No models created yet."
              emptySearchMessage="No matching models."
              disabled={isViewMode}
            />
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.85fr_0.9fr]">
          <div>
            <FieldLabel label="Use This Item For" required />
            <ProductTradeModeSelector value={normalizedTradeMode} onChange={handleTradeModeChange} disabled={isViewMode || isVoucherItem} />
            {isVoucherItem ? (
              <p className="mt-2 text-xs text-[#9b7a61]">
                Vouchers are sales-only — Trade Mode is locked to Sales.
              </p>
            ) : null}
            {touched.tradeMode && errors.tradeMode ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.tradeMode}</p> : null}
          </div>
          <div>
            <FieldLabel label="Serial Number Availability" required />
            <BinarySelector
              value={form.serialNumberAvailability}
              onChange={(value) => setValue("serialNumberAvailability", value)}
              disabled={isViewMode || isVoucherItem}
            />
            {isVoucherItem ? (
              <p className="mt-2 text-xs text-[#9b7a61]">
                Vouchers always carry a serial number (locked).
              </p>
            ) : null}
          </div>
          <div>
            <FieldLabel label="Product Status" required />
            <ProductStatusSelector
              value={form.productStatus}
              onChange={(value) => setValue("productStatus", value)}
              disabled={isViewMode}
            />
          </div>
        </div>
      </section>

      <div className={`grid gap-5 ${hasPurchaseSide && hasSalesSide ? "xl:grid-cols-2" : ""}`}>
        {hasPurchaseSide ? (
        <section className={sectionClassName}>
          <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Purchase Information</h3>
          <p className="mt-1 text-sm text-[#7b7068]">Purchase-side naming, cost, supplier preference, and accounting setup.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel label="Item Name / Description (Purchase)" required />
              <TextField
                value={form.purchaseName}
                onChange={handlePurchaseNameChange}
                placeholder="Enter purchase-side item name"
                maxLength={200}
                disabled={isViewMode}
              />
              {touched.purchaseName && errors.purchaseName ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.purchaseName}</p> : null}
            </div>
            <div>
              <FieldLabel
                label={buildPerUnitLabel("Cost Price", selectedPurchaseUomCategory?.baseUnit ?? defaultUomCategory?.baseUnit)}
                required
              />
              <PriceField value={form.costPrice} onChange={(value) => { setValue("costPrice", value); markTouched("costPrice"); }} placeholder="0.00" disabled={isViewMode} />
              {touched.costPrice && errors.costPrice ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.costPrice}</p> : null}
            </div>
            <div>
              <FieldLabel label="UOM (Purchase)" required />
              <SelectField
                value={form.purchaseUom}
                onChange={handleSharedUomChange}
                options={uomOptionLabels}
                placeholder={uomLoading ? "Loading UOM categories..." : "Select purchase UOM"}
                disabled={isViewMode || uomLoading || !uomOptionLabels.length}
              />
              {touched.purchaseUom && errors.purchaseUom ? (
                <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.purchaseUom}</p>
              ) : selectedPurchaseUomCategory ? (
                <p className="mt-2 text-xs text-[#8b7f74]">
                  Base unit: {selectedPurchaseUomCategory.baseUnit}. This same UOM is reused across the product setup.
                </p>
              ) : null}
              {uomError ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{uomError}</p> : null}
            </div>
            {isServiceItem ? null : (
              <div>
                <FieldLabel label="Inventory Account" required />
                <AsyncSelectField
                  value={form.inventoryAccount}
                  selectedOption={selectedInventoryAccountOption}
                  onSelect={(option) => {
                    setSelectedInventoryAccountOption(option);
                    setValue("inventoryAccount", option.label);
                    markTouched("inventoryAccount");
                  }}
                  placeholder="Select inventory account"
                  searchPlaceholder="Search current asset accounts"
                  endpoint="/api/accounting/accounts/options"
                  baseParams={{ category: "ASSET", type: "CURRENT_ASSET" }}
                  emptyMessage="No current asset accounts available."
                  emptySearchMessage="No matching current asset accounts."
                  disabled={isViewMode}
                />
                {touched.inventoryAccount && errors.inventoryAccount ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.inventoryAccount}</p> : null}
              </div>
            )}
            <div>
              <FieldLabel label="COGS Account" required />
              <AsyncSelectField
                value={form.cogsAccount}
                selectedOption={selectedCogsAccountOption}
                onSelect={(option) => {
                  setSelectedCogsAccountOption(option);
                  setValue("cogsAccount", option.label);
                  markTouched("cogsAccount");
                }}
                placeholder="Select COGS account"
                searchPlaceholder="Search expense accounts"
                endpoint="/api/accounting/accounts/options"
                baseParams={{ category: "EXPENSES" }}
                emptyMessage="No expense accounts available."
                emptySearchMessage="No matching expense accounts."
                disabled={isViewMode}
              />
              {touched.cogsAccount && errors.cogsAccount ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.cogsAccount}</p> : null}
            </div>
            <div className="md:col-span-2">
              <FieldLabel label="Preferred Supplier" />
              <SupplierSelector
                value={selectedPreferredSuppliers}
                disabled={isViewMode}
                onAdd={(supplier) => {
                  setSelectedPreferredSuppliers((current) => [...current, supplier]);
                  setValue("preferredSuppliers", [...form.preferredSuppliers, supplier.label]);
                }}
                onRemove={(supplierId) => {
                  const nextSuppliers = selectedPreferredSuppliers.filter((supplier) => supplier.id !== supplierId);
                  setSelectedPreferredSuppliers(nextSuppliers);
                  setValue("preferredSuppliers", nextSuppliers.map((supplier) => supplier.label));
                }}
              />
            </div>
          </div>
        </section>
        ) : null}

        {hasSalesSide ? (
        <section className={sectionClassName}>
          <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Sales Information</h3>
          <p className="mt-1 text-sm text-[#7b7068]">Sales description, sell price, and revenue-side account mapping.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel label="Item Name / Description (Sales)" required />
              <TextField
                value={form.salesName}
                onChange={handleSalesNameChange}
                placeholder={salesNameLocked ? "Enter purchase item name first" : "Enter sales-side item name"}
                disabled={salesNameDisabled}
                maxLength={200}
              />
              {touched.salesName && errors.salesName ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.salesName}</p> : null}
            </div>
            <div>
              <FieldLabel
                label={buildPerUnitLabel("Sales Price", selectedSalesUomCategory?.baseUnit ?? defaultUomCategory?.baseUnit)}
                required
              />
              <PriceField value={form.salesPrice} onChange={(value) => { setValue("salesPrice", value); markTouched("salesPrice"); }} placeholder="0.00" disabled={isViewMode} />
              {touched.salesPrice && errors.salesPrice ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.salesPrice}</p> : null}
            </div>
            <div>
              <FieldLabel label="UOM (Sales)" required />
              <SelectField
                value={form.salesUom}
                onChange={handleSharedUomChange}
                options={uomOptionLabels}
                placeholder={uomLoading ? "Loading UOM categories..." : "Select sales UOM"}
                disabled={isViewMode || (hasPurchaseSide && hasSalesSide) || uomLoading || !uomOptionLabels.length}
              />
              {touched.salesUom && errors.salesUom ? (
                <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.salesUom}</p>
              ) : selectedSalesUomCategory ? (
                <p className="mt-2 text-xs text-[#8b7f74]">
                  Base unit: {selectedSalesUomCategory.baseUnit}. {hasPurchaseSide && hasSalesSide ? "Sales UOM follows the shared product UOM above." : "This UOM becomes the shared product UOM."}
                </p>
              ) : null}
              {uomError ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{uomError}</p> : null}
            </div>
            <div className="md:col-span-2">
              <FieldLabel
                label={isVoucherItem ? "Gift Voucher Liability Account" : "Income Account"}
                required
              />
              <AsyncSelectField
                value={form.incomeAccount}
                selectedOption={selectedIncomeAccountOption}
                onSelect={(option) => {
                  setSelectedIncomeAccountOption(option);
                  setValue("incomeAccount", option.label);
                  markTouched("incomeAccount");
                }}
                placeholder={
                  isVoucherItem
                    ? "Select gift voucher liability account"
                    : "Select income account"
                }
                searchPlaceholder={
                  isVoucherItem ? "Search liability accounts" : "Search income accounts"
                }
                endpoint="/api/accounting/accounts/options"
                // Voucher products store a CURRENT_LIABILITY account in the
                // incomeAccountId column per accounting-theories.md § 7.3.
                // Selling a voucher credits this liability (deferred revenue),
                // not income — income is recognised at redemption (next phase).
                baseParams={
                  isVoucherItem
                    ? { category: "LIABILITIES", type: "CURRENT_LIABILITIES" }
                    : { category: "INCOME" }
                }
                emptyMessage={
                  isVoucherItem
                    ? "No current-liability accounts available."
                    : "No income accounts available."
                }
                emptySearchMessage={
                  isVoucherItem
                    ? "No matching liability accounts."
                    : "No matching income accounts."
                }
                disabled={isViewMode}
              />
              {touched.incomeAccount && errors.incomeAccount ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.incomeAccount}</p> : null}
              {isVoucherItem ? (
                <p className="mt-2 text-xs text-[#a09388]">
                  Voucher sales credit a deferred-revenue liability — pick a
                  current-liability account such as Gift Voucher Liability.
                  Income is recognised when the voucher is later redeemed.
                </p>
              ) : null}
            </div>
          </div>
        </section>
        ) : null}
      </div>

      <SurfaceCard>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] border border-[#f1dfd1] bg-[linear-gradient(135deg,#fff7ef_0%,#fffdf9_100%)] p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-[18px] bg-[#fff1e4] p-3 text-[#ff7101]">
                <Package2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Product Master</p>
                <p className="mt-2 text-sm leading-6 text-[#756b64]">
                  {isViewMode
                    ? "Review the saved product identity, usage mode, and whichever purchase or sales setup applies."
                    : isEditMode
                      ? "Review and update the saved product identity, then adjust the active purchase-side and sales-side details as needed."
                      : "Capture the core item identity first, choose whether the product is for buying, selling, or both, then complete the active section below."}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 rounded-[24px] border border-[#eadfd5] bg-white p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Form Rules</p>
              <p className="mt-2 text-sm leading-6 text-[#756b64]">
                {isViewMode
                  ? "This product is currently in view mode. Use Back to return to the register."
                  : isEditMode
                    ? isDirty
                      ? "Changes detected. The product is ready for update."
                      : "Make a change to any product field to enable the update action."
                    : "Item code must be unique, cannot contain spaces, and supports up to 30 characters. Trade mode defaults to Both and controls which detail section is required."}
              </p>
            </div>
            <div className="rounded-[18px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-3">
              <p className="text-sm font-semibold text-[#1f1d1c]">Default Setup</p>
              <p className="mt-1 text-sm text-[#7a7068]">New products start in Both mode with serial tracking set to No.</p>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}
