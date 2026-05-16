// GET /api/accounting/reports/account-ledger?accountId=&dateRange=&storeId=
//
// Per-account ledger view. Required filter: accountId. Renders an
// opening-balance row (sum of values strictly before `from`),
// every JE row in the period, and the running balance after each
// row. Closing balance is signed: positive → "X Dr", negative →
// "X Cr".

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  fmtDateSlt,
  parseDateRange,
  toDebitCredit,
  isDebitNormal,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim() ?? "";
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";

    if (!accountId) {
      return NextResponse.json(
        fail("Account is required for the Account Ledger.", "ACCOUNT_REQUIRED"),
        { status: 422 },
      );
    }

    const account = await prisma.chartOfAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        code: true,
        name: true,
        type: {
          select: {
            name: true,
            category: { select: { name: true, code: true } },
          },
        },
      },
    });
    if (!account) {
      return NextResponse.json(fail("Account not found.", "ACCOUNT_NOT_FOUND"), {
        status: 404,
      });
    }
    const categoryCode = account.type.category.code;
    const accountIsDebitNormal = isDebitNormal(categoryCode);

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    let opening = 0;
    if (from) {
      const prior = await prisma.accountingJournalEntry.findMany({
        where: {
          accountId,
          ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
          documentDate: { lt: from },
        },
        select: { value: true },
      });
      for (const r of prior) opening += Number(r.value);
    }

    const where: Prisma.AccountingJournalEntryWhereInput = {
      accountId,
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
      orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
      select: {
        documentDate: true,
        documentType: true,
        documentNumber: true,
        value: true,
        narration: true,
      },
    });

    // Running balance presentation rule:
    //   debit-normal account (Asset / Expense): positive sum → "X Dr"
    //   credit-normal account (Liability / Income / Equity): positive sum → "X Cr"
    // The sum is always in the natural balance direction because of
    // the additive posting convention (value > 0 grows natural balance).
    function formatBalance(signedTotal: number): string {
      if (Math.abs(signedTotal) < 0.005) return "LKR 0.00";
      const positive = signedTotal > 0;
      const amt = fmtMoneyAlways(Math.abs(signedTotal));
      const dir = accountIsDebitNormal === positive ? "Dr" : "Cr";
      return `${amt} ${dir}`;
    }

    const rows: string[][] = [];
    let balance = opening;
    let totalDebit = 0;
    let totalCredit = 0;

    rows.push([
      String(rows.length + 1),
      from ? fmtDateSlt(from) : "—",
      "Opening",
      "—",
      "Brought forward",
      "—",
      "—",
      formatBalance(balance),
    ]);

    for (const e of entries) {
      const v = Number(e.value);
      balance += v;
      const { debit, credit } = toDebitCredit(v, categoryCode);
      totalDebit += debit;
      totalCredit += credit;
      rows.push([
        String(rows.length + 1),
        fmtDateSlt(e.documentDate),
        e.documentType,
        e.documentNumber,
        e.narration || "—",
        debit > 0 ? fmtMoneyAlways(debit) : "—",
        credit > 0 ? fmtMoneyAlways(credit) : "—",
        formatBalance(balance),
      ]);
    }

    const closing = balance;
    const totals = [
      { label: "Total Debit", value: fmtMoneyAlways(totalDebit) },
      { label: "Total Credit", value: fmtMoneyAlways(totalCredit) },
      {
        label: "Closing Balance",
        value: formatBalance(closing),
        bold: true,
      },
    ];

    const meta = [
      { label: "Account", value: `${account.code} ${account.name}` },
      { label: "Type", value: account.type.name },
      {
        label: "Period",
        value:
          from && to
            ? `${fmtDateSlt(from)} – ${fmtDateSlt(to)}`
            : from
              ? `From ${fmtDateSlt(from)}`
              : to
                ? `Up to ${fmtDateSlt(to)}`
                : "All time",
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Date", "Doc Type", "Doc No", "Memo", "Debit", "Credit", "Balance"],
      align: ["center", "left", "left", "left", "left", "right", "right", "right"],
      rows,
      totals,
      meta,
    };

    return NextResponse.json(ok(payload, "Account ledger generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT ACCOUNT-LEDGER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
