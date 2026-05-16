// Catalog of all reports available inside `/accounting/admin/reports`.
//
// UI-first: every entry has the metadata the hub needs to render the
// catalog tile, the configure-mode filter form, and the preview shell
// header. Backend wiring (real data fetch + Excel/PDF export) lands in
// the next phase — `status: "ready"` reports show a sample preview
// with mock rows so the UX can be approved; `status: "soon"` reports
// render a "Coming soon" placeholder.
//
// New reports get added here, not as new routes — the hub stays inside
// the existing single Reports nav entry per the user's instruction
// ("no new subsections in the left navigation bar").

import type { ComponentType } from "react";
import {
  BadgeDollarSign,
  Banknote,
  BookOpen,
  Boxes,
  CalendarRange,
  ClipboardList,
  Coins,
  CreditCard,
  FileBarChart,
  FileSpreadsheet,
  HandCoins,
  LineChart,
  Notebook,
  PackageSearch,
  Receipt,
  ScrollText,
  ShoppingBasket,
  Truck,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";

// ─── Categories ───────────────────────────────────────────────────────────

export type ReportCategoryId =
  | "sales-pos"
  | "receivables"
  | "payables"
  | "general-ledger"
  | "inventory"
  | "profitability";

export type ReportCategory = {
  id: ReportCategoryId;
  label: string;
  description: string;
  // Lucide icon used in the category pill (top of the catalog).
  icon: ComponentType<{ className?: string }>;
  // Soft accent colour used by the tile rail + icon background.
  tone: "amber" | "blue" | "green" | "violet" | "rose" | "sky";
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "sales-pos",
    label: "Sales & POS",
    description: "POS counter activity and invoice-side sales registers.",
    icon: ShoppingBasket,
    tone: "amber",
  },
  {
    id: "receivables",
    label: "Receivables",
    description: "What customers owe — aging, statements, receipts.",
    icon: Wallet,
    tone: "blue",
  },
  {
    id: "payables",
    label: "Payables",
    description: "What we owe suppliers — aging, statements, vouchers.",
    icon: HandCoins,
    tone: "rose",
  },
  {
    id: "general-ledger",
    label: "General Ledger",
    description: "Journal entries, account ledgers, trial balance.",
    icon: BookOpen,
    tone: "violet",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock snapshot and movement registers.",
    icon: Boxes,
    tone: "sky",
  },
  {
    id: "profitability",
    label: "Profitability",
    description: "P&L and revenue mix slices.",
    icon: TrendingUp,
    tone: "green",
  },
];

// ─── Filter schema ────────────────────────────────────────────────────────
//
// Each report declares its filter form as a list of FilterField rows.
// Configure mode renders these in a 2-column grid. Backend wiring
// later reads the same shape to decide which query params to send.

export type FilterField =
  | { kind: "date-range"; key: string; label: string }
  | { kind: "as-of"; key: string; label: string }
  | { kind: "branch"; key: string; label: string; allOption?: boolean }
  | { kind: "customer"; key: string; label: string; required?: boolean }
  | { kind: "supplier"; key: string; label: string; required?: boolean }
  | { kind: "account"; key: string; label: string; required?: boolean }
  | { kind: "product"; key: string; label: string }
  | {
      kind: "options";
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      defaultValue?: string;
    }
  | { kind: "text"; key: string; label: string; placeholder?: string };

// ─── Report definitions ───────────────────────────────────────────────────

export type ExportFormat = "PDF" | "EXCEL";

export type ReportDefinition = {
  id: string;
  category: ReportCategoryId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  // "ready" → tile is clickable, configure + preview wired with mock data
  // "soon" → tile shows "Coming soon" badge and is disabled.
  status: "ready" | "soon";
  // Letterhead eyebrow text on the preview header.
  previewEyebrow: string;
  // Subtitle on the preview header (the big bold line).
  previewSubtitle: string;
  // Available export buttons on the preview action bar.
  exportFormats: ExportFormat[];
  // Filter form definition (configure mode).
  filters: FilterField[];
  // Optional notes shown above the filter form.
  configureNote?: string;
};

const COMMON_BRANCH: FilterField = {
  kind: "branch",
  key: "storeId",
  label: "Branch",
  allOption: true,
};

const COMMON_DATE_RANGE: FilterField = {
  kind: "date-range",
  key: "dateRange",
  label: "Date range",
};

// Reports list — grouped logically by category. Order inside a
// category matters: it controls the catalog tile order.
export const REPORTS: ReportDefinition[] = [
  // ─── Sales & POS ─────────────────────────────────────────────────
  {
    id: "pos-bill-history",
    category: "sales-pos",
    title: "POS Bill History",
    description:
      "Every COMPLETED POS bill in a date range, with method, customer, cashier, and total.",
    icon: Receipt,
    status: "ready",
    previewEyebrow: "Sales Report",
    previewSubtitle: "POS Bill History",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      {
        kind: "options",
        key: "method",
        label: "Payment method",
        options: [
          { value: "ALL", label: "All methods" },
          { value: "CASH", label: "Cash" },
          { value: "CARD", label: "Card" },
          { value: "MIXED", label: "Mixed" },
          { value: "SPLIT", label: "Split (merchant)" },
        ],
        defaultValue: "ALL",
      },
      { kind: "customer", key: "customerId", label: "Customer (optional)" },
    ],
  },
  {
    id: "pos-sales-summary",
    category: "sales-pos",
    title: "POS Sales Summary",
    description:
      "Daily POS turnover grouped by branch and tender method — net sales, refunds, count of bills.",
    icon: BadgeDollarSign,
    status: "ready",
    previewEyebrow: "Sales Report",
    previewSubtitle: "POS Sales Summary",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      {
        kind: "options",
        key: "groupBy",
        label: "Group by",
        options: [
          { value: "DAY", label: "Day" },
          { value: "METHOD", label: "Tender method" },
          { value: "CASHIER", label: "Cashier" },
        ],
        defaultValue: "DAY",
      },
    ],
  },
  {
    id: "invoice-sales-register",
    category: "sales-pos",
    title: "Invoice Sales Register",
    description:
      "All approved invoices in a date range, with customer, amounts, and current outstanding balance.",
    icon: ScrollText,
    status: "ready",
    previewEyebrow: "Sales Report",
    previewSubtitle: "Invoice Sales Register",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      { kind: "customer", key: "customerId", label: "Customer (optional)" },
      {
        kind: "options",
        key: "status",
        label: "Status",
        options: [
          { value: "ALL", label: "All" },
          { value: "APPROVED", label: "Approved only" },
          { value: "DRAFT", label: "Draft only" },
        ],
        defaultValue: "APPROVED",
      },
    ],
  },
  {
    id: "customer-returns-register",
    category: "sales-pos",
    title: "Customer Returns Register",
    description:
      "Approved customer returns (SR) — invoice / POS source, returned qty, value reversed.",
    icon: Undo2,
    status: "ready",
    previewEyebrow: "Sales Report",
    previewSubtitle: "Customer Returns Register",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      { kind: "customer", key: "customerId", label: "Customer (optional)" },
      {
        kind: "options",
        key: "sourceType",
        label: "Source",
        options: [
          { value: "ALL", label: "All sources" },
          { value: "INVOICE", label: "Invoice returns" },
          { value: "POS_BILL", label: "POS bill returns" },
        ],
        defaultValue: "ALL",
      },
    ],
  },

  // ─── Receivables ─────────────────────────────────────────────────
  {
    id: "customer-aging",
    category: "receivables",
    title: "Customer Aging Report",
    description:
      "Outstanding receivables bucketed 0–30 / 31–60 / 61–90 / 90+ days as of a date.",
    icon: CalendarRange,
    status: "ready",
    previewEyebrow: "Receivables Report",
    previewSubtitle: "Customer Aging",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "as-of", key: "asOfDate", label: "As of date" },
      { kind: "customer", key: "customerId", label: "Customer (optional)" },
      {
        kind: "options",
        key: "minBucket",
        label: "Show buckets",
        options: [
          { value: "ALL", label: "All buckets" },
          { value: "OVER_30", label: "Over 30 days only" },
          { value: "OVER_60", label: "Over 60 days only" },
        ],
        defaultValue: "ALL",
      },
    ],
  },
  {
    id: "customer-statement",
    category: "receivables",
    title: "Customer Statement",
    description:
      "Per-customer transaction history — invoices, receipts, returns — with running balance.",
    icon: Notebook,
    status: "ready",
    previewEyebrow: "Receivables Report",
    previewSubtitle: "Customer Statement",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "customer", key: "customerId", label: "Customer", required: true },
      COMMON_DATE_RANGE,
    ],
  },
  {
    id: "customer-payment-receipts",
    category: "receivables",
    title: "Customer Payment Receipts Register",
    description:
      "All approved customer payment receipts (RC) in a date range — with allocations breakdown.",
    icon: BadgeDollarSign,
    status: "ready",
    previewEyebrow: "Receivables Report",
    previewSubtitle: "Customer Payment Receipts",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      { kind: "customer", key: "customerId", label: "Customer (optional)" },
    ],
  },

  // ─── Payables ────────────────────────────────────────────────────
  {
    id: "supplier-aging",
    category: "payables",
    title: "Supplier Aging Report",
    description:
      "Outstanding payables bucketed by age as of a date — same shape as customer aging, supplier side.",
    icon: CalendarRange,
    status: "ready",
    previewEyebrow: "Payables Report",
    previewSubtitle: "Supplier Aging",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "as-of", key: "asOfDate", label: "As of date" },
      { kind: "supplier", key: "supplierId", label: "Supplier (optional)" },
    ],
  },
  {
    id: "supplier-statement",
    category: "payables",
    title: "Supplier Statement",
    description:
      "Per-supplier transaction history — GRN, returns, payment vouchers — with running balance.",
    icon: Notebook,
    status: "ready",
    previewEyebrow: "Payables Report",
    previewSubtitle: "Supplier Statement",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "supplier", key: "supplierId", label: "Supplier", required: true },
      COMMON_DATE_RANGE,
    ],
  },
  {
    id: "supplier-payment-vouchers",
    category: "payables",
    title: "Supplier Payment Vouchers Register",
    description:
      "All approved supplier payment vouchers (PV) in a date range, with allocations.",
    icon: Banknote,
    status: "ready",
    previewEyebrow: "Payables Report",
    previewSubtitle: "Supplier Payment Vouchers",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      { kind: "supplier", key: "supplierId", label: "Supplier (optional)" },
    ],
  },

  // ─── General Ledger ──────────────────────────────────────────────
  {
    id: "journal-entries",
    category: "general-ledger",
    title: "Journal Entries Report",
    description:
      "Every journal entry grouped by document number, with per-JE Dr/Cr subtotals. Filterable by account, doc type, or specific JE number.",
    icon: ClipboardList,
    status: "ready",
    previewEyebrow: "General Ledger",
    previewSubtitle: "Journal Entries Report",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      {
        kind: "text",
        key: "jeNo",
        label: "JE number (optional)",
        placeholder: "e.g. INV-2026-0001",
      },
      { kind: "account", key: "accountId", label: "Account (optional)" },
      {
        kind: "options",
        key: "docType",
        label: "Document type",
        options: [
          { value: "ALL", label: "All types" },
          { value: "INV", label: "INV — Invoice" },
          { value: "RC", label: "RC — Customer Receipt" },
          { value: "SR", label: "SR — Customer Return" },
          { value: "PV", label: "PV — Supplier Payment" },
          { value: "GRN", label: "GRN — Goods Received" },
          { value: "GRR", label: "GRR — Goods Return" },
          { value: "POS", label: "POS — Counter Bill" },
          { value: "EXP", label: "EXP — Expense Voucher" },
          { value: "JEV", label: "JEV — Journal Entry Voucher" },
          { value: "MIN", label: "MIN — Material Issue Note" },
        ],
        defaultValue: "ALL",
      },
      COMMON_BRANCH,
    ],
  },
  {
    id: "trial-balance",
    category: "general-ledger",
    title: "Trial Balance",
    description:
      "Account-wise debit and credit totals as of a date. Final test that the books balance.",
    icon: FileBarChart,
    status: "ready",
    previewEyebrow: "General Ledger",
    previewSubtitle: "Trial Balance",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "as-of", key: "asOfDate", label: "As of date" },
      COMMON_BRANCH,
      {
        kind: "options",
        key: "rollup",
        label: "Roll up",
        options: [
          { value: "ACCOUNT", label: "Account level" },
          { value: "TYPE", label: "Account type level" },
          { value: "CATEGORY", label: "Category level" },
        ],
        defaultValue: "ACCOUNT",
      },
    ],
  },
  {
    id: "account-ledger",
    category: "general-ledger",
    title: "Account Ledger",
    description:
      "Per-account chronological view — opening balance, every posting in the period, closing balance.",
    icon: Notebook,
    status: "ready",
    previewEyebrow: "General Ledger",
    previewSubtitle: "Account Ledger",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      { kind: "account", key: "accountId", label: "Account", required: true },
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
    ],
  },

  // ─── Inventory ───────────────────────────────────────────────────
  {
    id: "stock-report",
    category: "inventory",
    title: "Stock Report",
    description:
      "Per-product on-hand qty + valuation. Already lives at /admin/inventory — surfaced here for one-stop access.",
    icon: PackageSearch,
    status: "ready",
    previewEyebrow: "Inventory Report",
    previewSubtitle: "Stock Report",
    exportFormats: ["PDF", "EXCEL"],
    configureNote:
      "This report is also available from the Inventory section. Same engine, same export — listed here for convenience.",
    filters: [
      COMMON_BRANCH,
      {
        kind: "options",
        key: "statusFilter",
        label: "Stock status",
        options: [
          { value: "ALL", label: "All statuses" },
          { value: "HEALTHY", label: "Healthy only" },
          { value: "LOW", label: "Low stock only" },
          { value: "OUT", label: "Out of stock only" },
        ],
        defaultValue: "ALL",
      },
    ],
  },
  {
    id: "stock-movement-register",
    category: "inventory",
    title: "Stock Movement Register",
    description:
      "Every stock-movement transaction in a date range — GRN, invoice, return, issue — by source.",
    icon: Truck,
    status: "ready",
    previewEyebrow: "Inventory Report",
    previewSubtitle: "Stock Movement Register",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      { kind: "product", key: "productId", label: "Product (optional)" },
      {
        kind: "options",
        key: "source",
        label: "Movement source",
        options: [
          { value: "ALL", label: "All sources" },
          { value: "GRN", label: "GRN" },
          { value: "INVOICE", label: "Invoice (sale)" },
          { value: "POS", label: "POS bill (sale)" },
          { value: "CR", label: "Customer return" },
          { value: "MIN", label: "Material issue note" },
        ],
        defaultValue: "ALL",
      },
    ],
  },
  {
    id: "grn-register",
    category: "inventory",
    title: "GRN Register",
    description:
      "All Goods Received Notes in a date range, with linked PO, supplier, and posted value.",
    icon: ClipboardList,
    status: "ready",
    previewEyebrow: "Inventory Report",
    previewSubtitle: "GRN Register",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      { kind: "supplier", key: "supplierId", label: "Supplier (optional)" },
    ],
  },
  {
    id: "po-register",
    category: "inventory",
    title: "Purchase Order Register",
    description: "All POs in a date range — supplier, status, total, partial-receive progress.",
    icon: FileSpreadsheet,
    status: "ready",
    previewEyebrow: "Inventory Report",
    previewSubtitle: "Purchase Order Register",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      { kind: "supplier", key: "supplierId", label: "Supplier (optional)" },
      {
        kind: "options",
        key: "status",
        label: "Status",
        options: [
          { value: "ALL", label: "All" },
          { value: "OPEN", label: "Open" },
          { value: "PARTIAL", label: "Partial" },
          { value: "CLOSED", label: "Closed" },
          { value: "CANCELLED", label: "Cancelled" },
        ],
        defaultValue: "ALL",
      },
    ],
  },

  // ─── Profitability ───────────────────────────────────────────────
  {
    id: "profit-loss",
    category: "profitability",
    title: "Profit & Loss",
    description:
      "Income, COGS, gross profit, expenses, net profit for a period. Branch-aware.",
    icon: LineChart,
    status: "ready",
    previewEyebrow: "Profitability Report",
    previewSubtitle: "Profit & Loss Statement",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      {
        kind: "options",
        key: "comparison",
        label: "Comparison",
        options: [
          { value: "NONE", label: "Period only" },
          { value: "PRIOR_PERIOD", label: "vs prior period" },
          { value: "PRIOR_YEAR", label: "vs prior year" },
        ],
        defaultValue: "NONE",
      },
    ],
  },
  {
    id: "sales-by-product",
    category: "profitability",
    title: "Sales by Product",
    description:
      "Revenue and gross-margin contribution per product across invoice + POS sales in a period.",
    icon: PackageSearch,
    status: "ready",
    previewEyebrow: "Profitability Report",
    previewSubtitle: "Sales by Product",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      {
        kind: "options",
        key: "salesChannel",
        label: "Channel",
        options: [
          { value: "ALL", label: "All channels" },
          { value: "INVOICE", label: "Invoice only" },
          { value: "POS", label: "POS only" },
        ],
        defaultValue: "ALL",
      },
    ],
  },
  {
    id: "sales-by-customer",
    category: "profitability",
    title: "Sales by Customer",
    description:
      "Top-grossing customers in a period — invoice + POS — with their revenue, returns, and net.",
    icon: Users,
    status: "ready",
    previewEyebrow: "Profitability Report",
    previewSubtitle: "Sales by Customer",
    exportFormats: ["PDF", "EXCEL"],
    filters: [
      COMMON_DATE_RANGE,
      COMMON_BRANCH,
      {
        kind: "options",
        key: "limit",
        label: "Top N",
        options: [
          { value: "20", label: "Top 20" },
          { value: "50", label: "Top 50" },
          { value: "ALL", label: "All customers" },
        ],
        defaultValue: "20",
      },
    ],
  },
];

export function getReportsForCategory(category: ReportCategoryId): ReportDefinition[] {
  return REPORTS.filter((r) => r.category === category);
}

export function findReport(id: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.id === id);
}

// Reports whose `/api/accounting/reports/<id>` endpoint is wired up
// with real data. The hub PreviewView fetches from the endpoint for
// these; for any id NOT in this set it falls back to SAMPLE_PREVIEWS
// so the UX still works while later phases land their backends.
//
// Add a report id here the moment its API route lands.
export const BACKEND_WIRED_REPORTS = new Set<string>([
  // Sales & POS (Phase 1)
  "pos-bill-history",
  "pos-sales-summary",
  "invoice-sales-register",
  "customer-returns-register",
  // Receivables (Phase 2)
  "customer-aging",
  "customer-statement",
  "customer-payment-receipts",
  // Payables (Phase 3)
  "supplier-aging",
  "supplier-statement",
  "supplier-payment-vouchers",
  // General Ledger (Phase 4)
  "journal-entries",
  "trial-balance",
  "account-ledger",
  // Inventory (Phase 5)
  "stock-report",
  "stock-movement-register",
  "grn-register",
  "po-register",
  // Profitability (Phase 6)
  "profit-loss",
  "sales-by-product",
  "sales-by-customer",
]);

export function isBackendWired(id: string): boolean {
  return BACKEND_WIRED_REPORTS.has(id);
}

// ─── Sample / mock preview rows ───────────────────────────────────────────
//
// UI-first stub data: each report gets a small sample dataset so the
// preview shell can be rendered exactly as it'd appear with real
// data, for design approval.

export type SamplePreview = {
  // Column headers (left to right).
  columns: string[];
  // Cell alignment per column. Default "left".
  align?: Array<"left" | "right" | "center">;
  // Rows of cell strings (already formatted; preview shell does no
  // money formatting).
  rows: string[][];
  // Optional per-row visual style (default "normal"). Same length as
  // rows. Used by grouped reports like Journal Entries.
  rowStyles?: Array<"normal" | "header" | "subtotal">;
  // Optional totals card at the bottom-right of the preview.
  totals?: Array<{ label: string; value: string; bold?: boolean }>;
  // Optional meta key/value chips shown above the table (e.g. customer
  // info on a Customer Statement).
  meta?: Array<{ label: string; value: string }>;
};

export const SAMPLE_PREVIEWS: Record<string, SamplePreview> = {
  "pos-bill-history": {
    columns: ["#", "Bill No", "Posted", "Cashier", "Customer", "Method", "Items", "Total"],
    align: ["center", "left", "left", "left", "left", "left", "right", "right"],
    rows: [
      ["1", "POS-2026-00013", "11 May 09:14", "Nimal", "Walk-in", "CASH", "1", "LKR 5,000.00"],
      ["2", "POS-2026-00014", "11 May 10:02", "Nimal", "Walk-in", "CASH", "1", "LKR 5,000.00"],
      ["3", "POS-2026-00015", "11 May 11:38", "Nimal", "PW Client Alpha", "MIXED", "2", "LKR 7,000.00"],
      ["4", "POS-2026-00016", "11 May 12:05", "Sunil", "Walk-in", "CASH", "3", "LKR 3,500.00"],
      ["5", "POS-2026-00017", "11 May 13:42", "Sunil", "PW Client Beta", "SPLIT", "1", "LKR 12,500.00"],
    ],
    totals: [
      { label: "Bills", value: "5" },
      { label: "Cash", value: "LKR 13,500.00" },
      { label: "Mixed", value: "LKR 7,000.00" },
      { label: "Split", value: "LKR 12,500.00" },
      { label: "Total", value: "LKR 33,000.00", bold: true },
    ],
  },
  "pos-sales-summary": {
    columns: ["#", "Date", "Bills", "Cash", "Card", "Mixed", "Split", "Total"],
    align: ["center", "left", "right", "right", "right", "right", "right", "right"],
    rows: [
      ["1", "01 May 2026", "12", "LKR 38,500.00", "LKR 12,000.00", "—", "—", "LKR 50,500.00"],
      ["2", "02 May 2026", "8", "LKR 24,200.00", "—", "LKR 6,500.00", "—", "LKR 30,700.00"],
      ["3", "03 May 2026", "15", "LKR 41,800.00", "LKR 18,500.00", "LKR 4,200.00", "LKR 12,000.00", "LKR 76,500.00"],
      ["4", "04 May 2026", "10", "LKR 27,300.00", "LKR 9,800.00", "—", "—", "LKR 37,100.00"],
    ],
    totals: [
      { label: "Bills", value: "45" },
      { label: "Total", value: "LKR 194,800.00", bold: true },
    ],
  },
  "invoice-sales-register": {
    columns: ["#", "Invoice No", "Date", "Customer", "Branch", "Status", "Net Total", "Outstanding"],
    align: ["center", "left", "left", "left", "left", "left", "right", "right"],
    rows: [
      ["1", "INV-2026-0001", "02 May 2026", "PW Client Alpha", "MAIN-001", "Approved", "LKR 200,000.00", "—"],
      ["2", "INV-2026-0002", "04 May 2026", "PW Client Alpha", "MAIN-001", "Approved", "LKR 170,000.00", "—"],
      ["3", "INV-2026-0003", "06 May 2026", "PW Client Beta", "KAN-002", "Approved", "LKR 88,500.00", "LKR 33,500.00"],
      ["4", "INV-2026-0004", "08 May 2026", "PW Client Alpha", "MAIN-001", "Approved", "LKR 12,250.00", "LKR 12,250.00"],
    ],
    totals: [
      { label: "Invoices", value: "4" },
      { label: "Net Total", value: "LKR 470,750.00", bold: true },
      { label: "Outstanding", value: "LKR 45,750.00" },
    ],
  },
  "customer-returns-register": {
    columns: ["#", "Return No", "Date", "Customer", "Source", "Source No", "Reason", "Net Reversed"],
    align: ["center", "left", "left", "left", "left", "left", "left", "right"],
    rows: [
      ["1", "SR-2026-0001", "10 May 2026", "PW Client Alpha", "INVOICE", "INV-2026-0004", "Damaged", "LKR 1,750.00"],
      ["2", "SR-2026-0002", "10 May 2026", "PW Client Alpha", "INVOICE", "INV-2026-0005", "Wrong item", "LKR 1,000.00"],
      ["3", "SR-2026-0003", "11 May 2026", "Visa Test Merchant", "POS_BILL", "POS-2026-00006", "Excess", "LKR 7,000.00"],
    ],
    totals: [
      { label: "Returns", value: "3" },
      { label: "Net Reversed", value: "LKR 9,750.00", bold: true },
    ],
  },

  "customer-aging": {
    columns: ["#", "Customer", "Current", "1-30", "31-60", "61-90", "Over 90", "Total"],
    align: ["center", "left", "right", "right", "right", "right", "right", "right"],
    rows: [
      ["1", "PW Client Alpha", "LKR 12,250.00", "LKR 33,500.00", "—", "—", "—", "LKR 45,750.00"],
      ["2", "PW Client Beta", "—", "LKR 88,500.00", "LKR 22,000.00", "—", "—", "LKR 110,500.00"],
      ["3", "Cricket Lanka Academy", "—", "—", "—", "LKR 56,000.00", "LKR 18,000.00", "LKR 74,000.00"],
    ],
    totals: [
      { label: "Customers", value: "3" },
      { label: "Total Outstanding", value: "LKR 230,250.00", bold: true },
    ],
  },
  "customer-statement": {
    columns: ["#", "Date", "Doc", "Reference", "Debit", "Credit", "Balance"],
    align: ["center", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "01 May 2026", "Opening", "—", "—", "—", "LKR 0.00"],
      ["2", "02 May 2026", "INV", "INV-2026-0001", "LKR 200,000.00", "—", "LKR 200,000.00"],
      ["3", "03 May 2026", "RC", "RC-2026-0001", "—", "LKR 200,000.00", "LKR 0.00"],
      ["4", "04 May 2026", "INV", "INV-2026-0002", "LKR 170,000.00", "—", "LKR 170,000.00"],
      ["5", "05 May 2026", "RC", "RC-2026-0001", "—", "LKR 150,000.00", "LKR 20,000.00"],
      ["6", "05 May 2026", "RC-D", "RC-2026-0001 Discount", "—", "LKR 20,000.00", "LKR 0.00"],
    ],
    meta: [
      { label: "Customer", value: "PW Client Alpha" },
      { label: "Mobile", value: "+94 77 123 4567" },
      { label: "Period", value: "01 May 2026 – 11 May 2026" },
    ],
    totals: [
      { label: "Total Debit", value: "LKR 370,000.00" },
      { label: "Total Credit", value: "LKR 370,000.00" },
      { label: "Closing Balance", value: "LKR 0.00", bold: true },
    ],
  },
  "customer-payment-receipts": {
    columns: ["#", "Receipt No", "Date", "Customer", "Cash A/C", "Allocated", "Discount", "Total"],
    align: ["center", "left", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "RC-2026-0001", "03 May 2026", "PW Client Alpha", "ACCH001 CASH ON HAND", "LKR 350,000.00", "LKR 20,000.00", "LKR 370,000.00"],
      ["2", "RC-2026-0002", "06 May 2026", "PW Client Beta", "ACCB001 BANK SAMPATH", "LKR 50,000.00", "—", "LKR 50,000.00"],
    ],
    totals: [
      { label: "Receipts", value: "2" },
      { label: "Total Allocated", value: "LKR 400,000.00" },
      { label: "Total", value: "LKR 420,000.00", bold: true },
    ],
  },

  "supplier-aging": {
    columns: ["#", "Supplier", "Current", "1-30", "31-60", "61-90", "Over 90", "Total"],
    align: ["center", "left", "right", "right", "right", "right", "right", "right"],
    rows: [
      ["1", "Royal Sports House", "LKR 94,500.00", "LKR 50,000.00", "—", "—", "—", "LKR 144,500.00"],
      ["2", "Willow Works Lanka", "LKR 128,000.00", "—", "—", "—", "—", "LKR 128,000.00"],
      ["3", "Edge Line Imports", "—", "—", "LKR 316,900.00", "—", "—", "LKR 316,900.00"],
    ],
    totals: [
      { label: "Suppliers", value: "3" },
      { label: "Total Payable", value: "LKR 589,400.00", bold: true },
    ],
  },
  "supplier-statement": {
    columns: ["#", "Date", "Doc", "Reference", "Debit", "Credit", "Balance"],
    align: ["center", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "01 May 2026", "Opening", "—", "—", "—", "LKR 0.00"],
      ["2", "02 May 2026", "GRN", "GRN-441", "—", "LKR 128,000.00", "LKR 128,000.00"],
      ["3", "03 May 2026", "GRN", "GRN-442", "—", "LKR 50,000.00", "LKR 178,000.00"],
      ["4", "05 May 2026", "PV", "PV-2026-0001", "LKR 50,000.00", "—", "LKR 128,000.00"],
    ],
    meta: [
      { label: "Supplier", value: "Willow Works Lanka" },
      { label: "Period", value: "01 May 2026 – 11 May 2026" },
    ],
    totals: [
      { label: "Total Debit", value: "LKR 50,000.00" },
      { label: "Total Credit", value: "LKR 178,000.00" },
      { label: "Closing Payable", value: "LKR 128,000.00", bold: true },
    ],
  },
  "supplier-payment-vouchers": {
    columns: ["#", "Voucher No", "Date", "Supplier", "Cash A/C", "Allocated", "Discount", "Total"],
    align: ["center", "left", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "PV-2026-0001", "05 May 2026", "Willow Works Lanka", "ACCH001 CASH ON HAND", "LKR 50,000.00", "—", "LKR 50,000.00"],
      ["2", "PV-2026-0002", "08 May 2026", "Royal Sports House", "ACCB001 BANK SAMPATH", "LKR 80,000.00", "LKR 5,000.00", "LKR 85,000.00"],
    ],
    totals: [
      { label: "Vouchers", value: "2" },
      { label: "Total", value: "LKR 135,000.00", bold: true },
    ],
  },

  "journal-entries": {
    columns: ["#", "Date", "Doc Type", "Doc No", "Account", "Debit", "Credit", "Memo"],
    align: ["center", "left", "left", "left", "left", "right", "right", "left"],
    rows: [
      ["1", "02 May 2026", "INV", "INV-2026-0001", "AAR0001 ACCOUNTS RECEIVABLE", "LKR 200,000.00", "—", "Invoice approval"],
      ["2", "02 May 2026", "INV", "INV-2026-0001", "PRIN0001 PRINCIPAL INCOME", "—", "LKR 200,000.00", "Invoice approval"],
      ["3", "02 May 2026", "INV", "INV-2026-0001", "INVE0001 INVENTORY", "—", "LKR 142,500.00", "COGS reversal"],
      ["4", "02 May 2026", "INV", "INV-2026-0001", "COGS0001 COST OF GOODS SOLD", "LKR 142,500.00", "—", "COGS recognition"],
      ["5", "03 May 2026", "RC", "RC-2026-0001", "ACCH001 CASH ON HAND", "LKR 200,000.00", "—", "Receipt"],
      ["6", "03 May 2026", "RC", "RC-2026-0001", "AAR0001 ACCOUNTS RECEIVABLE", "—", "LKR 200,000.00", "Receipt allocation"],
    ],
    totals: [
      { label: "Rows", value: "6" },
      { label: "Total Debit", value: "LKR 542,500.00" },
      { label: "Total Credit", value: "LKR 542,500.00", bold: true },
    ],
  },
  "trial-balance": {
    columns: ["#", "Code", "Account", "Type", "Debit", "Credit", "Net"],
    align: ["center", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "ACCH001", "CASH ON HAND", "ASSETS", "LKR 380,500.00", "—", "LKR 380,500.00 Dr"],
      ["2", "ACCB001", "BANK SAMPATH", "ASSETS", "LKR 1,250,000.00", "—", "LKR 1,250,000.00 Dr"],
      ["3", "AAR0001", "ACCOUNTS RECEIVABLE", "ASSETS", "LKR 230,250.00", "—", "LKR 230,250.00 Dr"],
      ["4", "INVE0001", "INVENTORY", "ASSETS", "LKR 425,000.00", "—", "LKR 425,000.00 Dr"],
      ["5", "AAP0001", "ACCOUNTS PAYABLE", "LIABILITIES", "—", "LKR 589,400.00", "LKR 589,400.00 Cr"],
      ["6", "LFGV001", "GIFT VOUCHER LIABILITY", "LIABILITIES", "—", "LKR 5,000.00", "LKR 5,000.00 Cr"],
      ["7", "PRIN0001", "PRINCIPAL INCOME", "INCOME", "—", "LKR 1,300,000.00", "LKR 1,300,000.00 Cr"],
      ["8", "COGS0001", "COST OF GOODS SOLD", "EXPENSES", "LKR 875,000.00", "—", "LKR 875,000.00 Dr"],
      ["9", "EOPS001", "CASH DISCOUNT EXPENSES", "EXPENSES", "LKR 22,500.00", "—", "LKR 22,500.00 Dr"],
    ],
    totals: [
      { label: "Total Debit", value: "LKR 3,183,250.00" },
      { label: "Total Credit", value: "LKR 1,894,400.00" },
      { label: "Difference", value: "LKR 0.00", bold: true },
    ],
  },
  "account-ledger": {
    columns: ["#", "Date", "Doc Type", "Doc No", "Memo", "Debit", "Credit", "Balance"],
    align: ["center", "left", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "01 May 2026", "Opening", "—", "Brought forward", "—", "—", "LKR 250,000.00 Dr"],
      ["2", "02 May 2026", "INV", "INV-2026-0001", "Sale to PW Client Alpha", "LKR 200,000.00", "—", "LKR 450,000.00 Dr"],
      ["3", "03 May 2026", "RC", "RC-2026-0001", "Receipt from PW Client Alpha", "—", "LKR 200,000.00", "LKR 250,000.00 Dr"],
      ["4", "04 May 2026", "INV", "INV-2026-0002", "Sale to PW Client Alpha", "LKR 170,000.00", "—", "LKR 420,000.00 Dr"],
      ["5", "10 May 2026", "SR", "SR-2026-0002", "Return from PW Client Alpha", "—", "LKR 1,000.00", "LKR 419,000.00 Dr"],
    ],
    meta: [
      { label: "Account", value: "AAR0001 ACCOUNTS RECEIVABLE" },
      { label: "Type", value: "ASSETS" },
      { label: "Period", value: "01 May 2026 – 11 May 2026" },
    ],
    totals: [
      { label: "Total Debit", value: "LKR 370,000.00" },
      { label: "Total Credit", value: "LKR 201,000.00" },
      { label: "Closing Balance", value: "LKR 419,000.00 Dr", bold: true },
    ],
  },

  "stock-report": {
    columns: ["#", "Code", "Product", "Type", "On Hand", "Avg Cost", "Stock Value", "Status"],
    align: ["center", "left", "left", "left", "right", "right", "right", "left"],
    rows: [
      ["1", "ABB/DD/234/123", "Champion Carrom Board", "Inventory", "10", "LKR 1,250.00", "LKR 12,500.00", "Healthy"],
      ["2", "GV5K", "Gift Voucher Rs 5,000", "Voucher", "1", "—", "—", "Low stock"],
      ["3", "GHTY/67-BSH#SFHT123", "Trade Binding", "Inventory", "0", "LKR 250.00", "—", "Out of stock"],
      ["4", "SS-001", "SS Gladiator Cricket Bat Green", "Inventory", "0", "LKR 120,000.00", "—", "Out of stock"],
    ],
    totals: [
      { label: "Products", value: "4" },
      { label: "Total Units", value: "11" },
      { label: "Total Value", value: "LKR 12,500.00", bold: true },
    ],
  },
  "stock-movement-register": {
    columns: ["#", "Date", "Source", "Doc No", "Product", "Branch", "In", "Out", "Balance"],
    align: ["center", "left", "left", "left", "left", "left", "right", "right", "right"],
    rows: [
      ["1", "01 May 2026", "GRN", "GRN-441", "Champion Carrom Board", "MAIN-001", "20", "—", "20"],
      ["2", "02 May 2026", "INVOICE", "INV-2026-0001", "Champion Carrom Board", "MAIN-001", "—", "8", "12"],
      ["3", "06 May 2026", "POS", "POS-2026-00006", "Champion Carrom Board", "MAIN-001", "—", "2", "10"],
      ["4", "10 May 2026", "CR", "SR-2026-0001", "Champion Carrom Board", "MAIN-001", "1", "—", "11"],
      ["5", "11 May 2026", "ISSUE", "MI-2026-0003", "Champion Carrom Board", "MAIN-001", "—", "1", "10"],
    ],
    totals: [
      { label: "Movements", value: "5" },
      { label: "In", value: "21" },
      { label: "Out", value: "11" },
      { label: "Net", value: "+10", bold: true },
    ],
  },
  "grn-register": {
    columns: ["#", "GRN No", "Date", "Linked PO", "Supplier", "Branch", "Items", "Total"],
    align: ["center", "left", "left", "left", "left", "left", "right", "right"],
    rows: [
      ["1", "GRN-441", "02 May 2026", "PO-2032", "Willow Works Lanka", "MAIN-001", "48", "LKR 128,000.00"],
      ["2", "GRN-442", "03 May 2026", "PO-2027", "Royal Sports House", "MAIN-001", "12", "LKR 50,000.00"],
      ["3", "GRN-443", "06 May 2026", "PO-2035", "Edge Line Imports", "KAN-002", "62", "LKR 316,900.00"],
    ],
    totals: [
      { label: "GRNs", value: "3" },
      { label: "Total Value", value: "LKR 494,900.00", bold: true },
    ],
  },
  "po-register": {
    columns: ["#", "PO No", "Date", "Supplier", "Branch", "Status", "Total", "Received"],
    align: ["center", "left", "left", "left", "left", "left", "right", "right"],
    rows: [
      ["1", "PO-2031", "29 Apr 2026", "Royal Sports House", "MAIN-001", "Open", "LKR 94,500.00", "—"],
      ["2", "PO-2032", "01 May 2026", "Willow Works Lanka", "MAIN-001", "Closed", "LKR 128,000.00", "LKR 128,000.00"],
      ["3", "PO-2035", "04 May 2026", "Edge Line Imports", "KAN-002", "Partial", "LKR 316,900.00", "LKR 200,000.00"],
    ],
    totals: [
      { label: "POs", value: "3" },
      { label: "Total", value: "LKR 539,400.00", bold: true },
      { label: "Received", value: "LKR 328,000.00" },
    ],
  },

  "profit-loss": {
    columns: ["#", "Line", "Group", "Amount"],
    align: ["center", "left", "left", "right"],
    rows: [
      ["1", "Principal Income", "INCOME", "LKR 1,300,000.00"],
      ["2", "Other Income", "INCOME", "LKR 24,500.00"],
      ["", "Total Income", "", "LKR 1,324,500.00"],
      ["3", "Cost of Goods Sold", "EXPENSES", "(LKR 875,000.00)"],
      ["", "Gross Profit", "", "LKR 449,500.00"],
      ["4", "Cash Discount Expenses", "EXPENSES", "(LKR 22,500.00)"],
      ["5", "Operating Expenses", "EXPENSES", "(LKR 110,000.00)"],
      ["", "Operating Profit", "", "LKR 317,000.00"],
      ["", "Net Profit", "", "LKR 317,000.00"],
    ],
    totals: [
      { label: "Income", value: "LKR 1,324,500.00" },
      { label: "Expenses", value: "LKR 1,007,500.00" },
      { label: "Net Profit", value: "LKR 317,000.00", bold: true },
    ],
  },
  "sales-by-product": {
    columns: ["#", "Code", "Product", "Qty Sold", "Revenue", "COGS", "Gross Profit", "Margin %"],
    align: ["center", "left", "left", "right", "right", "right", "right", "right"],
    rows: [
      ["1", "ABB/DD/234/123", "Champion Carrom Board", "18", "LKR 31,500.00", "LKR 22,500.00", "LKR 9,000.00", "28.6%"],
      ["2", "SS-001", "SS Gladiator Cricket Bat Green", "5", "LKR 750,000.00", "LKR 600,000.00", "LKR 150,000.00", "20.0%"],
      ["3", "GV5K", "Gift Voucher Rs 5,000", "2", "LKR 10,000.00", "—", "—", "—"],
    ],
    totals: [
      { label: "Products", value: "3" },
      { label: "Revenue", value: "LKR 791,500.00" },
      { label: "Gross Profit", value: "LKR 159,000.00", bold: true },
    ],
  },
  "sales-by-customer": {
    columns: ["#", "Customer", "Bills / Invoices", "Gross Sales", "Returns", "Net Sales"],
    align: ["center", "left", "right", "right", "right", "right"],
    rows: [
      ["1", "PW Client Alpha", "5", "LKR 382,250.00", "LKR 2,750.00", "LKR 379,500.00"],
      ["2", "PW Client Beta", "3", "LKR 200,500.00", "—", "LKR 200,500.00"],
      ["3", "Walk-in (POS)", "22", "LKR 195,800.00", "LKR 7,000.00", "LKR 188,800.00"],
      ["4", "Cricket Lanka Academy", "2", "LKR 74,000.00", "—", "LKR 74,000.00"],
    ],
    totals: [
      { label: "Customers", value: "4" },
      { label: "Net Sales", value: "LKR 842,800.00", bold: true },
    ],
  },
};
