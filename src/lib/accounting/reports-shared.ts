// Shared payload shape + helpers for every endpoint under
// /api/accounting/reports/*. The shape is identical to
// `SamplePreview` (used during the UI-first phase) so the preview
// shell on the client side renders mock and real data with no
// branch logic.
//
// All report endpoints accept their filters via URL query params,
// run a Prisma query under branch-scoped auth, then transform rows
// into the columns / rows / totals / meta shape below.

import { Prisma } from "@prisma/client";

// ─── Payload shape ───────────────────────────────────────────────

export type ReportColumnAlign = "left" | "right" | "center";

export type ReportTotal = {
  label: string;
  value: string;
  bold?: boolean;
};

export type ReportMeta = {
  label: string;
  value: string;
};

// Per-row style hint, used by reports that group their data (e.g.
// Journal Entries groups lines by (documentType, documentNumber) so
// each posting renders as one logical journal entry). Same length
// as `rows`. Default for any row is "normal".
//
//   normal   — regular striped row
//   header   — group header (bold, lightly tinted background)
//   subtotal — group footer (bold with top border, the per-group
//              Dr/Cr balance check)
export type ReportRowStyle = "normal" | "header" | "subtotal";

export type ReportPayload = {
  columns: string[];
  align?: ReportColumnAlign[];
  rows: string[][];
  rowStyles?: ReportRowStyle[];
  totals?: ReportTotal[];
  meta?: ReportMeta[];
};

// ─── Filter parsing helpers ──────────────────────────────────────

// Parses the "from..to" date-range format the hub screen sends.
// Either side can be empty; returns undefined for missing sides
// so Prisma `where` builders can leave the boundary off.
export function parseDateRange(value: string | null | undefined): {
  from?: Date;
  to?: Date;
} {
  if (!value) return {};
  const [fromStr, toStr] = value.split("..");
  const from = fromStr ? safeParseDate(fromStr) : undefined;
  // To is end-inclusive — push to 23:59:59.999 of the picked day.
  const to = toStr ? endOfDay(safeParseDate(toStr)) : undefined;
  return { from, to };
}

function safeParseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function endOfDay(d: Date | undefined): Date | undefined {
  if (!d) return undefined;
  const c = new Date(d.getTime());
  c.setUTCHours(23, 59, 59, 999);
  return c;
}

// ─── Number formatting ───────────────────────────────────────────

// Money values across all reports use this single formatter so
// PDF / Excel / preview look identical. Decimal coming from Prisma
// is converted via Number — fine for display purposes (we never
// do client-side arithmetic on these strings).
export function fmtMoney(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) {
    // Zero shows as a long dash to keep tables visually scannable;
    // callers that want explicit "LKR 0.00" can format their own.
    if (n === 0) return "—";
    return "—";
  }
  return `LKR ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Same as fmtMoney but always renders the value (even zero).
export function fmtMoneyAlways(value: Prisma.Decimal | number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return "LKR 0.00";
  return `LKR ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Sri Lanka time formatter for posted-at / created-at columns —
// matches the receipt + history list (Asia/Colombo).
export function fmtDateTimeSlt(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateSlt(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Sums an array of decimals safely.
export function sumDecimals(values: Array<Prisma.Decimal | number | string | null | undefined>): number {
  let sum = 0;
  for (const v of values) {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

// ─── Sign-convention helpers ─────────────────────────────────────
//
// This codebase posts journal entries using an "additive" convention
// (see posting.ts header):
//   value > 0 = grows the account's natural balance
//   value < 0 = shrinks the account's natural balance
//
// So `value > 0` on an Asset is a Debit (asset grew), but `value > 0`
// on a Liability/Income is a Credit (liability/income grew).
//
// The reports below need traditional Debit/Credit columns where
// sum(Debits) == sum(Credits) for balanced books. To map our signed
// `value` back to Dr/Cr we need the account's category.

export type AccountCategoryCode = "ASSET" | "LIABILITIES" | "EQUITY" | "INCOME" | "EXPENSES";

// Returns true if the account is "debit-normal" — its natural balance
// is on the debit side (assets, expenses). Liability/equity/income
// are credit-normal.
export function isDebitNormal(categoryCode: string): boolean {
  return categoryCode === "ASSET" || categoryCode === "EXPENSES";
}

// Translates the additive `value` to {debit, credit} based on the
// account's category. Sum(debit) == sum(credit) for balanced books.
export function toDebitCredit(
  value: number,
  categoryCode: string,
): { debit: number; credit: number } {
  const debitNormal = isDebitNormal(categoryCode);
  if (debitNormal) {
    return value >= 0
      ? { debit: value, credit: 0 }
      : { debit: 0, credit: -value };
  }
  return value >= 0
    ? { debit: 0, credit: value }
    : { debit: -value, credit: 0 };
}
