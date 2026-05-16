"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Eye,
  Loader2,
  MailCheck,
  PencilLine,
  PhoneCall,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountingPageIntro, PremiumMetricGrid, SurfaceCard } from "@/components/accounting/accounting-ui";
import { SupplierFormPanel, type SupplierFormState } from "@/components/accounting/supplier-form-panel";
import type { ApiResponse } from "@/lib/api/response";
import { formatPhoneNumberDisplay } from "@/lib/accounting/supplier-phone";
import { SUPPLIER_LIST_PAGE_SIZE } from "@/lib/accounting/supplier-types";
import type {
  SupplierTaxCodeOption,
  SupplierFormValues,
  SupplierListSort,
  SupplierRecord,
  SuppliersPayload,
} from "@/lib/accounting/supplier-types";

const SUPPLIER_FORM_ID = "supplier-form";

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "view"; supplier: SupplierRecord }
  | { mode: "edit"; supplier: SupplierRecord };

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

function toFormValues(supplier: SupplierRecord): SupplierFormState {
  return {
    supplierCode: supplier.supplierCode,
    supplierName: supplier.supplierName,
    primaryMobileCountryCode: supplier.primaryMobileCountryCode,
    primaryMobile: supplier.primaryMobile,
    email: supplier.email,
    address: supplier.address,
    alternateMobileCountryCode: supplier.alternateMobileCountryCode,
    alternateMobile: supplier.alternateMobile,
    addressLine1: supplier.addressLine1,
    addressLine2: supplier.addressLine2,
    city: supplier.city,
    country: supplier.country,
    postalCode: supplier.postalCode,
    currency: supplier.currency,
    tinNumber: supplier.tinNumber,
    taxCodes: [...supplier.taxCodes],
    salesContacts: supplier.salesContacts.map((contact) => ({
      name: contact.name,
      email: contact.email,
      designation: contact.designation,
      mobileCountryCode: contact.mobileCountryCode,
      mobile: contact.mobile,
    })),
    bankAccounts: supplier.bankAccounts.map((account) => ({
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branchName: account.branchName,
    })),
    internalNotes: supplier.internalNotes,
  };
}

function toTaxCodeOptions(supplier: SupplierRecord): SupplierTaxCodeOption[] {
  return supplier.taxCodeOptions.map((option) => ({ ...option }));
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
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`} />
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

export function SupplierScreen({ initialData }: { initialData?: SuppliersPayload }) {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [listPayload, setListPayload] = useState<SuppliersPayload | null>(() => initialData ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SupplierListSort>("latest");
  const [pageSize, setPageSize] = useState(SUPPLIER_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(() => !initialData);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  const sortOptions = [
    { label: "Sort: Latest", value: "latest" },
    { label: "Name: A to Z", value: "name-asc" },
    { label: "Name: Z to A", value: "name-desc" },
    { label: "Code: A to Z", value: "code-asc" },
  ];
  const pageSizeOptions = [
    { label: "10 per page", value: "10" },
    { label: "20 per page", value: "20" },
    { label: "30 per page", value: "30" },
    { label: "50 per page", value: "50" },
  ];

  const loadSuppliers = useCallback(async () => {
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

      const data = await requestJson<SuppliersPayload>(`/api/accounting/suppliers?${params.toString()}`, {
        cache: "no-store",
      });
      setListPayload(data);
      if (data.page !== currentPage) {
        setCurrentPage(data.page);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, pageSize, screenState.mode, sortBy]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

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

  const openEditMode = useCallback((supplier: SupplierRecord) => {
    setScreenState({ mode: "edit", supplier });
    setFormError(null);
    setEditDirty(false);
  }, []);

  const openViewMode = useCallback((supplier: SupplierRecord) => {
    setScreenState({ mode: "view", supplier });
    setFormError(null);
    setEditDirty(false);
  }, []);

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
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const suppliers = listPayload?.items ?? [];
  const totalCount = listPayload?.totalCount ?? 0;
  const totalPages = listPayload?.totalPages ?? 1;
  const metrics = useMemo(() => {
    const metricsSummary = listPayload?.summary ?? {
      registeredSuppliers: 0,
      reachableSuppliers: 0,
      backupContacts: 0,
      addressProfiles: 0,
    };

    return [
      {
        label: "Registered Suppliers",
        value: String(metricsSummary.registeredSuppliers).padStart(2, "0"),
        detail: "Suppliers currently visible in the supplier list for purchasing-side selection.",
        icon: Building2,
        tone: "amber" as const,
      },
      {
        label: "Reachable Suppliers",
        value: String(metricsSummary.reachableSuppliers).padStart(2, "0"),
        detail: "Profiles with both primary phone and email contact details ready.",
        icon: MailCheck,
        tone: "blue" as const,
      },
      {
        label: "Backup Contacts",
        value: String(metricsSummary.backupContacts).padStart(2, "0"),
        detail: "Suppliers that already have a secondary phone number captured.",
        icon: PhoneCall,
        tone: "green" as const,
      },
      {
        label: "Address Profiles",
        value: String(metricsSummary.addressProfiles).padStart(2, "0"),
        detail: "Supplier records with a usable address attached for delivery coordination.",
        icon: Building2,
        tone: "violet" as const,
      },
    ];
  }, [listPayload]);

  const editingInitialValues = useMemo(
    () => (screenState.mode === "edit" || screenState.mode === "view" ? toFormValues(screenState.supplier) : undefined),
    [screenState]
  );
  const editingTaxCodeOptions = useMemo(
    () => (screenState.mode === "edit" || screenState.mode === "view" ? toTaxCodeOptions(screenState.supplier) : []),
    [screenState]
  );

  async function submitCreate(form: SupplierFormValues, keepCreateMode: boolean) {
    setSaving(true);
    setFormError(null);

    try {
      await requestJson<SupplierRecord>("/api/accounting/suppliers", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setCurrentPage(1);
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setPageError(null);
      setFormError(null);
      setToast({
        tone: "success",
        message: keepCreateMode ? "Supplier created. The form is ready for the next supplier." : "Supplier created successfully.",
      });

      if (!keepCreateMode) {
        closeFormMode();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create supplier.";
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

  async function handleCreate(form: SupplierFormValues) {
    await submitCreate(form, false);
  }

  async function handleCreateAndNext(form: SupplierFormValues) {
    await submitCreate(form, true);
  }

  async function handleUpdate(form: SupplierFormValues) {
    if (screenState.mode !== "edit") {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await requestJson<SupplierRecord>("/api/accounting/suppliers", {
        method: "PATCH",
        body: JSON.stringify({
          id: screenState.supplier.id,
          ...form,
        }),
      });

      setPageError(null);
      setFormError(null);
      setToast({
        tone: "success",
        message: "Supplier updated successfully.",
      });
      closeFormMode();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update supplier.";
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
        eyebrow: "SUPPLIERS / CREATE",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
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
              form={SUPPLIER_FORM_ID}
              data-intent="create"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating..." : "Create Supplier"}
            </button>
            <button
              type="submit"
              form={SUPPLIER_FORM_ID}
              data-intent="create-and-next"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1f9f75] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#177a5a] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Create and Next"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "edit") {
      return {
        eyebrow: "SUPPLIERS / EDIT",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
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
              form={SUPPLIER_FORM_ID}
              data-intent="update"
              disabled={saving || !editDirty}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Updating..." : "Update Supplier"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "view") {
      return {
        eyebrow: "SUPPLIERS / VIEW",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeFormMode}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        ),
      };
    }

    return {
      eyebrow: "SUPPLIERS",
      action: (
        <button
          type="button"
          onClick={openCreateMode}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Add Supplier
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

          <SurfaceCard title="Supplier List" description="Compact supplier register with API-driven search, paging, and inline view or edit access.">
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
                placeholder="Search by code, supplier, phone, email, tax code, or address"
                className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>

            <div>
              <FilterSelect
                value={sortBy}
                onChange={(value) => {
                  setSortBy(value as SupplierListSort);
                  setCurrentPage(1);
                }}
                options={sortOptions}
                placeholder="Sort suppliers"
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
              Loading suppliers...
            </div>
          ) : suppliers.length ? null : (
            <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
              <p className="text-base font-semibold text-[#1f1d1c]">No suppliers matched this search.</p>
              <p className="mt-2 text-sm text-[#786f69]">Try a different keyword or adjust the sort and page settings.</p>
            </div>
          )}

          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-[18px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf6_100%)] px-4 py-3"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#fff0e2] px-2.5 py-1 text-[11px] font-semibold text-[#b45b12]">
                      {supplier.supplierCode}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate font-sans text-base font-semibold text-[#1f1d1c]">
                    {supplier.supplierName}
                  </h3>
                  <p className="mt-1 truncate text-sm text-[#756b64]">{supplier.email}</p>
                  <p className="mt-1 text-xs text-[#8b7f74]">
                    Currency: {supplier.currency}
                    {supplier.taxCodeOptions.length
                      ? ` | Tax Codes: ${
                          supplier.taxCodeOptions.length === 1
                            ? supplier.taxCodeOptions[0].label
                            : `${supplier.taxCodeOptions.length} selected`
                        }`
                      : ""}
                  </p>
                </div>

                <div className="min-w-0 rounded-[16px] border border-[#eee4db] bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                    Contact
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-[#1f1d1c]">
                    {formatPhoneNumberDisplay(
                      supplier.primaryMobile,
                      supplier.primaryMobileDialCode,
                      supplier.primaryMobileCountryCode
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#7d736c]">
                    {supplier.alternateMobile
                      ? `Alt: ${formatPhoneNumberDisplay(
                          supplier.alternateMobile,
                          supplier.alternateMobileDialCode,
                          supplier.alternateMobileCountryCode
                        )}`
                      : "No alternate contact"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => openViewMode(supplier)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3.5 py-2 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditMode(supplier)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3.5 py-2 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-3 border-t border-[#ece4db] pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[#786f69]">
              <p>
                Showing {totalCount ? (currentPage - 1) * pageSize + 1 : 0}-
                {Math.min(currentPage * pageSize, totalCount)} of {totalCount} suppliers
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
        <SupplierFormPanel
          key={screenState.mode === "create" ? "create" : `${screenState.mode}-${screenState.supplier.id}`}
          mode={screenState.mode}
          formId={SUPPLIER_FORM_ID}
          existingCodes={[]}
          initialValues={editingInitialValues}
          initialTaxCodeOptions={editingTaxCodeOptions}
          onCreate={handleCreate}
          onCreateAndNext={handleCreateAndNext}
          onUpdate={handleUpdate}
          onDirtyChange={setEditDirty}
          serverError={formError}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
