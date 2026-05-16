// GET /api/accounting/reports/customer-statement?customerId=&dateRange=
//
// Per-customer transaction history with running balance. Reads
// straight from `accountingcustomerledgerentry` — invoices land as
// debits (positive value), receipts and returns land as credits
// (negative value). Running balance = sum of values up to and
// including the row.
//
// `customerId` is required. The endpoint also surfaces a meta band
// at the top of the preview ("Customer", "Period").

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  fmtDateSlt,
  parseDateRange,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId")?.trim() ?? "";
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));

    if (!customerId) {
      return NextResponse.json(
        fail("Customer is required for the Customer Statement.", "CUSTOMER_REQUIRED"),
        { status: 422 },
      );
    }

    const customer = await prisma.accountingClient.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, mobile: true },
    });
    if (!customer) {
      return NextResponse.json(fail("Customer not found.", "CUSTOMER_NOT_FOUND"), {
        status: 404,
      });
    }

    // Opening balance: sum of all entries strictly before `from`. If
    // `from` is unset the opening balance is 0 (the period starts at
    // the customer's first ledger entry).
    let opening = 0;
    if (from) {
      const prior = await prisma.accountingCustomerLedgerEntry.findMany({
        where: {
          customerId,
          documentDate: { lt: from },
        },
        select: { value: true },
      });
      for (const r of prior) opening += Number(r.value);
    }

    const where: Prisma.AccountingCustomerLedgerEntryWhereInput = {
      customerId,
      ...(from || to
        ? {
            documentDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const entries = await prisma.accountingCustomerLedgerEntry.findMany({
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

    const rows: string[][] = [];
    let balance = opening;
    let totalDebit = 0;
    let totalCredit = 0;

    // Opening row
    rows.push([
      String(rows.length + 1),
      from ? fmtDateSlt(from) : "—",
      "Opening",
      "Brought forward",
      "—",
      "—",
      fmtMoneyAlways(balance),
    ]);

    for (const e of entries) {
      const v = Number(e.value);
      balance += v;
      const debit = v > 0 ? fmtMoneyAlways(v) : "—";
      const credit = v < 0 ? fmtMoneyAlways(-v) : "—";
      if (v > 0) totalDebit += v;
      if (v < 0) totalCredit += -v;
      rows.push([
        String(rows.length + 1),
        fmtDateSlt(e.documentDate),
        e.documentType,
        e.documentNumber || e.narration || "—",
        debit,
        credit,
        fmtMoneyAlways(balance),
      ]);
    }

    const totals = [
      { label: "Total Debit", value: fmtMoneyAlways(totalDebit) },
      { label: "Total Credit", value: fmtMoneyAlways(totalCredit) },
      { label: "Closing Balance", value: fmtMoneyAlways(balance), bold: true },
    ];

    const meta = [
      { label: "Customer", value: customer.name },
      { label: "Mobile", value: customer.mobile || "—" },
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
      columns: ["#", "Date", "Doc", "Reference", "Debit", "Credit", "Balance"],
      align: ["center", "left", "left", "left", "right", "right", "right"],
      rows,
      totals,
      meta,
    };

    return NextResponse.json(ok(payload, "Customer statement generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT CUSTOMER-STATEMENT]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
