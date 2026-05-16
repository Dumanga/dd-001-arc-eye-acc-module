"use client";

import {
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Plus,
  PackagePlus,
  ScanBarcode,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountingPageIntro, PremiumMetricGrid, SurfaceCard } from "@/components/accounting/accounting-ui";
import { UomFormPanel } from "@/components/accounting/uom-form-panel";
import type { ApiResponse } from "@/lib/api/response";
import {
  deriveUomType,
  parseUomDecimal,
  sortUomRecords,
  type UomCategoryCode,
  type UomCategoryDefinition,
  type UomRecord,
  uomCategories,
} from "@/lib/accounting/uom-config";
import type { UomFormValues, UomPayload } from "@/lib/accounting/uom-types";

const CREATE_FORM_ID = "uom-create-form";

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return {
    ...payload,
    data: payload.data as T,
  };
}

function SuccessToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-5 top-5 z-[110] w-full max-w-sm">
      <div className="flex items-start gap-3 rounded-[24px] border border-[#bfe8cd] bg-[linear-gradient(180deg,#f5fff8_0%,#eafff0_100%)] px-4 py-3 shadow-[0_18px_42px_rgba(27,24,22,0.12)]">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#18a66a] text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#176947]">Success</p>
          <p className="mt-1 text-sm leading-6 text-[#2f5a43]">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#4e7b60] transition hover:bg-white/70"
          aria-label="Dismiss success message"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ErrorDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#120f0c]/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#f0d4ca] bg-[linear-gradient(180deg,#fffdfa_0%,#fff4f1_100%)] p-6 shadow-[0_24px_60px_rgba(18,15,12,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c45d34]">
              Request Failed
            </p>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-[#1f1d1c]">
              Unable to save UOM
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ead7cf] bg-white text-[#6f655d] transition hover:bg-[#fff7f2]"
            aria-label="Close error dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-7 text-[#7a6359]">{message}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            Close
          </button>
        </div>
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

function buildVisibleCategories(
  categories: UomCategoryDefinition[],
  records: UomRecord[],
  searchTerm: string,
  sortBy: string
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const grouped = categories
    .map((category) => {
      const allCategoryUnits = sortUomRecords(records.filter((record) => record.categoryCode === category.code));

      if (!normalizedSearch) {
        return { category, units: allCategoryUnits };
      }

      const categoryMatches =
        category.name.toLowerCase().includes(normalizedSearch) ||
        category.baseUnit.toLowerCase().includes(normalizedSearch) ||
        category.description.toLowerCase().includes(normalizedSearch);

      const matchedUnits = allCategoryUnits.filter((unit) =>
        [unit.name, deriveUomType(unit.ratioToBase), unit.smallestAllowedQty, unit.addedBy].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      );

      if (categoryMatches) {
        return { category, units: allCategoryUnits };
      }

      return matchedUnits.length ? { category, units: matchedUnits } : null;
    })
    .filter(Boolean) as Array<{ category: UomCategoryDefinition; units: UomRecord[] }>;

  switch (sortBy) {
    case "units-desc":
      return grouped.sort((left, right) => right.units.length - left.units.length);
    case "custom-desc":
      return grouped.sort(
        (left, right) =>
          right.units.filter((unit) => !unit.isSystem).length - left.units.filter((unit) => !unit.isSystem).length
      );
    default:
      return grouped.sort((left, right) => left.category.displayOrder - right.category.displayOrder);
  }
}

function getUnitChipClasses(unit: UomRecord) {
  if (!unit.isActive) {
    return "border-[#edd7c8] bg-[#fff7f0] text-[#9b6c43]";
  }

  if (unit.isBase || parseUomDecimal(unit.ratioToBase) === 1) {
    return "border-[#ffd4b0] bg-[#fff1e3] text-[#a45512]";
  }

  if (unit.isSystem) {
    return "border-[#d7e4ff] bg-[#f3f7ff] text-[#315d9b]";
  }

  return "border-[#d8eadf] bg-[#f1fbf5] text-[#1d7a52]";
}

export function UomScreen() {
  const [createMode, setCreateMode] = useState(false);
  const [categories, setCategories] = useState<UomCategoryDefinition[]>(uomCategories);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<UomCategoryCode>(uomCategories[0].code);
  const [uomRecords, setUomRecords] = useState<UomRecord[]>([]);
  const [currentUserName, setCurrentUserName] = useState("Accounting User");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("category-asc");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  const sortOptions = [
    { label: "Category Order", value: "category-asc" },
    { label: "Most Units", value: "units-desc" },
    { label: "Most Custom Units", value: "custom-desc" },
  ];

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    if (!createMode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [createMode]);

  async function loadUomData() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const payload = await requestJson<UomPayload>("/api/accounting/uom");

      setCategories(payload.data.categories);
      setUomRecords(payload.data.items);
      setCurrentUserName(payload.data.currentUserDisplayName);
      setSelectedCategoryCode((current) =>
        payload.data.categories.some((category) => category.code === current)
          ? current
          : payload.data.categories[0]?.code ?? current
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load UOM data.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUomData();
  }, []);

  const metrics = useMemo(() => {
    const customUnits = uomRecords.filter((item) => !item.isSystem).length;
    const activeUnits = uomRecords.filter((item) => item.isActive).length;

    return [
      {
        label: "Fixed Categories",
        value: String(categories.length).padStart(2, "0"),
        detail: "System-owned UOM categories available for inventory and product setup.",
        icon: Boxes,
        tone: "amber" as const,
      },
      {
        label: "Registered Units",
        value: String(uomRecords.length).padStart(2, "0"),
        detail: "Base and custom units currently visible in the UOM register.",
        icon: PackagePlus,
        tone: "blue" as const,
      },
      {
        label: "Custom Units",
        value: String(customUnits).padStart(2, "0"),
        detail: "Business-specific UOM entries added under the fixed categories.",
        icon: ScanBarcode,
        tone: "green" as const,
      },
      {
        label: "Active Units",
        value: String(activeUnits).padStart(2, "0"),
        detail: "Units currently available for future product and transaction assignment.",
        icon: WalletCards,
        tone: "violet" as const,
      },
    ];
  }, [categories.length, uomRecords]);

  const visibleCategories = useMemo(
    () => buildVisibleCategories(categories, uomRecords, searchTerm, sortBy),
    [categories, searchTerm, sortBy, uomRecords]
  );
  const selectedCategory = categories.find((category) => category.code === selectedCategoryCode) ?? categories[0];

  function clearFeedback() {
    setServerError(null);
    setDialogError(null);
  }

  function openCreateMode(categoryCode: UomCategoryCode) {
    clearFeedback();
    setSelectedCategoryCode(categoryCode);
    setCreateMode(true);
  }

  async function handleCreate(form: UomFormValues, stayInCreateMode: boolean) {
    setIsSubmitting(true);
    clearFeedback();

    try {
      const payload = await requestJson<UomRecord>("/api/accounting/uom", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setUomRecords((current) => [payload.data, ...current]);
      setSuccessMessage(payload.message || "UOM created.");

      if (!stayInCreateMode) {
        setCreateMode(false);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create UOM.";
      setServerError(message);
      setDialogError(message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(
    id: string,
    form: Pick<UomRecord, "name" | "ratioToBase" | "smallestAllowedQty" | "isActive">
  ) {
    setIsSubmitting(true);
    clearFeedback();

    try {
      const payload = await requestJson<UomRecord>("/api/accounting/uom", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          ...form,
        }),
      });

      setUomRecords((current) =>
        current.map((item) => (item.id === payload.data.id ? payload.data : item))
      );
      setSuccessMessage(payload.message || "UOM updated.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update UOM.";
      setServerError(message);
      setDialogError(message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createMode) {
    return (
      <>
        <div ref={topSectionRef}>
          <AccountingPageIntro
            eyebrow="INVENTORY / UOM / CREATE"
            title={`${selectedCategory?.name || "UOM"} Category`}
            description={`Add a new unit under ${selectedCategory?.name || "the selected category"} by comparing it against the base unit ${
              selectedCategory?.baseUnit || "already defined in the system"
            }. The existing rows stay visible below so the ratio is easy to understand before you save.`}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateMode(false)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="submit"
                  form={CREATE_FORM_ID}
                  data-intent="create"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Creating..." : "Create UOM"}
                </button>
                <button
                  type="submit"
                  form={CREATE_FORM_ID}
                  data-intent="create-and-next"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1f9f75] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#177a5a] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Creating..." : "Create and Next"}
                </button>
              </div>
            }
          />
        </div>
        <UomFormPanel
          key={selectedCategoryCode}
          formId={CREATE_FORM_ID}
          categoryCode={selectedCategoryCode}
          existingUoms={uomRecords}
          currentUserName={currentUserName}
          serverError={serverError}
          isSubmitting={isSubmitting}
          onCreate={(form) => handleCreate(form, false)}
          onCreateAndNext={(form) => handleCreate(form, true)}
          onUpdate={handleUpdate}
        />
        {successMessage ? (
          <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
        ) : null}
        {dialogError ? <ErrorDialog message={dialogError} onClose={() => setDialogError(null)} /> : null}
      </>
    );
  }

  return (
    <>
      <div ref={topSectionRef}>
        <AccountingPageIntro
          eyebrow="INVENTORY / UOM"
          title="UOM Forms"
          description="Manage fixed unit categories and the custom units used later across product, purchase, stock, and reporting flows. Add new rows directly from the category you want to extend."
        />
      </div>

      <PremiumMetricGrid items={metrics} />

      <SurfaceCard
        title="UOM Category Register"
        description="Fixed categories are seeded by the system. Users can extend each category by adding practical business units under the same base."
      >
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-[20px] border border-[#e9e1d8] bg-[#fffaf5] px-4 py-3 xl:grid-cols-[1.3fr_0.7fr]">
            <label className="relative block">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by category, base unit, or custom unit"
                className="w-full rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
            <div>
              <FilterSelect
                value={sortBy}
                onChange={setSortBy}
                options={sortOptions}
                placeholder="Sort categories"
              />
            </div>
          </div>

          {loadError ? (
            <div className="rounded-[20px] border border-[#f0d4ca] bg-[linear-gradient(180deg,#fffdfa_0%,#fff4f1_100%)] px-4 py-5">
              <p className="text-base font-semibold text-[#1f1d1c]">Unable to load UOM data.</p>
              <p className="mt-2 text-sm text-[#7a6359]">{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  void loadUomData();
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
              >
                Retry
              </button>
            </div>
          ) : null}

          {!loadError && isLoading ? (
            <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
              <p className="text-base font-semibold text-[#1f1d1c]">Loading UOM categories...</p>
              <p className="mt-2 text-sm text-[#786f69]">Reading fixed categories and base units from the accounting database.</p>
            </div>
          ) : null}

          {!loadError && !isLoading && !visibleCategories.length ? (
            <div className="rounded-[20px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
              <p className="text-base font-semibold text-[#1f1d1c]">No UOM categories matched this search.</p>
              <p className="mt-2 text-sm text-[#786f69]">Try a different keyword or clear the filter to view all fixed categories.</p>
            </div>
          ) : null}

          {!loadError && !isLoading
            ? visibleCategories.map(({ category, units }) => {
                const activeCount = units.filter((unit) => unit.isActive).length;
                const customCount = units.filter((unit) => !unit.isSystem).length;

                return (
                  <div
                    key={category.code}
                    className="rounded-[24px] border border-[#e8dfd6] bg-[linear-gradient(180deg,#fffdfa_0%,#fff8f1_100%)] px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#fff0e2] px-3 py-1 text-xs font-semibold text-[#b45b12]">
                            {category.code}
                          </span>
                          <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#315d9b]">
                            Base: {category.baseUnit}
                          </span>
                          <span className="rounded-full bg-[#effaf3] px-3 py-1 text-xs font-semibold text-[#1b7a50]">
                            {activeCount} active
                          </span>
                          {customCount ? (
                            <span className="rounded-full bg-[#f4ecff] px-3 py-1 text-xs font-semibold text-[#7a4bcb]">
                              {customCount} custom
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                          <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">{category.name}</h3>
                          <span className="text-sm text-[#7a7068]">{units.length} units</span>
                        </div>
                      </div>
                      <div className="flex items-center xl:justify-end">
                        <button
                          type="button"
                          onClick={() => openCreateMode(category.code)}
                          className="inline-flex items-center gap-2 rounded-[16px] bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(255,122,18,0.18)] transition hover:-translate-y-0.5 hover:bg-[#ea6a08] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffd7b8]"
                        >
                          <Plus className="h-4 w-4" />
                          Add New Unit
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {units.map((unit) => (
                        <div
                          key={unit.id}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium shadow-[0_8px_18px_rgba(27,24,22,0.05)] ${getUnitChipClasses(unit)}`}
                        >
                          <span className="text-sm font-semibold">{unit.name}</span>
                          {unit.isBase || parseUomDecimal(unit.ratioToBase) === 1 ? (
                            <span className="rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                              Base
                            </span>
                          ) : (
                            <span className="rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                              {deriveUomType(unit.ratioToBase) === "Smaller than base" ? "Smaller" : "Larger"}
                            </span>
                          )}
                          {!unit.isSystem ? (
                            <span className="rounded-full bg-[#1f1d1c] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                              Custom
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            : null}
        </div>
      </SurfaceCard>

      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}
      {dialogError ? <ErrorDialog message={dialogError} onClose={() => setDialogError(null)} /> : null}
    </>
  );
}
