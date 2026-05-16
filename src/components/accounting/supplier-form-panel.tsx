"use client";

import { Building2, Check, ChevronDown, Loader2, MapPin, Phone, Plus, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import countryCodes from "@/lib/accounting/data/country-codes.json";
import currencies from "@/lib/accounting/data/currencies.json";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type { ApiResponse } from "@/lib/api/response";
import {
  formatDialCode,
  formatPhoneNumberDisplay,
  getLocalPhoneMaxLength,
  sanitizePhoneLocalPart,
  validateAndNormalizePhone,
} from "@/lib/accounting/supplier-phone";
import {
  buildSupplierAddressSummary,
  SUPPLIER_DEFAULT_COUNTRY_CODE,
  SUPPLIER_DEFAULT_CURRENCY,
  SUPPLIER_DEFAULT_DIAL_CODE,
  SUPPLIER_TAX_CODE_OPTIONS_PAGE_SIZE,
  type SupplierBankAccount,
  type SupplierFormValues,
  type SupplierSalesContact,
  type SupplierTaxCodeOption,
  type SupplierTaxCodeOptionsPayload,
} from "@/lib/accounting/supplier-types";

type SelectOption = {
  value: string;
  label: string;
};

type CurrencyRecord = {
  code: string;
  name: string;
};

type CountryCodeRecord = {
  name: string;
  dial_code: string;
  code: string;
};

export type SupplierFormState = SupplierFormValues;

type TabId = "contact" | "sales" | "accounting" | "notes";

const initialState: SupplierFormState = {
  supplierCode: "",
  supplierName: "",
  primaryMobileCountryCode: SUPPLIER_DEFAULT_COUNTRY_CODE,
  primaryMobile: "",
  email: "",
  address: "",
  alternateMobileCountryCode: SUPPLIER_DEFAULT_COUNTRY_CODE,
  alternateMobile: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  country: "",
  postalCode: "",
  currency: SUPPLIER_DEFAULT_CURRENCY,
  tinNumber: "",
  taxCodes: [],
  salesContacts: [],
  bankAccounts: [],
  internalNotes: "",
};

const initialBankDraft: SupplierBankAccount = {
  accountNumber: "",
  bankName: "",
  branchName: "",
};

const initialSalesDraft: SupplierSalesContact = {
  name: "",
  email: "",
  designation: "",
  mobileCountryCode: SUPPLIER_DEFAULT_COUNTRY_CODE,
  mobile: "",
};

const tabs: Array<{ id: TabId; label: string; note: string }> = [
  {
    id: "contact",
    label: "Contact Info",
    note: "Address and backup contact",
  },
  {
    id: "sales",
    label: "Sales",
    note: "Sales contacts and tax setup",
  },
  {
    id: "accounting",
    label: "Accounting",
    note: "Bank accounts and settlements",
  },
  {
    id: "notes",
    label: "Internal Notes",
    note: "Internal-only notes",
  },
];

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

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-[#3f3a36]">
      {label}
      {required ? <span className="ml-1 text-[#ff7101]">*</span> : null}
    </label>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  inputMode,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal" | "search" | "url";
  type?: "text" | "email";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      inputMode={inputMode}
      className="w-full rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

function PhoneField({
  countryCode,
  onCountryCodeChange,
  countryOptions,
  selectedCountryLabel,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  countryCode: string;
  onCountryCodeChange: (value: string) => void;
  countryOptions: SelectOption[];
  selectedCountryLabel?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
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
  const selectedOption = countryOptions.find((option) => option.value === countryCode);

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
        width: Math.max(rect.width, 260),
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
    <div
      ref={rootRef}
      className="flex overflow-hidden rounded-2xl border border-[#e2d8cf] bg-white transition focus-within:border-[#ffba82] focus-within:ring-4 focus-within:ring-[#ffe7d4]"
    >
      <div className="relative w-[112px] shrink-0 border-r border-[#eaded4] bg-[#fff6ee]">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-full w-full items-center justify-between bg-transparent px-4 pr-10 text-sm font-semibold text-[#b45b12] outline-none"
          title={selectedOption?.label || selectedCountryLabel}
        >
          <span className="truncate">{selectedCountryLabel || selectedOption?.label || ""}</span>
        </button>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b45b12]" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode="numeric"
        className="min-w-0 flex-1 bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c]"
      />

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{ left: panelStyle.left, top: panelStyle.top, width: panelStyle.width }}
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {countryOptions.map((option) => {
                  const isSelected = option.value === countryCode;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onCountryCodeChange(option.value);
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

function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full resize-none rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
    />
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
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
        <span className={selectedOption ? "text-[#1f1d1c]" : "text-[#a2978c]"}>
          {selectedOption?.label || placeholder}
        </span>
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

function TaxCodeChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#ffd9bb] bg-white px-3 py-2 text-sm font-medium text-[#5b514a] shadow-[0_8px_18px_rgba(255,122,18,0.08)]">
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full bg-[#fff1e2] p-1 text-[#b45b12] transition hover:bg-[#ffe3cf]"
          aria-label={`Remove tax code ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function TaxCodeChipList({
  options,
  emptyMessage,
  onRemove,
}: {
  options: SupplierTaxCodeOption[];
  emptyMessage: string;
  onRemove?: (optionId: string) => void;
}) {
  return (
    <div className="flex min-h-[64px] flex-wrap gap-2 rounded-[22px] border border-dashed border-[#e5d7cb] bg-[#fffaf4] p-3">
      {options.length ? (
        options.map((option) => (
          <TaxCodeChip
            key={option.id}
            label={option.label}
            onRemove={onRemove ? () => onRemove(option.id) : undefined}
          />
        ))
      ) : (
        <p className="self-center text-sm text-[#8b7f74]">{emptyMessage}</p>
      )}
    </div>
  );
}

function AsyncTaxCodeSelect({
  selectedOptions,
  onAddOption,
  placeholder,
  searchPlaceholder,
}: {
  selectedOptions: SupplierTaxCodeOption[];
  onAddOption: (option: SupplierTaxCodeOption) => void;
  placeholder: string;
  searchPlaceholder: string;
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
  const [options, setOptions] = useState<SupplierTaxCodeOption[]>([]);
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
  const selectedIds = useMemo(() => new Set(selectedOptions.map((option) => option.id)), [selectedOptions]);
  const selectedLabel = selectedOptions.length
    ? `${selectedOptions.length} tax code${selectedOptions.length === 1 ? "" : "s"} selected`
    : placeholder;

  const loadOptions = useCallback(
    async ({ append, cursor, queryKey }: { append: boolean; cursor: string | null; queryKey: string }) => {
      const params = new URLSearchParams({
        limit: String(SUPPLIER_TAX_CODE_OPTIONS_PAGE_SIZE),
      });

      if (debouncedSearchTerm) {
        params.set("q", debouncedSearchTerm);
      }

      if (cursor) {
        params.set("cursor", cursor);
      }

      const payload = await requestJson<SupplierTaxCodeOptionsPayload>(
        `/api/accounting/tax-codes/options?${params.toString()}`
      );

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
    [debouncedSearchTerm]
  );

  const loadFirstPage = useCallback(async () => {
    const queryKey = `tax-codes:${debouncedSearchTerm}`;
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
        setErrorMessage(error instanceof Error ? error.message : "Unable to load tax codes.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoading(false);
      }
    }
  }, [debouncedSearchTerm, loadOptions]);

  const loadMore = useCallback(async () => {
    if (!open || loading || loadingMore || !hasMore || !nextCursor) {
      return;
    }

    const queryKey = `tax-codes:${debouncedSearchTerm}`;
    setLoadingMore(true);
    setErrorMessage(null);

    try {
      await loadOptions({ append: true, cursor: nextCursor, queryKey });
    } catch (error) {
      if (activeQueryKeyRef.current === queryKey) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load more tax codes.");
      }
    } finally {
      if (activeQueryKeyRef.current === queryKey) {
        setLoadingMore(false);
      }
    }
  }, [debouncedSearchTerm, hasMore, loadOptions, loading, loadingMore, nextCursor, open]);

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
    if (!open) {
      return;
    }

    void loadFirstPage();
  }, [debouncedSearchTerm, loadFirstPage, open]);

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
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          open
            ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
            : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
      >
        <span className={selectedOptions.length ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`} />
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
                    Loading tax codes...
                  </div>
                ) : options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = selectedIds.has(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          if (!isSelected) {
                            onAddOption(option);
                          }
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                          isSelected
                            ? "bg-[#fff7f0] text-[#9a7e63]"
                            : "text-[#2d2926] hover:bg-[#fff7f0]"
                        }`}
                      >
                        <span>{option.label}</span>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1e2] px-2 py-1 text-[11px] font-semibold text-[#b45b12]">
                            <Check className="h-3 w-3" />
                            Added
                          </span>
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1e2] text-[#ff7101]">
                            <Plus className="h-4 w-4" />
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-[#8a7e74]">
                    {debouncedSearchTerm ? "No matching tax codes." : "No active tax codes available."}
                  </div>
                )}

                {errorMessage ? (
                  <div className="mx-1 mt-2 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-3 text-sm text-[#b94f37]">
                    <p>{errorMessage}</p>
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildAddressSummary(form: Pick<
  SupplierFormState,
  "addressLine1" | "addressLine2" | "city" | "country" | "postalCode" | "address"
>) {
  return buildSupplierAddressSummary(form);
}

function createFormState(initialValues?: SupplierFormState): SupplierFormState {
  if (!initialValues) {
    return {
      ...initialState,
      salesContacts: [],
      bankAccounts: [],
    };
  }

  return {
    ...initialState,
    ...initialValues,
    salesContacts: initialValues.salesContacts.map((contact) => ({ ...contact })),
    bankAccounts: initialValues.bankAccounts.map((account) => ({ ...account })),
  };
}

function createInitialSelectedTaxCodeOptions(initialTaxCodeOptions?: SupplierTaxCodeOption[]) {
  return initialTaxCodeOptions?.map((option) => ({ ...option })) ?? [];
}

function buildComparableForm(
  form: SupplierFormState,
  dialCodeByCountryCode: Map<string, string>
) {
  const primaryCountryCode = form.primaryMobileCountryCode.trim().toUpperCase() || SUPPLIER_DEFAULT_COUNTRY_CODE;
  const alternateCountryCode =
    form.alternateMobileCountryCode.trim().toUpperCase() || SUPPLIER_DEFAULT_COUNTRY_CODE;
  const primaryDialCode = dialCodeByCountryCode.get(primaryCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
  const alternateDialCode = dialCodeByCountryCode.get(alternateCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
  const addressLine1 = form.addressLine1.trim();
  const addressLine2 = form.addressLine2.trim();
  const city = form.city.trim();
  const country = form.country.trim();
  const postalCode = form.postalCode.trim();

  return {
    supplierCode: form.supplierCode.trim().toUpperCase(),
    supplierName: form.supplierName.trim(),
    primaryMobileCountryCode: primaryCountryCode,
    primaryMobile: sanitizePhoneLocalPart(form.primaryMobile, primaryDialCode, primaryCountryCode),
    email: form.email.trim().toLowerCase(),
    address: buildSupplierAddressSummary({
      address: form.address.trim(),
      addressLine1,
      addressLine2,
      city,
      country,
      postalCode,
    }),
    alternateMobileCountryCode: alternateCountryCode,
    alternateMobile: sanitizePhoneLocalPart(form.alternateMobile, alternateDialCode, alternateCountryCode),
    addressLine1,
    addressLine2,
    city,
    country,
    postalCode,
    currency: form.currency.trim().toUpperCase() || SUPPLIER_DEFAULT_CURRENCY,
    tinNumber: form.tinNumber.trim().toUpperCase(),
    taxCodes: form.taxCodes.map((taxCodeId) => taxCodeId.trim()).filter(Boolean),
    salesContacts: form.salesContacts.map((contact) => {
      const contactCountryCode = contact.mobileCountryCode.trim().toUpperCase() || SUPPLIER_DEFAULT_COUNTRY_CODE;
      const contactDialCode = dialCodeByCountryCode.get(contactCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;

      return {
        name: contact.name.trim(),
        email: contact.email.trim().toLowerCase(),
        designation: contact.designation.trim(),
        mobileCountryCode: contactCountryCode,
        mobile: sanitizePhoneLocalPart(contact.mobile, contactDialCode, contactCountryCode),
      };
    }),
    bankAccounts: form.bankAccounts.map((account) => ({
      accountNumber: account.accountNumber.trim(),
      bankName: account.bankName.trim(),
      branchName: account.branchName.trim(),
    })),
    internalNotes: form.internalNotes.trim(),
  };
}

export type SupplierFormPanelMode = "create" | "edit" | "view";

export function SupplierFormPanel({
  mode = "create",
  formId = "supplier-create-form",
  existingCodes = [],
  initialValues,
  initialTaxCodeOptions = [],
  onCreate,
  onCreateAndNext,
  onUpdate,
  onDirtyChange,
  serverError,
}: {
  mode?: SupplierFormPanelMode;
  formId?: string;
  existingCodes?: string[];
  initialValues?: SupplierFormState;
  initialTaxCodeOptions?: SupplierTaxCodeOption[];
  onCreate?: (form: SupplierFormState) => Promise<void> | void;
  onCreateAndNext?: (form: SupplierFormState) => Promise<void> | void;
  onUpdate?: (form: SupplierFormState) => Promise<void> | void;
  onDirtyChange?: (value: boolean) => void;
  serverError?: string | null;
}) {
  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const [form, setForm] = useState<SupplierFormState>(() => createFormState(initialValues));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabId>("contact");
  const [bankDraft, setBankDraft] = useState<SupplierBankAccount>(initialBankDraft);
  const [salesDraft, setSalesDraft] = useState<SupplierSalesContact>(initialSalesDraft);
  const [selectedTaxCodeOptions, setSelectedTaxCodeOptions] = useState<SupplierTaxCodeOption[]>(
    createInitialSelectedTaxCodeOptions(initialTaxCodeOptions)
  );

  const countryCodeOptions = useMemo<SelectOption[]>(() => {
    return [...(countryCodes as CountryCodeRecord[])]
      .map((country) => ({
        value: country.code,
        label: `${formatDialCode(country.dial_code)} - ${country.name}`,
      }))
      .sort((left, right) => {
        if (left.value === SUPPLIER_DEFAULT_COUNTRY_CODE) {
          return -1;
        }

        if (right.value === SUPPLIER_DEFAULT_COUNTRY_CODE) {
          return 1;
        }

        return left.label.localeCompare(right.label);
      });
  }, []);

  const dialCodeByCountryCode = useMemo(() => {
    return new Map(
      (countryCodes as CountryCodeRecord[]).map((country) => [
        country.code,
        country.dial_code.replace(/[^0-9]/g, ""),
      ])
    );
  }, []);

  const currencyOptions = useMemo<SelectOption[]>(() => {
    return Object.values(currencies as Record<string, CurrencyRecord>)
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((currency) => ({
        value: currency.code,
        label: `${currency.code} - ${currency.name}`,
      }));
  }, []);

  const errors = useMemo(() => {
    const normalizedCode = form.supplierCode.trim().toUpperCase();
    const initialNormalizedCode = initialValues?.supplierCode.trim().toUpperCase() || "";
    const hasCodeConflict =
      normalizedCode !== initialNormalizedCode &&
      existingCodes.some((code) => code.toUpperCase() === normalizedCode);
    const primaryDialCode = dialCodeByCountryCode.get(form.primaryMobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
    const primaryPhone = validateAndNormalizePhone({
      countryCode: form.primaryMobileCountryCode,
      dialCode: primaryDialCode,
      localNumber: form.primaryMobile,
      requiredMessage: "Enter the supplier phone number.",
      invalidMessage:
        form.primaryMobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE
          ? "Enter a valid Sri Lankan supplier phone number."
          : "Enter a valid supplier phone number for the selected country.",
    });

    return {
      supplierCode: !form.supplierCode.trim()
        ? "Enter a supplier code."
        : /\s/.test(form.supplierCode)
          ? "Spaces are not allowed in the supplier code."
          : form.supplierCode.length > 30
            ? "Supplier code must be 30 characters or less."
            : hasCodeConflict
              ? "This supplier code already exists."
              : "",
      supplierName: !form.supplierName.trim()
        ? "Enter the supplier name."
        : form.supplierName.length > 120
          ? "Supplier name must be 120 characters or less."
          : "",
      primaryMobile: primaryPhone.error,
      email: !form.email.trim()
        ? "Enter the supplier email address."
        : form.email.length > 120
          ? "Supplier email must be 120 characters or less."
        : !isValidEmail(form.email.trim())
          ? "Enter a valid email address."
          : "",
    };
  }, [
    dialCodeByCountryCode,
    existingCodes,
    form.email,
    form.primaryMobile,
    form.primaryMobileCountryCode,
    form.supplierCode,
    form.supplierName,
    initialValues?.supplierCode,
  ]);

  const hasErrors = Object.values(errors).some(Boolean);
  const bankDraftReady =
    Boolean(bankDraft.accountNumber.trim()) &&
    Boolean(bankDraft.bankName.trim()) &&
    Boolean(bankDraft.branchName.trim());
  const formattedAddress = buildAddressSummary(form);
  const primaryDialCode = dialCodeByCountryCode.get(form.primaryMobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
  const alternateDialCode =
    dialCodeByCountryCode.get(form.alternateMobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
  const salesDraftDialCode = dialCodeByCountryCode.get(salesDraft.mobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;
  const salesDraftPhone = validateAndNormalizePhone({
    countryCode: salesDraft.mobileCountryCode,
    dialCode: salesDraftDialCode,
    localNumber: salesDraft.mobile,
    requiredMessage: "Enter the salesperson phone number.",
  });
  const salesDraftReady =
    Boolean(salesDraft.name.trim()) &&
    Boolean(salesDraft.designation.trim()) &&
    Boolean(salesDraft.email.trim()) &&
    isValidEmail(salesDraft.email.trim()) &&
    Boolean(salesDraftPhone.value);
  const latestSalesContact = form.salesContacts[form.salesContacts.length - 1] || null;
  const selectedCurrencyLabel =
    currencyOptions.find((option) => option.value === form.currency)?.label || "Currency not selected yet.";
  const selectedTaxCodeCount = form.taxCodes.length;
  const selectedTaxCodeLabel = selectedTaxCodeCount
    ? `${selectedTaxCodeCount} tax code${selectedTaxCodeCount === 1 ? "" : "s"} selected`
    : "Tax code not selected yet.";
  const comparableInitialForm = useMemo(
    () => JSON.stringify(buildComparableForm(createFormState(initialValues), dialCodeByCountryCode)),
    [dialCodeByCountryCode, initialValues]
  );
  const comparableCurrentForm = useMemo(
    () => JSON.stringify(buildComparableForm(form, dialCodeByCountryCode)),
    [dialCodeByCountryCode, form]
  );
  const isDirty = isEditMode && comparableCurrentForm !== comparableInitialForm;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function setValue<Key extends keyof SupplierFormState>(key: Key, value: SupplierFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function markTouched(name: string) {
    setTouched((current) => ({ ...current, [name]: true }));
  }

  function updateBankDraft<Key extends keyof SupplierBankAccount>(
    key: Key,
    value: SupplierBankAccount[Key]
  ) {
    setBankDraft((current) => ({ ...current, [key]: value }));
  }

  function updateSalesDraft<Key extends keyof SupplierSalesContact>(
    key: Key,
    value: SupplierSalesContact[Key]
  ) {
    setSalesDraft((current) => ({ ...current, [key]: value }));
  }

  function addBankAccount() {
    if (!bankDraftReady) {
      return;
    }

    setForm((current) => ({
      ...current,
      bankAccounts: [
        ...current.bankAccounts,
        {
          accountNumber: bankDraft.accountNumber.trim(),
          bankName: bankDraft.bankName.trim(),
          branchName: bankDraft.branchName.trim(),
        },
      ],
    }));
    setBankDraft(initialBankDraft);
  }

  function removeBankAccount(index: number) {
    setForm((current) => ({
      ...current,
      bankAccounts: current.bankAccounts.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addSalesContact() {
    if (!salesDraftReady || !salesDraftPhone.value) {
      return;
    }

    const normalizedSalesPhone = salesDraftPhone.value;

    setForm((current) => ({
      ...current,
      salesContacts: [
        ...current.salesContacts,
        {
          name: salesDraft.name.trim(),
          email: salesDraft.email.trim().toLowerCase(),
          designation: salesDraft.designation.trim(),
          mobileCountryCode: normalizedSalesPhone.countryCode,
          mobile: normalizedSalesPhone.localNumber,
        },
      ],
    }));
    setSalesDraft(initialSalesDraft);
  }

  function removeSalesContact(index: number) {
    setForm((current) => ({
      ...current,
      salesContacts: current.salesContacts.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addSelectedTaxCode(option: SupplierTaxCodeOption) {
    if (selectedTaxCodeOptions.some((selectedOption) => selectedOption.id === option.id)) {
      return;
    }

    const nextOptions = [...selectedTaxCodeOptions, option];
    setSelectedTaxCodeOptions(nextOptions);
    setValue(
      "taxCodes",
      nextOptions.map((selectedOption) => selectedOption.id)
    );
  }

  function removeSelectedTaxCode(optionId: string) {
    const nextOptions = selectedTaxCodeOptions.filter((option) => option.id !== optionId);
    setSelectedTaxCodeOptions(nextOptions);
    setValue(
      "taxCodes",
      nextOptions.map((option) => option.id)
    );
  }

  function normalizeForm() {
    const normalizedPrimaryPhone = validateAndNormalizePhone({
      countryCode: form.primaryMobileCountryCode,
      dialCode: primaryDialCode,
      localNumber: form.primaryMobile,
      requiredMessage: "Enter the supplier phone number.",
    });
    const normalizedAlternatePhone = validateAndNormalizePhone({
      countryCode: form.alternateMobileCountryCode,
      dialCode: alternateDialCode,
      localNumber: form.alternateMobile,
      requiredMessage: "Enter the alternate phone number.",
      allowEmpty: true,
    });

    return {
      ...form,
      supplierCode: form.supplierCode.trim().toUpperCase(),
      supplierName: form.supplierName.trim(),
      primaryMobileCountryCode: normalizedPrimaryPhone.value?.countryCode || form.primaryMobileCountryCode,
      primaryMobile: normalizedPrimaryPhone.value?.localNumber || "",
      email: form.email.trim().toLowerCase(),
      address: formattedAddress,
      alternateMobileCountryCode: normalizedAlternatePhone.value?.countryCode || form.alternateMobileCountryCode,
      alternateMobile: normalizedAlternatePhone.value?.localNumber || "",
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      postalCode: form.postalCode.trim(),
      currency: form.currency || SUPPLIER_DEFAULT_CURRENCY,
      tinNumber: form.tinNumber.trim().toUpperCase(),
      taxCodes: form.taxCodes.map((taxCodeId) => taxCodeId.trim()).filter(Boolean),
      salesContacts: form.salesContacts.map((contact) => ({
        name: contact.name.trim(),
        email: contact.email.trim().toLowerCase(),
        designation: contact.designation.trim(),
        mobileCountryCode: contact.mobileCountryCode,
        mobile:
          validateAndNormalizePhone({
            countryCode: contact.mobileCountryCode,
            dialCode: dialCodeByCountryCode.get(contact.mobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE,
            localNumber: contact.mobile,
            requiredMessage: "Enter the salesperson phone number.",
          }).value?.localNumber || "",
      })),
      bankAccounts: form.bankAccounts.map((account) => ({
        accountNumber: account.accountNumber.trim(),
        bankName: account.bankName.trim(),
        branchName: account.branchName.trim(),
      })),
      internalNotes: form.internalNotes.trim(),
    };
  }

  function validateAll() {
    setTouched({
      supplierCode: true,
      supplierName: true,
      primaryMobile: true,
      email: true,
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
            await onCreateAndNext?.(normalizeForm());
            setForm(createFormState());
            setTouched({});
            setActiveTab("contact");
            setBankDraft(initialBankDraft);
            setSalesDraft(initialSalesDraft);
            setSelectedTaxCodeOptions([]);
            return;
          }

          if (intent === "update") {
            await onUpdate?.(normalizeForm());
            return;
          }

          await onCreate?.(normalizeForm());
        } catch {
          return;
        }
      }}
    >
      <section className={sectionClassName}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#ff7101]" />
          <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Main Supplier Information</h3>
        </div>
        <p className="mt-1 text-sm text-[#7b7068]">
          {isViewMode
            ? "Review the saved supplier identity and move through the tabs to inspect contact, sales, accounting, and note details."
            : "These four fields are required. The tabbed sections below are optional and help organize the rest of the supplier profile."}
        </p>
        {serverError ? (
          <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {serverError}
          </div>
        ) : null}
        <fieldset disabled={isViewMode} className="mt-5 grid min-w-0 gap-4 border-0 p-0 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <FieldLabel label="Supplier Code" required />
            <TextField
              value={form.supplierCode}
              onChange={(value) => {
                setValue("supplierCode", value.replace(/\s/g, ""));
                markTouched("supplierCode");
              }}
              placeholder="Enter supplier code"
              maxLength={30}
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={touched.supplierCode && errors.supplierCode ? "font-medium text-[#c14d22]" : "text-[#8b7f74]"}>
                {touched.supplierCode && errors.supplierCode
                  ? errors.supplierCode
                  : "Supplier codes must remain unique across the supplier register."}
              </span>
              <span className="text-[#9a8f85]">{form.supplierCode.length}/30</span>
            </div>
          </div>
          <div>
            <FieldLabel label="Supplier Name" required />
            <TextField
              value={form.supplierName}
              onChange={(value) => {
                setValue("supplierName", value);
                markTouched("supplierName");
              }}
              placeholder="Enter supplier name"
              maxLength={120}
            />
            {touched.supplierName && errors.supplierName ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.supplierName}</p> : null}
          </div>
          <div>
            <FieldLabel label="Supplier Mobile Number" required />
            <PhoneField
              countryCode={form.primaryMobileCountryCode}
              onCountryCodeChange={(value) => {
                const nextDialCode = dialCodeByCountryCode.get(value) || SUPPLIER_DEFAULT_DIAL_CODE;

                setValue("primaryMobileCountryCode", value);
                setValue(
                  "primaryMobile",
                  sanitizePhoneLocalPart(form.primaryMobile, nextDialCode, value)
                );
                markTouched("primaryMobile");
              }}
              countryOptions={countryCodeOptions}
              selectedCountryLabel={formatDialCode(primaryDialCode)}
              value={form.primaryMobile}
              onChange={(value) => {
                setValue(
                  "primaryMobile",
                  sanitizePhoneLocalPart(value, primaryDialCode, form.primaryMobileCountryCode)
                );
                markTouched("primaryMobile");
              }}
              placeholder={form.primaryMobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE ? "771234567" : "Enter phone number"}
              maxLength={getLocalPhoneMaxLength(primaryDialCode, form.primaryMobileCountryCode)}
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={touched.primaryMobile && errors.primaryMobile ? "font-medium text-[#c14d22]" : "text-[#8b7f74]"}>
                {touched.primaryMobile && errors.primaryMobile
                  ? errors.primaryMobile
                  : form.primaryMobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE
                    ? "Default dial code is +94. Enter the remaining 9 digits only."
                    : "Choose a dial code and enter the remaining phone number."}
              </span>
              <span className="text-[#9a8f85]">
                {form.primaryMobile.length}/{getLocalPhoneMaxLength(primaryDialCode, form.primaryMobileCountryCode)}
              </span>
            </div>
          </div>
          <div>
            <FieldLabel label="Supplier Email Address" required />
            <TextField
              value={form.email}
              onChange={(value) => {
                setValue("email", value);
                markTouched("email");
              }}
              placeholder="Enter supplier email"
              maxLength={120}
              type="email"
            />
            {touched.email && errors.email ? <p className="mt-2 text-xs font-medium text-[#c14d22]">{errors.email}</p> : null}
          </div>
        </fieldset>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className={sectionClassName}>
          <div className="rounded-[24px] border border-[#eadfd5] bg-[linear-gradient(135deg,#fffdfa_0%,#fff7ef_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative overflow-hidden rounded-[20px] border px-4 py-3.5 text-left transition ${
                    isActive
                      ? "border-[#ffcfaa] bg-[linear-gradient(135deg,#fff1e2_0%,#fff9f2_100%)] text-[#b45b12] shadow-[0_14px_28px_rgba(255,122,18,0.12)]"
                      : "border-[#e5ddd4] bg-white/92 text-[#5f5750] hover:-translate-y-0.5 hover:border-[#ffcfaa] hover:bg-[#fffaf5] hover:shadow-[0_12px_22px_rgba(31,29,28,0.06)]"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                      isActive ? "bg-[linear-gradient(90deg,#ff8a1d_0%,#ffc48b_100%)]" : "bg-transparent"
                    }`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          isActive
                            ? "bg-white/80 text-[#ff7101]"
                            : "bg-[#f6f0e9] text-[#9a8c80] group-hover:bg-[#fff2e4] group-hover:text-[#cc6a18]"
                        }`}
                      >
                        0{index + 1}
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-5">{tab.label}</p>
                      <p className="mt-1 text-[11px] leading-4 text-[#7d736c]">{tab.note}</p>
                    </div>
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        isActive ? "bg-[#ff7a12] shadow-[0_0_0_6px_rgba(255,122,18,0.12)]" : "bg-[#ddd3c9]"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
            </div>
          </div>

          <fieldset disabled={isViewMode} className="mt-5 min-w-0 border-0 p-0">
            {activeTab === "contact" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FieldLabel label="Address Line 1" />
                  <TextField
                    value={form.addressLine1}
                    onChange={(value) => setValue("addressLine1", value)}
                    placeholder="Enter address line 1"
                    maxLength={120}
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel label="Address Line 2" />
                  <TextField
                    value={form.addressLine2}
                    onChange={(value) => setValue("addressLine2", value)}
                    placeholder="Enter address line 2"
                    maxLength={120}
                  />
                </div>
                <div>
                  <FieldLabel label="City" />
                  <TextField
                    value={form.city}
                    onChange={(value) => setValue("city", value)}
                    placeholder="Enter city"
                    maxLength={80}
                  />
                </div>
                <div>
                  <FieldLabel label="Country" />
                  <TextField
                    value={form.country}
                    onChange={(value) => setValue("country", value)}
                    placeholder="Enter country"
                    maxLength={80}
                  />
                </div>
                <div>
                  <FieldLabel label="Postal Code" />
                  <TextField
                    value={form.postalCode}
                    onChange={(value) => setValue("postalCode", value)}
                    placeholder="Enter postal code"
                    maxLength={20}
                  />
                </div>
                <div>
                  <FieldLabel label="Alternate Mobile Number" />
                  <PhoneField
                    countryCode={form.alternateMobileCountryCode}
                    onCountryCodeChange={(value) => {
                      const nextDialCode = dialCodeByCountryCode.get(value) || SUPPLIER_DEFAULT_DIAL_CODE;

                      setValue("alternateMobileCountryCode", value);
                      setValue(
                        "alternateMobile",
                        sanitizePhoneLocalPart(form.alternateMobile, nextDialCode, value)
                      );
                    }}
                    countryOptions={countryCodeOptions}
                    selectedCountryLabel={formatDialCode(alternateDialCode)}
                    value={form.alternateMobile}
                    onChange={(value) =>
                      setValue(
                        "alternateMobile",
                        sanitizePhoneLocalPart(value, alternateDialCode, form.alternateMobileCountryCode)
                      )
                    }
                    placeholder={form.alternateMobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE ? "771234567" : "Enter phone number"}
                    maxLength={getLocalPhoneMaxLength(alternateDialCode, form.alternateMobileCountryCode)}
                  />
                  <p className="mt-2 text-xs text-[#8b7f74]">
                    Optional secondary contact with a selectable country dial code. Default is +94.
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === "sales" ? (
              <div className="grid gap-5">
                <div className="grid gap-4 xl:grid-cols-3">
                  <div>
                    <FieldLabel label="Currency" />
                    <SelectField
                      value={form.currency}
                      onChange={(value) => setValue("currency", value)}
                      options={currencyOptions}
                      placeholder="Select currency"
                    />
                  </div>
                  <div>
                    <FieldLabel label="TIN No" />
                    <TextField
                      value={form.tinNumber}
                      onChange={(value) => setValue("tinNumber", value.toUpperCase())}
                      placeholder="Enter tax identification number"
                      maxLength={40}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Tax Codes" />
                    <AsyncTaxCodeSelect
                      selectedOptions={selectedTaxCodeOptions}
                      onAddOption={addSelectedTaxCode}
                      placeholder="Select tax codes"
                      searchPlaceholder="Search tax code or name"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <FieldLabel label="Selected Tax Codes" />
                  <TaxCodeChipList
                    options={selectedTaxCodeOptions}
                    emptyMessage="Selected tax codes will appear here before you save the supplier."
                    onRemove={isViewMode ? undefined : removeSelectedTaxCode}
                  />
                  <p className="text-xs text-[#8b7f74]">
                    Add one or more sales tax codes from the dropdown above. Chips flow left to right and can be removed before saving.
                  </p>
                </div>

                {!isViewMode ? (
                  <div className="rounded-[22px] border border-[#ece3da] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                      Supplier Sales Contacts
                    </p>
                    <p className="mt-1 text-sm text-[#7b7068]">
                      Add one or more supplier-side sales contacts so your team knows who to reach for quotations and follow-ups.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                      <div className="xl:col-start-1 xl:row-start-1">
                        <FieldLabel label="Name" />
                        <TextField
                          value={salesDraft.name}
                          onChange={(value) => updateSalesDraft("name", value)}
                          placeholder="Enter salesperson name"
                          maxLength={120}
                        />
                      </div>
                      <div className="xl:col-start-2 xl:row-start-1">
                        <FieldLabel label="Email" />
                        <TextField
                          value={salesDraft.email}
                          onChange={(value) => updateSalesDraft("email", value)}
                          placeholder="Enter salesperson email"
                          maxLength={120}
                          type="email"
                        />
                      </div>
                      <div className="xl:col-start-1 xl:row-start-2">
                        <FieldLabel label="Designation" />
                        <TextField
                          value={salesDraft.designation}
                          onChange={(value) => updateSalesDraft("designation", value)}
                          placeholder="Enter designation"
                          maxLength={120}
                        />
                      </div>
                      <div className="xl:col-start-2 xl:row-start-2">
                        <FieldLabel label="Mobile Number" />
                        <PhoneField
                          countryCode={salesDraft.mobileCountryCode}
                          onCountryCodeChange={(value) => {
                            const nextDialCode = dialCodeByCountryCode.get(value) || SUPPLIER_DEFAULT_DIAL_CODE;

                            updateSalesDraft("mobileCountryCode", value);
                            updateSalesDraft(
                              "mobile",
                              sanitizePhoneLocalPart(salesDraft.mobile, nextDialCode, value)
                            );
                          }}
                          countryOptions={countryCodeOptions}
                          selectedCountryLabel={formatDialCode(salesDraftDialCode)}
                          value={salesDraft.mobile}
                          onChange={(value) =>
                            updateSalesDraft(
                              "mobile",
                              sanitizePhoneLocalPart(value, salesDraftDialCode, salesDraft.mobileCountryCode)
                            )
                          }
                          placeholder={salesDraft.mobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE ? "771234567" : "Enter phone number"}
                          maxLength={getLocalPhoneMaxLength(salesDraftDialCode, salesDraft.mobileCountryCode)}
                        />
                      </div>
                      <div className="md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:row-span-2 xl:flex xl:items-center xl:justify-center">
                        <button
                          type="button"
                          onClick={addSalesContact}
                          disabled={!salesDraftReady}
                          title="Add Salesperson"
                          aria-label="Add salesperson"
                          className={`inline-flex h-12 w-full items-center justify-center rounded-2xl transition md:w-auto md:px-5 xl:h-[104px] xl:w-14 xl:px-0 ${
                            salesDraftReady
                              ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                              : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                          }`}
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#8b7f74]">
                      <span>Select the dial code and enter the remaining phone number only.</span>
                      {salesDraft.email && !isValidEmail(salesDraft.email) ? (
                        <span className="font-medium text-[#c14d22]">Enter a valid salesperson email before adding.</span>
                      ) : null}
                      {salesDraft.mobile && salesDraftPhone.error ? (
                        <span className="font-medium text-[#c14d22]">{salesDraftPhone.error}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  {form.salesContacts.length ? (
                    form.salesContacts.map((contact, index) => {
                      const salesDialCode = dialCodeByCountryCode.get(contact.mobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE;

                      return (
                        <div
                          key={`${contact.email}-${contact.mobile}-${index}`}
                          className="rounded-[20px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf5_100%)] px-4 py-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                                Sales Contact {index + 1}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[#1f1d1c]">{contact.name}</p>
                              <p className="mt-1 text-sm text-[#756b64]">{contact.designation}</p>
                              <p className="mt-1 text-sm text-[#756b64]">{contact.email}</p>
                              <p className="mt-1 text-sm text-[#756b64]">
                                {formatPhoneNumberDisplay(contact.mobile, salesDialCode, contact.mobileCountryCode)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSalesContact(index)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f0d6cb] bg-[#fff4f1] text-[#b94f37] transition hover:bg-[#ffeae5]"
                              aria-label={`Remove supplier sales contact ${index + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
                      <p className="text-base font-semibold text-[#1f1d1c]">No sales contacts added yet.</p>
                      <p className="mt-2 text-sm text-[#786f69]">
                        Add supplier-side salesperson details here if your team needs direct commercial contacts.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {activeTab === "accounting" ? (
              <div className="grid gap-4">
                {!isViewMode ? (
                  <div className="rounded-[22px] border border-[#ece3da] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                      Supplier Bank Accounts
                    </p>
                    <p className="mt-1 text-sm text-[#7b7068]">
                      Add one or more bank accounts for remittance, settlement, and banking reference use.
                    </p>
                    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
                      <div>
                        <FieldLabel label="Account Number" />
                        <TextField
                          value={bankDraft.accountNumber}
                          onChange={(value) => updateBankDraft("accountNumber", value)}
                          placeholder="Enter account number"
                          maxLength={40}
                        />
                      </div>
                      <div>
                        <FieldLabel label="Bank" />
                        <TextField
                          value={bankDraft.bankName}
                          onChange={(value) => updateBankDraft("bankName", value)}
                          placeholder="Enter bank name"
                          maxLength={120}
                        />
                      </div>
                      <div>
                        <FieldLabel label="Branch" />
                        <TextField
                          value={bankDraft.branchName}
                          onChange={(value) => updateBankDraft("branchName", value)}
                          placeholder="Enter branch name"
                          maxLength={120}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addBankAccount}
                        disabled={!bankDraftReady}
                        className={`inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition ${
                          bankDraftReady
                            ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                            : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                        }`}
                      >
                        Add Account
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  {form.bankAccounts.length ? (
                    form.bankAccounts.map((account, index) => (
                      <div
                        key={`${account.accountNumber}-${account.bankName}-${index}`}
                        className="rounded-[20px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf5_100%)] px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                              Bank Account {index + 1}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#1f1d1c]">
                              {account.accountNumber}
                            </p>
                            <p className="mt-1 text-sm text-[#756b64]">
                              {account.bankName} | {account.branchName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBankAccount(index)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f0d6cb] bg-[#fff4f1] text-[#b94f37] transition hover:bg-[#ffeae5]"
                            aria-label={`Remove supplier bank account ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
                      <p className="text-base font-semibold text-[#1f1d1c]">No bank accounts added yet.</p>
                      <p className="mt-2 text-sm text-[#786f69]">
                        Add supplier bank details here if the accounting team needs settlement references.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {activeTab === "notes" ? (
              <div className="rounded-[22px] border border-[#ece3da] bg-white p-4">
                <FieldLabel label="Internal Notes" />
                <TextAreaField
                  value={form.internalNotes}
                  onChange={(value) => setValue("internalNotes", value)}
                  placeholder="Capture private supplier notes, onboarding remarks, or commercial reminders for the internal team."
                  rows={8}
                  maxLength={500}
                />
                <div className="mt-2 flex items-center justify-between text-xs text-[#8b7f74]">
                  <span>This note remains an internal reference area for your team.</span>
                  <span>{form.internalNotes.length}/500</span>
                </div>
              </div>
            ) : null}
          </fieldset>
        </section>

        <section className={sectionClassName}>
          <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Supplier Preview</h3>
          <p className="mt-1 text-sm text-[#7b7068]">
            {isViewMode
              ? "Review the saved supplier profile and optional tab content in read-only mode."
              : `Review the main supplier profile and any optional tab content before ${isEditMode ? "updating" : "creating"} the record.`}
          </p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Display</p>
              <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                {form.supplierCode || "----"} {form.supplierName || "Supplier name"}
              </p>
            </div>
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Primary Contact</p>
              <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                {formatPhoneNumberDisplay(form.primaryMobile, primaryDialCode, form.primaryMobileCountryCode)}
              </p>
              <p className="mt-1 text-sm text-[#7a7068]">{form.email || "Supplier email will appear here."}</p>
            </div>
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Address</p>
              <p className="mt-1 text-sm leading-6 text-[#1f1d1c]">
                {formattedAddress || "Structured supplier address will appear here."}
              </p>
            </div>
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Sales</p>
              <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                {form.salesContacts.length
                  ? `${form.salesContacts.length} sales contact${form.salesContacts.length === 1 ? "" : "s"} added`
                  : "No sales contacts added yet"}
              </p>
              {latestSalesContact ? (
                <>
                  <p className="mt-1 text-sm text-[#7a7068]">
                    Latest: {latestSalesContact.name} | {latestSalesContact.designation}
                  </p>
                  <p className="mt-1 text-sm text-[#7a7068]">{latestSalesContact.email}</p>
                  <p className="mt-1 text-sm text-[#7a7068]">
                    {formatPhoneNumberDisplay(
                      latestSalesContact.mobile,
                      dialCodeByCountryCode.get(latestSalesContact.mobileCountryCode) || SUPPLIER_DEFAULT_DIAL_CODE,
                      latestSalesContact.mobileCountryCode
                    )}
                  </p>
                </>
              ) : null}
              <p className="mt-1 text-sm text-[#7a7068]">Currency: {selectedCurrencyLabel}</p>
              <p className="mt-1 text-sm text-[#7a7068]">TIN No: {form.tinNumber || "Not added yet"}</p>
              <p className="mt-1 text-sm text-[#7a7068]">Tax Codes: {selectedTaxCodeLabel}</p>
              {selectedTaxCodeOptions.length ? (
                <div className="mt-2">
                  <TaxCodeChipList
                    options={selectedTaxCodeOptions}
                    emptyMessage="No tax codes selected."
                  />
                </div>
              ) : null}
            </div>
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Accounting</p>
              <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                {form.bankAccounts.length
                  ? `${form.bankAccounts.length} bank account${form.bankAccounts.length === 1 ? "" : "s"} added`
                  : "No bank accounts added yet"}
              </p>
              {form.bankAccounts.length ? (
                <p className="mt-1 text-sm text-[#7a7068]">
                  Latest: {form.bankAccounts[form.bankAccounts.length - 1]?.bankName} |{" "}
                  {form.bankAccounts[form.bankAccounts.length - 1]?.branchName}
                </p>
              ) : null}
            </div>
            <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Internal Notes</p>
              <p className="mt-1 text-sm leading-6 text-[#1f1d1c]">
                {form.internalNotes || "No internal notes added."}
              </p>
            </div>
          </div>
        </section>
      </div>

      <SurfaceCard>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] border border-[#f1dfd1] bg-[linear-gradient(135deg,#fff7ef_0%,#fffdf9_100%)] p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-[18px] bg-[#fff1e4] p-3 text-[#ff7101]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Supplier Master</p>
                <p className="mt-2 text-sm leading-6 text-[#756b64]">
                  Capture the required supplier identity first, then use the tabs to enrich contact, sales, accounting, and note details.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 rounded-[24px] border border-[#eadfd5] bg-white p-5">
              <div className="rounded-[18px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-3">
                <p className="text-sm font-semibold text-[#1f1d1c]">Form Rules</p>
                <p className="mt-1 text-sm text-[#7a7068]">
                  {isViewMode
                    ? "View mode is read-only. Use edit mode when you need to change supplier details."
                    : hasErrors
                    ? `Complete the required supplier fields before ${isEditMode ? "updating" : "creating"} the supplier.`
                    : isEditMode
                      ? isDirty
                        ? "Changes detected. The supplier is ready for update."
                        : "Make a change to any supplier field to enable the update action."
                    : "Supplier code format is valid. Final uniqueness is checked when you save."}
              </p>
            </div>
            <div className="rounded-[18px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-3">
              <p className="text-sm font-semibold text-[#1f1d1c]">Optional Tabs</p>
              <p className="mt-1 text-sm text-[#7a7068]">
                Address, sales contacts, bank accounts, and notes can be completed now or later without blocking supplier creation.
              </p>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-[16px] bg-[#edf4ff] p-2.5 text-[#2d6df6]">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1f1d1c]">Tabbed Contact Setup</p>
                <p className="mt-1 text-sm text-[#7a7068]">
                  Address details are split into line 1, line 2, city, country, and postal code for cleaner contact records.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[22px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-[16px] bg-[#effbf4] p-2.5 text-[#1b7a50]">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1f1d1c]">Sales Contacts</p>
                <p className="mt-1 text-sm text-[#7a7068]">
                  Add one or more supplier-side sales contacts, then keep tax and currency details grouped in the same tab.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[22px] border border-[#ece3da] bg-[#fcfaf7] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-[16px] bg-[#fff1e4] p-2.5 text-[#ff7101]">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1f1d1c]">Accounting and Notes</p>
                <p className="mt-1 text-sm text-[#7a7068]">
                  Add multiple supplier bank accounts and internal notes without overcrowding the main form.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}
