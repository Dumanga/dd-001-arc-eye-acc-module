// GET /api/accounting/reports/profit-loss?dateRange=&storeId=
//
// Profit & Loss for the period — structured per the standard format:
//
//   Main Income              (accounts where type.code = "INCOME")
//   − Cost of Sales          (accounts where type.code = "COST_OF_SALE")
//   = Gross Profit
//   + Other Income           (accounts where type.code = "OTHER_INCOME")
//   − Expenses               (accounts where type.code = "EXPENSES")
//   − Other Expenses         (accounts where type.code = "OTHER_EXPENSES")
//   = Net Profit
//
// Sign convention (per posting.ts header): value > 0 means the account's
// natural balance grew — i.e. income recognised or expense incurred —
// regardless of debit-normal vs credit-normal. So `SUM(value)` per account
// is exactly the period contribution to that account; positive values go
// straight into the totals, negative values (reversals) reduce them.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  parseDateRange,
  type ReportPayload,
  type ReportRowStyle,
} from "@/lib/accounting/reports-shared";

type TypeCode =
  | "INCOME"
  | "OTHER_INCOME"
  | "COST_OF_SALE"
  | "EXPENSES"
  | "OTHER_EXPENSES";

const SECTION_CODES: TypeCode[] = [
  "INCOME",
  "OTHER_INCOME",
  "COST_OF_SALE",
  "EXPENSES",
  "OTHER_EXPENSES",
];

function fmtMoneyParens(amount: number): string {
  // Render as a parenthesised positive value when the underlying number is
  // negative — standard accounting convention for "this is a subtraction".
  const abs = Math.abs(amount);
  const text = fmtMoneyAlways(abs).replace("LKR ", "");
  return amount < 0 ? `(${text})` : text;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    // Pull every journal entry whose account sits under INCOME or EXPENSES.
    // We need the account's type.code to drive section assignment, so include
    // it in the select.
    const where: Prisma.AccountingJournalEntryWhereInput = {
      account: {
        category: { code: { in: ["INCOME", "EXPENSES"] } },
      },
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(from || to
        ? {
            documentDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const entries = await prisma.accountingJournalEntry.findMany({
      where,
      select: {
        accountId: true,
        accountCode: true,
        accountName: true,
        value: true,
        account: {
          select: {
            type: { select: { code: true, name: true } },
          },
        },
      },
    });

    // ─── Bucket per account, then bucket per section ────────────────
    type AccBucket = {
      id: string;
      code: string;
      name: string;
      typeCode: TypeCode;
      typeName: string;
      signedTotal: number;
    };

    const accBuckets = new Map<string, AccBucket>();
    for (const e of entries) {
      const typeCode = e.account.type.code as TypeCode;
      // Defensive: ignore anything outside the five recognised section codes.
      if (!SECTION_CODES.includes(typeCode)) continue;
      const v = Number(e.value);
      const ex = accBuckets.get(e.accountId) ?? {
        id: e.accountId,
        code: e.accountCode,
        name: e.accountName,
        typeCode,
        typeName: e.account.type.name,
        signedTotal: 0,
      };
      ex.signedTotal += v;
      accBuckets.set(e.accountId, ex);
    }

    // Group accounts by section code; sort accounts within a section by code.
    const sections: Record<TypeCode, AccBucket[]> = {
      INCOME: [],
      OTHER_INCOME: [],
      COST_OF_SALE: [],
      EXPENSES: [],
      OTHER_EXPENSES: [],
    };
    for (const acc of accBuckets.values()) {
      sections[acc.typeCode].push(acc);
    }
    for (const code of SECTION_CODES) {
      sections[code].sort((a, b) => a.code.localeCompare(b.code));
    }

    const sectionTotal = (code: TypeCode): number =>
      sections[code].reduce((s, a) => s + a.signedTotal, 0);

    const totalMainIncome = sectionTotal("INCOME");
    const totalCogs = sectionTotal("COST_OF_SALE");
    const totalOtherIncome = sectionTotal("OTHER_INCOME");
    const totalExpenses = sectionTotal("EXPENSES");
    const totalOtherExpenses = sectionTotal("OTHER_EXPENSES");

    // Gross Profit = Main Income − Cost of Sales
    const grossProfit = totalMainIncome - totalCogs;
    // Net Profit  = Gross Profit + Other Income − Expenses − Other Expenses
    const netProfit =
      grossProfit + totalOtherIncome - totalExpenses - totalOtherExpenses;

    // ─── Build rows + per-row style ─────────────────────────────────
    const rows: string[][] = [];
    const rowStyles: ReportRowStyle[] = [];
    let lineNo = 0;

    function pushHeader(label: string) {
      rows.push(["", label, "", ""]);
      rowStyles.push("header");
    }
    function pushAccount(acc: AccBucket, presentAsNegative: boolean) {
      lineNo += 1;
      const amount = acc.signedTotal;
      const cell = presentAsNegative
        ? fmtMoneyParens(amount === 0 ? 0 : -Math.abs(amount))
        : amount < 0
          ? fmtMoneyParens(amount)
          : fmtMoneyAlways(amount);
      rows.push([
        String(lineNo),
        `${acc.code} ${acc.name}`,
        acc.typeName,
        cell,
      ]);
      rowStyles.push("normal");
    }
    function pushSubtotal(label: string, amount: number, presentAsNegative: boolean) {
      const cell = presentAsNegative
        ? fmtMoneyParens(amount === 0 ? 0 : -Math.abs(amount))
        : amount < 0
          ? fmtMoneyParens(amount)
          : fmtMoneyAlways(amount);
      rows.push(["", label, "", cell]);
      rowStyles.push("subtotal");
    }

    // 1) Main Income
    pushHeader("Income");
    for (const acc of sections.INCOME) pushAccount(acc, false);
    pushSubtotal("Total Income", totalMainIncome, false);

    // 2) Cost of Sales (subtraction)
    pushHeader("Less: Cost of Sales");
    for (const acc of sections.COST_OF_SALE) pushAccount(acc, true);
    pushSubtotal("Total Cost of Sales", totalCogs, true);

    // 3) Gross Profit
    pushSubtotal("Gross Profit", grossProfit, false);

    // 4) Other Income (addition)
    pushHeader("Add: Other Income");
    for (const acc of sections.OTHER_INCOME) pushAccount(acc, false);
    pushSubtotal("Total Other Income", totalOtherIncome, false);

    // 5) Expenses (subtraction)
    pushHeader("Less: Expenses");
    for (const acc of sections.EXPENSES) pushAccount(acc, true);
    pushSubtotal("Total Expenses", totalExpenses, true);

    // 6) Other Expenses (subtraction)
    pushHeader("Less: Other Expenses");
    for (const acc of sections.OTHER_EXPENSES) pushAccount(acc, true);
    pushSubtotal("Total Other Expenses", totalOtherExpenses, true);

    // 7) Net Profit
    pushSubtotal("Net Profit", netProfit, false);

    // ─── Header chips ───────────────────────────────────────────────
    const totals = [
      { label: "Income", value: fmtMoneyAlways(totalMainIncome) },
      {
        label: "Gross Profit",
        value:
          grossProfit < 0
            ? fmtMoneyParens(grossProfit)
            : fmtMoneyAlways(grossProfit),
      },
      {
        label: "Net Profit",
        value:
          netProfit < 0
            ? fmtMoneyParens(netProfit)
            : fmtMoneyAlways(netProfit),
        bold: true,
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Line", "Group", "Amount"],
      align: ["center", "left", "left", "right"],
      rows,
      rowStyles,
      totals,
    };

    return NextResponse.json(ok(payload, "Profit & loss statement generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT PROFIT-LOSS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
