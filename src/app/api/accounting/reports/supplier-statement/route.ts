// GET /api/accounting/reports/supplier-statement?supplierId=&dateRange=
//
// Per-supplier transaction history with running balance. Reads from
// `accountingsupplierledgerentry` — convention is value > 0 = supplier
// credited (we owe more, e.g. GRN landed); value < 0 = supplier
// debited (we paid down, e.g. PV approved). Closing balance > 0
// means we still owe.

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
    const supplierId = url.searchParams.get("supplierId")?.trim() ?? "";
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));

    if (!supplierId) {
      return NextResponse.json(
        fail("Supplier is required for the Supplier Statement.", "SUPPLIER_REQUIRED"),
        { status: 422 },
      );
    }

    const supplier = await prisma.accountingSupplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, code: true },
    });
    if (!supplier) {
      return NextResponse.json(fail("Supplier not found.", "SUPPLIER_NOT_FOUND"), {
        status: 404,
      });
    }

    let opening = 0;
    if (from) {
      const prior = await prisma.accountingSupplierLedgerEntry.findMany({
        where: {
          supplierId,
          documentDate: { lt: from },
        },
        select: { value: true },
      });
      for (const r of prior) opening += Number(r.value);
    }

    const where: Prisma.AccountingSupplierLedgerEntryWhereInput = {
      supplierId,
      ...(from || to
        ? {
            documentDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const entries = await prisma.accountingSupplierLedgerEntry.findMany({
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
      // Sign convention on supplier ledger:
      //   value > 0 → supplier credit (we owe more)  → "Credit" column
      //   value < 0 → supplier debit (we paid)        → "Debit" column
      const credit = v > 0 ? fmtMoneyAlways(v) : "—";
      const debit = v < 0 ? fmtMoneyAlways(-v) : "—";
      if (v > 0) totalCredit += v;
      if (v < 0) totalDebit += -v;
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
      { label: "Closing Payable", value: fmtMoneyAlways(balance), bold: true },
    ];

    const meta = [
      { label: "Supplier", value: `${supplier.code} ${supplier.name}` },
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

    return NextResponse.json(ok(payload, "Supplier statement generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT SUPPLIER-STATEMENT]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
