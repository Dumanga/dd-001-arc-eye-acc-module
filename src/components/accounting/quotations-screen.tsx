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
  QuotationFormPanel,
  type QuotationDraft,
} from "@/components/accounting/quotation-form-panel";
import { QuotationPreview } from "@/components/accounting/quotation-preview";
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { BranchFilter } from "@/components/accounting/branch-filter";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";

const QUOTATION_FORM_ID = "quotation-form";
const QUOTATION_LIST_PAGE_SIZE = 10;
const FALLBACK_QUOTATION_NUMBER = "QT-2026-0001";

type QuotationStatus = "DRAFT" | "APPROVED" | "CANCELLED";

type QuotationListItem = {
  id: string;
  quotationNumber: string;
  customerName: string;
  customerCity: string;
  preparedBy: string;
  quotationDate: string;
  validUntil: string;
  status: QuotationStatus;
  statusLabel: string;
  currency: string;
  total: string;
  itemsCount: number;
  storeId: string;
  storeCode: string;
  storeName: string;
};

type QuotationKpiPayload = {
  totalQuotations: number;
  drafts: number;
  approved: number;
  expiringSoon: number;
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
  | { mode: "edit"; quotationId: string }
  | { mode: "preview"; quotationId: string };

const STATUS_PILL_MAP: Record<QuotationStatus, string> = {
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

function buildQuotationNumber(config: FormIdConfigItem | null): string {
  if (!config) return FALLBACK_QUOTATION_NUMBER;
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(Boolean);
  return parts.join("-") || FALLBACK_QUOTATION_NUMBER;
}

function createInitialDraft(quoteNumber: string, terms: string): QuotationDraft {
  return {
    quotationNumber: quoteNumber,
    customerRef: "",
    preparedBy: "",
    quotationDate: buildLocalDate(0),
    validUntil: buildLocalDate(14),
    currency: "LKR",
    discount: "0.00",
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

function StatusPill({ status, label }: { status: QuotationStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL_MAP[status]}`}
    >
      {label}
    </span>
  );
}

export function QuotationsScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  // List state
  const [quotationItems, setQuotationItems] = useState<QuotationListItem[]>([]);
  const [kpiPayload, setKpiPayload] = useState<QuotationKpiPayload>({
    totalQuotations: 0,
    drafts: 0,
    approved: 0,
    expiringSoon: 0,
    approvedValueLkr: "0.00",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Create form data
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);

  // Create form draft
  const [draft, setDraft] = useState<QuotationDraft>(() =>
    createInitialDraft(FALLBACK_QUOTATION_NUMBER, "")
  );
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  // Mirrors the super-admin selection in the header's "Create on behalf of"
  // picker. The picker manages its own internal state; this lifts a copy up
  // so per-row actions can be gated on it. Branch users never set this
  // (the picker isn't rendered for them).
  const [headerPickedStoreId, setHeaderPickedStoreId] = useState<string | null>(null);
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

  // Load quotation list
  const loadQuotationList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = filterStoreId
        ? `/api/accounting/quotations?storeId=${encodeURIComponent(filterStoreId)}`
        : "/api/accounting/quotations";
      const res = await fetch(url);
      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { items: QuotationListItem[]; kpis: QuotationKpiPayload } | null;
      };
      if (payload.success && payload.data) {
        setQuotationItems(payload.data.items);
        setKpiPayload(payload.data.kpis);
      } else {
        setListError(payload.message ?? "Failed to load quotations.");
      }
    } catch {
      setListError("Network error while loading quotations.");
    } finally {
      setListLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => {
    void loadQuotationList();
  }, [loadQuotationList]);

  // Navigation helpers
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

      const qtConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "QT") ?? null
          : null;

      const quotationRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find((r) => r.documentType === "QUOTATION")?.content ?? ""
          : "";

      setDraft(createInitialDraft(buildQuotationNumber(qtConfig), quotationRemark));
    } catch {
      setCreateDataError("Unable to load required data. Check your connection and try again.");
    } finally {
      setCreateDataLoading(false);
    }
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setDraft(createInitialDraft(FALLBACK_QUOTATION_NUMBER, ""));
    setScreenState({ mode: "create" });
    void loadCreateFormData();
  }

  function openPreview(quotationId: string) {
    setScreenState({ mode: "preview", quotationId });
  }

  // Pending Forms inbox deep-links here with ?id=<quotationId>.
  useOpenPreviewFromUrl(openPreview);

  // ── Super-admin Edit mode ──────────────────────────────────────────────
  // Fetches the existing DRAFT quotation, hydrates the form-panel draft
  // state from it, then switches the screen into edit mode. The form panel
  // is reused as-is — onSubmit is wired to PATCH instead of POST.
  async function openEditMode(quotationId: string) {
    setCreateDataLoading(true);
    setCreateDataError(null);
    setScreenState({ mode: "edit", quotationId });
    try {
      // NOTE: we deliberately do NOT call loadCreateFormData() here — it
      // would race with the detail fetch and overwrite the draft with a
      // fresh "create" draft (next form-id number + default remarks). The
      // quotation already has its own number, terms, and customer; pickers
      // load their own data on demand if the user opens them.

      const res = await fetch(`/api/accounting/quotations/${quotationId}`);
      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: {
          quotation: {
            id: string;
            quotationNumber: string;
            storeId: string;
            quotationDate: string;
            validUntil: string;
            customerRef: string;
            preparedBy: string;
            currency: string;
            discount: string;
            notes: string;
            terms: string;
            customer: {
              id: string;
              name: string;
              mobile: string;
              email: string;
              address: string;
              currency: string;
            };
            lines: Array<{
              id: string;
              productId: string;
              productCode: string;
              productName: string;
              description: string;
              quantity: string;
              unitPrice: string;
              uomName: string;
              uomBase: string;
              uomMinQty: string;
            }>;
          };
        } | null;
      };
      if (!payload.success || !payload.data) {
        throw new Error(payload.message ?? "Failed to load quotation for editing.");
      }
      const q = payload.data.quotation;
      // Pre-pick the branch the quotation belongs to — mirrors what
      // BranchAwareCreateButton does for create. Branch is immutable on
      // edit (the PATCH route preserves the existing storeId).
      setPickedStoreId(q.storeId);
      setDraft({
        quotationNumber: q.quotationNumber,
        customerRef: q.customerRef,
        preparedBy: q.preparedBy,
        quotationDate: q.quotationDate,
        validUntil: q.validUntil,
        currency: q.currency,
        discount: q.discount,
        notes: q.notes,
        terms: q.terms,
        customer: {
          id: q.customer.id,
          code: q.customer.mobile,
          name: q.customer.name,
          contact: q.customer.mobile,
          city: q.customer.address,
          currency: q.customer.currency,
          taxes: [],
        },
        lines: q.lines.map((line) => ({
          id: line.id,
          itemId: line.productId,
          itemCode: line.productCode,
          itemName: line.productName,
          itemLabel: line.productName,
          description: line.description,
          quantity: line.quantity,
          price: line.unitPrice,
          uomName: line.uomName,
          uomBase: line.uomBase,
          uomMinQty: line.uomMinQty,
        })),
      });
    } catch (error) {
      setCreateDataError(
        error instanceof Error ? error.message : "Unable to load quotation for editing.",
      );
    } finally {
      setCreateDataLoading(false);
    }
  }

  async function handleUpdateQuotation(currentDraft: QuotationDraft) {
    if (screenState.mode !== "edit") return;
    if (!currentDraft.customer) {
      setToast({ tone: "error", message: "Customer is required." });
      return;
    }
    if (!currentDraft.lines.length) {
      setToast({ tone: "error", message: "Add at least one line item." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/quotations/${screenState.quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: currentDraft.customer.id,
          quotationDate: currentDraft.quotationDate,
          validUntil: currentDraft.validUntil,
          customerRef: currentDraft.customerRef,
          preparedBy: currentDraft.preparedBy,
          currency: currentDraft.currency,
          notes: currentDraft.notes,
          terms: currentDraft.terms,
          discount: currentDraft.discount,
          lines: currentDraft.lines.map((line, idx) => ({
            productId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.price,
            uomName: line.uomName,
            uomBase: line.uomBase,
            uomMinQty: line.uomMinQty,
            lineOrder: idx,
          })),
        }),
      });

      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { id: string; quotationNumber: string } | null;
      };
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? "Failed to update quotation.");
      }

      setToast({ tone: "success", message: `Quotation ${payload.data.quotationNumber} updated.` });
      void loadQuotationList();
      setScreenState({ mode: "preview", quotationId: payload.data.id });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update quotation.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateQuotation(currentDraft: QuotationDraft) {
    if (!currentDraft.customer) {
      setToast({ tone: "error", message: "Select a customer before creating the quotation." });
      return;
    }
    if (!currentDraft.lines.length) {
      setToast({ tone: "error", message: "Add at least one line item to continue with this quotation." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/accounting/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotationNumber: currentDraft.quotationNumber,
          customerId: currentDraft.customer.id,
          ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
          quotationDate: currentDraft.quotationDate,
          validUntil: currentDraft.validUntil,
          customerRef: currentDraft.customerRef,
          preparedBy: currentDraft.preparedBy,
          currency: currentDraft.currency,
          notes: currentDraft.notes,
          terms: currentDraft.terms,
          discount: currentDraft.discount,
          lines: currentDraft.lines.map((line, idx) => ({
            productId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.price,
            uomName: line.uomName,
            uomBase: line.uomBase,
            uomMinQty: line.uomMinQty,
            lineOrder: idx,
          })),
        }),
      });

      const payload = (await res.json()) as {
        success: boolean;
        message?: string;
        data: { id: string; quotationNumber: string } | null;
      };

      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? "Failed to create quotation.");
      }

      setToast({ tone: "success", message: `Quotation ${payload.data.quotationNumber} created.` });
      void loadQuotationList();
      setScreenState({ mode: "preview", quotationId: payload.data.id });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save quotation.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Filtered list
  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return quotationItems;

    return quotationItems.filter((item) => {
      const fields = [
        item.quotationNumber,
        item.customerName,
        item.customerCity,
        item.preparedBy,
        item.validUntil,
        item.quotationDate,
        item.statusLabel,
        item.total,
      ];

      return fields.some((value) => String(value).toLowerCase().includes(search));
    });
  }, [quotationItems, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / QUOTATION_LIST_PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (effectivePage - 1) * QUOTATION_LIST_PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + QUOTATION_LIST_PAGE_SIZE);
  }, [effectivePage, filteredItems]);

  const showBranchColumn = viewer?.role === "SUPER_ADMIN";
  // Super admins must explicitly pick a specific branch in the header
  // "Create on behalf of [Pick branch]" dropdown before any per-row
  // actions (View / Edit / Recall) are clickable. Branch users have an
  // implicit branch and aren't gated.
  const needsBranchPick = viewer?.role === "SUPER_ADMIN" && !headerPickedStoreId;

  // Branch the quotation under edit belongs to. openEditMode() seeds
  // pickedStoreId from the loaded detail; we surface it in the page
  // header + banner so the user sees "which branch is this on" instead
  // of the create-mode "Pick branch" dropdown. Branch is immutable on
  // edit — the PATCH route ignores any storeId in the body.
  const editingBranch =
    screenState.mode === "edit" && pickedStoreId
      ? activeBranches.find((b) => b.id === pickedStoreId) ?? null
      : null;

  const tableRows = useMemo(
    () =>
      paginatedItems.map((q) => ({
        id: q.id,
        "Quote No": q.quotationNumber,
        Customer: q.customerName,
        City: q.customerCity,
        "Prepared By": q.preparedBy,
        "Valid Until": formatDateLabel(q.validUntil),
        ...(showBranchColumn ? { Branch: q.storeCode } : {}),
        Status: <StatusPill status={q.status} label={q.statusLabel} />,
        Amount: `${q.currency} ${Number(q.total).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      })),
    [paginatedItems, showBranchColumn]
  );

  const paginationSummary = useMemo(() => {
    if (!filteredItems.length) {
      return "Showing 0-0 of 0 quotations";
    }

    const startItem = (effectivePage - 1) * QUOTATION_LIST_PAGE_SIZE + 1;
    const endItem = Math.min(effectivePage * QUOTATION_LIST_PAGE_SIZE, filteredItems.length);

    return `Showing ${startItem}-${endItem} of ${filteredItems.length} quotations`;
  }, [effectivePage, filteredItems.length]);

  const tableColumns = useMemo(
    () =>
      [
        "Quote No",
        "Customer",
        "City",
        "Prepared By",
        "Valid Until",
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
        label: "Total Quotations",
        value: String(kpiPayload.totalQuotations).padStart(2, "0"),
        detail: "All quotations in the working register.",
        icon: Receipt,
        tone: "amber" as const,
      },
      {
        label: "Drafts",
        value: String(kpiPayload.drafts).padStart(2, "0"),
        detail: "Quotations awaiting approval.",
        icon: TimerReset,
        tone: "blue" as const,
      },
      {
        label: "Expiring This Week",
        value: String(kpiPayload.expiringSoon).padStart(2, "0"),
        detail: "Approved quotations whose validity ends within 7 days.",
        icon: Sparkles,
        tone: "violet" as const,
      },
      {
        label: "Approved Value (LKR)",
        value: formatCurrency(Number(kpiPayload.approvedValueLkr), "LKR").replace(".00", ""),
        detail: "Combined LKR value across approved quotations.",
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
        eyebrow: "CUSTOMERS / QUOTATIONS / CREATE",
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
              form={QUOTATION_FORM_ID}
              disabled={saving || createDataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Creating…" : "Create Quotation"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return {
        eyebrow: "CUSTOMERS / QUOTATIONS / PREVIEW",
      };
    }

    if (screenState.mode === "edit") {
      const editingQuotationId = screenState.quotationId;
      return {
        eyebrow: "CUSTOMERS / QUOTATIONS / EDIT",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            {editingBranch ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-[#ecfcff] px-3 py-2 text-sm font-semibold text-[#0e7490]">
                <span className="text-xs uppercase tracking-[0.16em] text-[#0891a8]">
                  Branch
                </span>
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#0e7490]">
                  {editingBranch.code}
                </span>
                <span className="text-xs font-medium text-[#155e75]">
                  {editingBranch.name}
                </span>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setScreenState({
                  mode: "preview",
                  quotationId: editingQuotationId,
                });
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={QUOTATION_FORM_ID}
              disabled={saving || createDataLoading}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Updating…" : "Update Quotation"}
            </button>
          </div>
        ),
      };
    }

    return {
      eyebrow: "CUSTOMERS / QUOTATIONS",
      title: "Quotation workspace optimized for fast prep and follow-up.",
      description:
        "Customer quotation register with status tracking, validity, and conversion-ready summary cards.",
      action: (
        <BranchAwareCreateButton
          label="Create Quotation"
          viewer={viewer}
          branches={activeBranches}
          loading={viewerLoading}
          onCreate={openCreateMode}
          onPickedChange={setHeaderPickedStoreId}
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
            title="Active quotations"
            description="Customer quotation register with status and validity tracking."
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
                    placeholder="Search by quote number, customer, city, preparer, or status"
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
                  onClick={() => void loadQuotationList()}
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
                  Loading quotations…
                </div>
              ) : !filteredItems.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No quotations found.
                </div>
              ) : (
                <>
                  {needsBranchPick ? (
                    <div className="rounded-2xl border border-[#ffd9b5] bg-[#fff7f0] px-4 py-3 text-sm text-[#b45e1a]">
                      Pick a branch in the <span className="font-semibold">Create on behalf of</span>{" "}
                      dropdown at the top of this page to view, edit, or recall quotations.
                      Super-admin actions require an active branch context.
                    </div>
                  ) : null}
                  <DataTable
                    columns={tableColumns}
                    rows={tableRows}
                    onRowClick={(row) => {
                      if (needsBranchPick) return;
                      if (typeof row.id === "string" && row.id) openPreview(row.id);
                    }}
                    rowAction={(row) => {
                      if (typeof row.id !== "string" || !row.id) return null;
                      const rowId = row.id;
                      return (
                        <button
                          type="button"
                          disabled={needsBranchPick}
                          title={
                            needsBranchPick
                              ? "Pick a branch in the header dropdown to enable this action."
                              : undefined
                          }
                          onClick={() => {
                            if (needsBranchPick) return;
                            openPreview(rowId);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition ${
                            needsBranchPick
                              ? "cursor-not-allowed border-[#ebe0d4] bg-[#f6efe8] text-[#a8998a]"
                              : "border-[#e2d8cf] bg-white text-[#786f69] hover:bg-[#fff7f0]"
                          }`}
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
              Loading quotation configuration…
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <QuotationFormPanel
            formId={QUOTATION_FORM_ID}
            draft={draft}
            onChange={setDraft}
            onSubmit={handleCreateQuotation}
          />
        </>
      )}

      {/* Edit mode (super-admin only) — reuses the same form panel as
          create, with PATCH on submit. Quotation number is locked
          (immutable) and is shown in the panel's read-only field. */}
      {screenState.mode === "edit" && (
        <>
          <div className="rounded-2xl border border-[#cdeef3] bg-[#ecfcff] px-4 py-3 text-sm text-[#0e7490]">
            Editing <span className="font-semibold">{draft.quotationNumber}</span>
            {editingBranch ? (
              <>
                {" "}on branch{" "}
                <span className="font-semibold">{editingBranch.code}</span>{" "}
                <span className="text-[#155e75]">({editingBranch.name})</span>
              </>
            ) : null}
            . Branch is locked on edit — click{" "}
            <span className="font-semibold">Update Quotation</span> at the top right to
            save changes.
          </div>
          {createDataLoading ? (
            <div className="rounded-2xl border border-[#e7ddd4] bg-[#fffaf5] px-4 py-3 text-sm text-[#7c6f65]">
              Loading quotation…
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <QuotationFormPanel
            formId={QUOTATION_FORM_ID}
            draft={draft}
            onChange={setDraft}
            onSubmit={handleUpdateQuotation}
          />
        </>
      )}

      {/* Preview mode */}
      {screenState.mode === "preview" && (
        <QuotationPreview
          quotationId={screenState.quotationId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadQuotationList();
          }}
          onApproved={() => {
            void loadQuotationList();
          }}
          viewerRole={viewer?.role}
          onEdit={
            viewer?.role === "SUPER_ADMIN"
              ? () => {
                  if (screenState.mode === "preview") {
                    void openEditMode(screenState.quotationId);
                  }
                }
              : undefined
          }
          onRecalled={() => {
            void loadQuotationList();
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
