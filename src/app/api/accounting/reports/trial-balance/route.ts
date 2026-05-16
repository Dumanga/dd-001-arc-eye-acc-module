// GET /api/accounting/reports/trial-balance?asOfDate=&storeId=&rollup=
//
// Aggregates GL rows by account (or type / category) up to and
// including the as-of date. Per account: total debits = sum of
// positive values; total credits = sum of |negative values|; net =
// signed sum, rendered as "X Dr" or "X Cr". The grand totals at the
// bottom should match (the books balance).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  toDebitCredit,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

type Rollup = "ACCOUNT" | "TYPE" | "CATEGORY";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const asOfRaw = url.searchParams.get("asOfDate")?.trim() ?? "";
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const rollupRaw = url.searchParams.get("rollup")?.trim().toUpperCase() ?? "ACCOUNT";
    const rollup: Rollup = ["ACCOUNT", "TYPE", "CATEGORY"].includes(rollupRaw)
      ? (rollupRaw as Rollup)
      : "ACCOUNT";

    // If the user doesn't pick an as-of date we include everything
    // ("latest known state"). Defaulting to "today" by server clock
    // is brittle — server might be on UTC while the user is on SLT,
    // and entries dated tomorrow-SLT but still today-UTC would leak
    // out of an aging report unexpectedly. Explicit > implicit.
    let asOf: Date | undefined;
    if (asOfRaw) {
      const parsed = new Date(asOfRaw + "T23:59:59.999Z");
      if (!Number.isNaN(parsed.getTime())) asOf = parsed;
    }

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingJournalEntryWhereInput = {
      ...(asOf ? { documentDate: { lte: asOf } } : {}),
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
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
            type: {
              select: {
                name: true,
                category: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    });

    type Bucket = {
      key: string;
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const e of entries) {
      const v = Number(e.value);
      const typeName = e.account.type.name;
      const categoryName = e.account.type.category.name;
      const categoryCode = e.account.type.category.code;

      let key: string;
      let code: string;
      let name: string;
      if (rollup === "ACCOUNT") {
        key = e.accountId;
        code = e.accountCode;
        name = e.accountName;
      } else if (rollup === "TYPE") {
        key = `T:${typeName}`;
        code = "—";
        name = typeName;
      } else {
        key = `C:${categoryName}`;
        code = "—";
        name = categoryName;
      }

      const existing =
        buckets.get(key) ??
        ({
          key,
          code,
          name,
          type: rollup === "CATEGORY" ? categoryName : typeName,
          debit: 0,
          credit: 0,
        } satisfies Bucket);
      // Use category-aware Dr/Cr mapping so liability/income/equity
      // entries with value > 0 (they GREW) correctly land in the
      // Credit column rather than Debit. Without this, Dr would
      // always exceed Cr for sales-side activity.
      const dc = toDebitCredit(v, categoryCode);
      existing.debit += dc.debit;
      existing.credit += dc.credit;
      buckets.set(key, existing);
    }

    const rows = Array.from(buckets.values()).sort((a, b) =>
      a.code === b.code ? a.name.localeCompare(b.name) : a.code.localeCompare(b.code),
    );

    let totalDr = 0;
    let totalCr = 0;
    const tableRows: string[][] = rows.map((r, idx) => {
      const net = r.debit - r.credit;
      totalDr += r.debit;
      totalCr += r.credit;
      const netStr = net >= 0
        ? `${fmtMoneyAlways(net)} Dr`
        : `${fmtMoneyAlways(-net)} Cr`;
      return [
        String(idx + 1),
        r.code,
        r.name,
        r.type,
        r.debit > 0 ? fmtMoneyAlways(r.debit) : "—",
        r.credit > 0 ? fmtMoneyAlways(r.credit) : "—",
        netStr,
      ];
    });

    const totals = [
      { label: "Total Debit", value: fmtMoneyAlways(totalDr) },
      { label: "Total Credit", value: fmtMoneyAlways(totalCr) },
      { label: "Difference", value: fmtMoneyAlways(totalDr - totalCr), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Code", "Account", "Type", "Debit", "Credit", "Net"],
      align: ["center", "left", "left", "left", "right", "right", "right"],
      rows: tableRows,
      totals,
    };

    return NextResponse.json(ok(payload, "Trial balance generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT TRIAL-BALANCE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
