"use client";

// Reports hub — top-level page at /accounting/admin/reports.
//
// Three modes, all in one route (per the user's instruction: no new
// left-nav subsections). State machine:
//
//   "catalog"   → tile grid of every available report, grouped by
//                 category. Click a tile → mode flips to "configure".
//   "configure" → filter form for the selected report. Generate Preview
//                 → mode flips to "preview". Cancel → back to catalog.
//   "preview"   → A4 letterhead preview of the report (mock data this
//                 phase, real API in the next phase). Print + Download
//                 PDF + Download Excel buttons in the action bar.
//
// UI-first: every report renders against SAMPLE_PREVIEWS for now so
// the entire flow is clickable and the design can be approved before
// any backend wiring lands.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  AccountingPageIntro,
  SurfaceCard,
} from "@/components/accounting/accounting-ui";
import {
  REPORT_CATEGORIES,
  REPORTS,
  SAMPLE_PREVIEWS,
  findReport,
  isBackendWired,
  type ReportCategory,
  type ReportCategoryId,
  type ReportDefinition,
  type FilterField,
  type SamplePreview,
} from "./reports-catalog-data";
import { ReportsPreviewShell } from "./reports-preview-shell";
import { ReportPicker, type ReportPickerKind } from "./report-picker";
import { StyledDatePicker } from "@/components/accounting/styled-date-picker";

// ─── Tone styles for category tiles & cards ────────────────────────────

const TONE_STYLES = {
  amber: {
    pill: "border-[#ffd6b8] bg-[#fff5ec] text-[#bb5c12]",
    activePill: "border-[#ff7a12] bg-[#ff7a12] text-white shadow-[0_8px_18px_rgba(255,122,18,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#ffb67d_0%,#ff7a12_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#ff8b2b_0%,#ffd4ad_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#fffaf5_100%)]",
    cardBorder: "border-[#f1dcc4]",
  },
  blue: {
    pill: "border-[#cfe0ff] bg-[#f6faff] text-[#2758b7]",
    activePill: "border-[#2d6df6] bg-[#2d6df6] text-white shadow-[0_8px_18px_rgba(45,109,246,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#67a6ff_0%,#2d6df6_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#4c84ff_0%,#cfe0ff_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)]",
    cardBorder: "border-[#dde8ff]",
  },
  rose: {
    pill: "border-[#ffd0d4] bg-[#fff4f5] text-[#b3344e]",
    activePill: "border-[#e6395a] bg-[#e6395a] text-white shadow-[0_8px_18px_rgba(230,57,90,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#ff7a8e_0%,#e6395a_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#ff5e76_0%,#ffd0d4_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#fff7f8_100%)]",
    cardBorder: "border-[#f6dbe0]",
  },
  violet: {
    pill: "border-[#decfff] bg-[#f7f3ff] text-[#6c34cb]",
    activePill: "border-[#7e3eff] bg-[#7e3eff] text-white shadow-[0_8px_18px_rgba(126,62,255,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#b381ff_0%,#7e3eff_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#9c61ff_0%,#dfd0ff_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#faf6ff_100%)]",
    cardBorder: "border-[#e7dcff]",
  },
  sky: {
    pill: "border-[#c2e7f7] bg-[#f1faff] text-[#0c6c95]",
    activePill: "border-[#0c92cc] bg-[#0c92cc] text-white shadow-[0_8px_18px_rgba(12,146,204,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#5dc4eb_0%,#0c92cc_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#43a8d6_0%,#c2e7f7_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#f6fbfd_100%)]",
    cardBorder: "border-[#d6ebf5]",
  },
  green: {
    pill: "border-[#ccebdc] bg-[#f3faf5] text-[#1c7b52]",
    activePill: "border-[#18a66a] bg-[#18a66a] text-white shadow-[0_8px_18px_rgba(24,166,106,0.25)]",
    iconBg: "bg-[linear-gradient(145deg,#58c98f_0%,#18a66a_100%)]",
    cardRail: "bg-[linear-gradient(90deg,#30b77a_0%,#c6efd8_100%)]",
    cardBg: "bg-[linear-gradient(180deg,#ffffff_0%,#f7fbf8_100%)]",
    cardBorder: "border-[#dfeee6]",
  },
} as const;

// ─── Local state ───────────────────────────────────────────────────────

type Mode =
  | { kind: "catalog" }
  | { kind: "configure"; reportId: string }
  | {
      kind: "preview";
      reportId: string;
      filterValues: Record<string, string>;
      // Parallel map of display labels — set by async pickers when the
      // user picks an option. The configure form stores IDs in
      // filterValues (those go to the API as query params); labels go
      // into the preview meta band + filter chips so the user sees
      // "Customer: PW Client Alpha" instead of "Customer: cmovwu…".
      filterLabels: Record<string, string>;
      generatedAt: Date;
    };

// ─── Main screen ───────────────────────────────────────────────────────

export function ReportsHubScreen() {
  const [mode, setMode] = useState<Mode>({ kind: "catalog" });
  // "ALL" + each category id
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId | "ALL">(
    "ALL",
  );
  const [searchTerm, setSearchTerm] = useState("");

  if (mode.kind === "catalog") {
    return (
      <CatalogView
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onPickReport={(reportId) => setMode({ kind: "configure", reportId })}
      />
    );
  }

  if (mode.kind === "configure") {
    const report = findReport(mode.reportId);
    if (!report) {
      return (
        <CatalogView
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onPickReport={(reportId) => setMode({ kind: "configure", reportId })}
        />
      );
    }
    return (
      <ConfigureView
        report={report}
        onCancel={() => setMode({ kind: "catalog" })}
        onGenerate={(filterValues, filterLabels) =>
          setMode({
            kind: "preview",
            reportId: report.id,
            filterValues,
            filterLabels,
            generatedAt: new Date(),
          })
        }
      />
    );
  }

  // mode.kind === "preview"
  const report = findReport(mode.reportId);
  if (!report) {
    setMode({ kind: "catalog" });
    return null;
  }
  return (
    <PreviewView
      report={report}
      filterValues={mode.filterValues}
      filterLabels={mode.filterLabels}
      generatedAt={mode.generatedAt}
      onBack={() => setMode({ kind: "configure", reportId: report.id })}
      onBackToCatalog={() => setMode({ kind: "catalog" })}
    />
  );
}

// ─── Catalog view ──────────────────────────────────────────────────────

function CatalogView({
  activeCategory,
  setActiveCategory,
  searchTerm,
  setSearchTerm,
  onPickReport,
}: {
  activeCategory: ReportCategoryId | "ALL";
  setActiveCategory: (c: ReportCategoryId | "ALL") => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  onPickReport: (id: string) => void;
}) {
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return REPORTS.filter((r) => {
      if (activeCategory !== "ALL" && r.category !== activeCategory) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term)
      );
    });
  }, [activeCategory, searchTerm]);

  return (
    <>
      <AccountingPageIntro
        eyebrow="Reports"
        title="Every accounting and operations report — one hub, one letterhead."
        description="Pick a report below, set the filters, preview as A4 with our letterhead, then export as PDF or Excel. POS history, customer / supplier statements, journal entries, trial balance, profit & loss, stock movements — all here."
      />

      {/* Top toolbar — search + category pills */}
      <SurfaceCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a59889]" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reports — POS, aging, journal, P&L…"
              className="h-11 w-full rounded-xl border border-[#e2d8cf] bg-white pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <CategoryPill
              label="All reports"
              icon={null}
              active={activeCategory === "ALL"}
              onClick={() => setActiveCategory("ALL")}
              tone="amber"
            />
            {REPORT_CATEGORIES.map((cat) => (
              <CategoryPill
                key={cat.id}
                label={cat.label}
                icon={<cat.icon className="h-3.5 w-3.5" />}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                tone={cat.tone}
              />
            ))}
          </div>
        </div>
      </SurfaceCard>

      {/* Tiles, grouped by category */}
      {activeCategory === "ALL" ? (
        REPORT_CATEGORIES.map((cat) => {
          const reportsInCat = filtered.filter((r) => r.category === cat.id);
          if (reportsInCat.length === 0) return null;
          return (
            <CategorySection
              key={cat.id}
              category={cat}
              reports={reportsInCat}
              onPickReport={onPickReport}
            />
          );
        })
      ) : (
        <CategorySection
          category={REPORT_CATEGORIES.find((c) => c.id === activeCategory)!}
          reports={filtered}
          onPickReport={onPickReport}
        />
      )}

      {filtered.length === 0 ? (
        <SurfaceCard>
          <div className="rounded-2xl border border-dashed border-[#e0d5cc] bg-[#fffaf5] py-12 text-center text-sm text-[#9b7a61]">
            No reports match {searchTerm ? `"${searchTerm}"` : "this filter"} yet.
          </div>
        </SurfaceCard>
      ) : null}
    </>
  );
}

function CategoryPill({
  label,
  icon,
  active,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone: ReportCategory["tone"];
}) {
  const t = TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
        active ? t.activePill : `${t.pill} hover:brightness-105`
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CategorySection({
  category,
  reports,
  onPickReport,
}: {
  category: ReportCategory;
  reports: ReportDefinition[];
  onPickReport: (id: string) => void;
}) {
  const t = TONE_STYLES[category.tone];
  const Icon = category.icon;

  return (
    <SurfaceCard>
      <div className="mb-4 flex items-start gap-3">
        <div className={`shrink-0 rounded-2xl p-2.5 text-white ${t.iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-sans text-lg font-semibold tracking-[-0.02em] text-[#1f1d1c]">
            {category.label}
          </h2>
          <p className="text-sm text-[#7b736d]">{category.description}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <ReportTile
            key={r.id}
            report={r}
            tone={category.tone}
            onClick={() => onPickReport(r.id)}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}

function ReportTile({
  report,
  tone,
  onClick,
}: {
  report: ReportDefinition;
  tone: ReportCategory["tone"];
  onClick: () => void;
}) {
  const t = TONE_STYLES[tone];
  const Icon = report.icon;
  const disabled = report.status === "soon";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex flex-col items-stretch overflow-hidden rounded-[20px] border p-4 text-left transition ${t.cardBorder} ${t.cardBg} ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(27,24,22,0.08)]"
      }`}
    >
      <div className={`absolute inset-x-4 top-0 h-1 rounded-b-full ${t.cardRail}`} />
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2 text-white ${t.iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        {disabled ? (
          <span className="rounded-full border border-[#dad3cc] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
            Soon
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 text-[#9a8f85] transition group-hover:translate-x-0.5 group-hover:text-[#ff7a12]" />
        )}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[#1f1d1c]">
        {report.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7b736d]">
        {report.description}
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        {report.exportFormats.map((fmt) => (
          <span
            key={fmt}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              fmt === "EXCEL"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[#e2d8cf] bg-white text-[#7b736d]"
            }`}
          >
            {fmt === "EXCEL" ? <FileSpreadsheet className="h-3 w-3" /> : null}
            {fmt}
          </span>
        ))}
      </div>
    </button>
  );
}

// ─── Configure view (filter form) ──────────────────────────────────────

function ConfigureView({
  report,
  onCancel,
  onGenerate,
}: {
  report: ReportDefinition;
  onCancel: () => void;
  onGenerate: (
    filterValues: Record<string, string>,
    filterLabels: Record<string, string>,
  ) => void;
}) {
  // Initialise each filter to its default. UI-first stub: just keep
  // string values everywhere.
  const initialValues: Record<string, string> = {};
  for (const f of report.filters) {
    if (f.kind === "options") {
      initialValues[f.key] = f.defaultValue ?? f.options[0]?.value ?? "";
    } else {
      // All async pickers (branch/customer/supplier/account/product)
      // + as-of + date-range start with no value. The picker shows
      // "All X" as the default label; the API endpoints already
      // treat empty/"ALL" the same way.
      initialValues[f.key] = "";
    }
  }
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  // Parallel display-label map for async pickers (Customer, Supplier,
  // Account, Product, Branch). Surface IDs to the API; surface labels
  // to the preview meta band + filter chips.
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Validation hint: required pickers (Customer Statement, Supplier
  // Statement, Account Ledger) can't be left blank.
  const [showValidation, setShowValidation] = useState(false);

  const cat = REPORT_CATEGORIES.find((c) => c.id === report.category)!;
  const t = TONE_STYLES[cat.tone];
  const Icon = report.icon;

  function setValue(key: string, value: string, label?: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (label !== undefined) {
      setLabels((prev) => ({ ...prev, [key]: label }));
    }
  }

  // Required-field check: any picker with `required: true` must have
  // a value (id) before we let the user generate the preview.
  const missingRequired = report.filters.filter((f) => {
    if (!("required" in f) || !f.required) return false;
    return !values[f.key];
  });

  function handleGenerate() {
    if (missingRequired.length > 0) {
      setShowValidation(true);
      return;
    }
    onGenerate(values, labels);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all reports
        </button>
        <span className="rounded-full border border-[#dad3cc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b736d]">
          {cat.label}
        </span>
      </div>

      <SurfaceCard>
        <div className="flex items-start gap-4">
          <div className={`shrink-0 rounded-2xl p-3 text-white ${t.iconBg}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-sans text-2xl font-semibold tracking-[-0.02em] text-[#1f1d1c]">
              {report.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#6f6861]">
              {report.description}
            </p>
            {report.configureNote ? (
              <div className="mt-3 inline-flex items-start gap-2 rounded-xl border border-[#ffe2c7] bg-[#fff8ef] px-3 py-2 text-xs leading-5 text-[#a25b14]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {report.configureNote}
              </div>
            ) : null}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title="Filters"
        description="Set the filters and click Generate Preview to see the report."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {report.filters.map((field) => (
            <FilterControl
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              displayLabel={labels[field.key]}
              showValidation={showValidation}
              onChange={(v, label) => setValue(field.key, v, label)}
            />
          ))}
        </div>

        {showValidation && missingRequired.length > 0 ? (
          <div className="mt-4 rounded-xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            Please pick a value for the required fields:{" "}
            {missingRequired.map((f) => f.label).join(", ")}.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#f0e8e0] pt-5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          {report.exportFormats.includes("EXCEL") ? (
            <button
              type="button"
              onClick={() => {
                /* UI-first: Excel export not wired yet */
                handleGenerate();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[#0f6b3b] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f6b3b] transition hover:bg-[#f3faf5]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            <Filter className="h-4 w-4" />
            Generate Preview
          </button>
        </div>
      </SurfaceCard>
    </>
  );
}

// ─── Filter controls ───────────────────────────────────────────────────

function FilterControl({
  field,
  value,
  displayLabel,
  showValidation,
  onChange,
}: {
  field: FilterField;
  value: string;
  displayLabel?: string;
  showValidation: boolean;
  onChange: (v: string, label?: string) => void;
}) {
  if (field.kind === "date-range") {
    // Stored as "YYYY-MM-DD..YYYY-MM-DD"; two custom date pickers
    // share that single string.
    const [from = "", to = ""] = value.split("..");
    return (
      <div>
        <FilterLabel icon={<CalendarRange className="h-3.5 w-3.5" />}>
          {field.label}
        </FilterLabel>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1">
            <StyledDatePicker
              value={from}
              onChange={(v) => onChange(`${v}..${to}`)}
              placeholder="From"
              allowClear
            />
          </div>
          <span className="text-xs font-medium text-[#9a8f85]">to</span>
          <div className="flex-1">
            <StyledDatePicker
              value={to}
              onChange={(v) => onChange(`${from}..${v}`)}
              placeholder="To"
              allowClear
            />
          </div>
        </div>
      </div>
    );
  }

  if (field.kind === "as-of") {
    return (
      <div>
        <FilterLabel icon={<CalendarRange className="h-3.5 w-3.5" />}>
          {field.label}
        </FilterLabel>
        <div className="mt-1.5">
          <StyledDatePicker
            value={value}
            onChange={onChange}
            placeholder="Pick an as-of date"
            allowClear
          />
        </div>
      </div>
    );
  }

  if (field.kind === "options") {
    return (
      <div>
        <FilterLabel icon={<Filter className="h-3.5 w-3.5" />}>
          {field.label}
        </FilterLabel>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value, opt.label)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-[#ff7a12] bg-[#ff7a12] text-white"
                    : "border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Async pickers — branch, customer, supplier, account, product —
  // all share the same UI (ReportPicker), differing only by which
  // option endpoint they hit. `allowAll` is true unless the field is
  // marked required (Customer Statement, Supplier Statement, Account
  // Ledger).
  const pickerKind: ReportPickerKind | null =
    field.kind === "branch"
      ? "branch"
      : field.kind === "customer"
        ? "customer"
        : field.kind === "supplier"
          ? "supplier"
          : field.kind === "account"
            ? "account"
            : field.kind === "product"
              ? "product"
              : null;

  if (pickerKind) {
    const isRequired = "required" in field && field.required === true;
    const Icon =
      pickerKind === "branch"
        ? Building2
        : pickerKind === "account"
          ? Filter
          : Search;
    return (
      <div>
        <FilterLabel icon={<Icon className="h-3.5 w-3.5" />}>
          {field.label}
          {isRequired ? <span className="ml-1 text-[#e6395a]">*</span> : null}
        </FilterLabel>
        <div className="mt-1.5">
          <ReportPicker
            kind={pickerKind}
            value={value}
            displayLabel={displayLabel}
            onChange={onChange}
            allowAll={!isRequired}
            required={isRequired && showValidation}
          />
        </div>
      </div>
    );
  }

  // Plain text fallback (the only remaining FilterField kind is
  // `text`).
  return (
    <div>
      <FilterLabel icon={<Search className="h-3.5 w-3.5" />}>
        {field.label}
      </FilterLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.kind === "text" ? (field.placeholder ?? "") : ""}
        className="mt-1.5 h-11 w-full rounded-xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ff7a12]"
      />
    </div>
  );
}

function FilterLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a8f85]">
      {icon}
      {children}
    </div>
  );
}

// ─── Preview view ──────────────────────────────────────────────────────

function PreviewView({
  report,
  filterValues,
  filterLabels,
  generatedAt,
  onBack,
  onBackToCatalog,
}: {
  report: ReportDefinition;
  filterValues: Record<string, string>;
  filterLabels: Record<string, string>;
  generatedAt: Date;
  onBack: () => void;
  onBackToCatalog: () => void;
}) {
  // For backend-wired reports we fetch from the API; for the rest we
  // fall back to mock SAMPLE_PREVIEWS until that report's endpoint
  // lands. The fetched payload uses the same shape as SamplePreview
  // so the preview shell needs no branching logic.
  const wired = isBackendWired(report.id);

  const [payload, setPayload] = useState<SamplePreview | null>(
    wired ? null : (SAMPLE_PREVIEWS[report.id] ?? null),
  );
  const [loading, setLoading] = useState<boolean>(wired);
  const [error, setError] = useState<string | null>(null);

  // Build query string from filter values — pass everything through;
  // each endpoint validates / ignores what it doesn't care about.
  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filterValues)) {
      if (v && v.trim()) sp.set(k, v);
    }
    return sp.toString();
  }, [filterValues]);

  useEffect(() => {
    if (!wired) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/accounting/reports/${report.id}?${queryString}`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (r) => {
        if (cancelled) return;
        const j = (await r.json()) as {
          success: boolean;
          data: SamplePreview | null;
          message?: string;
        };
        if (j.success && j.data) {
          setPayload(j.data);
        } else {
          setError(j.message || "Failed to generate report.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error while generating the report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wired, report.id, queryString]);

  // Build human-readable filter chips from the filter form values.
  // For async pickers (customer/supplier/account/product/branch),
  // prefer the cached display label over the raw id.
  const filterChips: Array<{ label: string; value: string }> = [];
  for (const f of report.filters) {
    const v = filterValues[f.key];
    if (!v) continue;
    if (f.kind === "date-range") {
      const [from, to] = v.split("..");
      if (from || to) {
        filterChips.push({
          label: f.label,
          value: `${from || "—"} → ${to || "—"}`,
        });
      }
    } else if (f.kind === "options") {
      const opt = f.options.find((o) => o.value === v);
      if (opt && v !== "ALL") filterChips.push({ label: f.label, value: opt.label });
    } else if (v && v !== "ALL") {
      // Async picker — show the cached display label, falling back to
      // the raw id if for some reason we don't have one.
      const label = filterLabels[f.key] ?? v;
      filterChips.push({ label: f.label, value: label });
    }
  }

  // Always show the "Generated by" chip so the meta band isn't empty
  // when the user runs the report with default filters.
  if (filterChips.length === 0) {
    filterChips.push({ label: "Filters", value: "Default (all data)" });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-xs font-semibold text-[#7b736d] transition hover:bg-[#fff7f0]"
          >
            All reports
          </button>
          <span className="text-xs text-[#9a8f85]">/</span>
          <span className="text-xs font-semibold text-[#5f5750]">
            {report.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!wired ? (
            <span className="rounded-full border border-[#ffe2c7] bg-[#fff8ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a25b14]">
              Sample data
            </span>
          ) : null}
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {wired ? "Live data" : "Preview"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-3 rounded-3xl border border-[#e2d8cf] bg-white py-16 text-sm text-[#7f756f] shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
          Loading report data…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          {error}
        </div>
      ) : (
        <ReportsPreviewShell
          report={report}
          filterChips={filterChips}
          reportMeta={payload?.meta}
          columns={payload?.columns ?? []}
          align={payload?.align}
          rows={payload?.rows ?? []}
          rowStyles={payload?.rowStyles}
          totals={payload?.totals}
          generatedAt={generatedAt}
          onBack={onBack}
        />
      )}
    </>
  );
}
