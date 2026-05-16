// GET /api/accounting/reports/customer-returns-register?dateRange=&storeId=&customerId=&sourceType=
//
// Lists APPROVED customer returns (SR) in a date range. Source can be
// INVOICE or POS_BILL — both surfaced with the matching source doc
// number for traceability. Includes the per-return reasonHeader.

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
  sumDecimals,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const customerId = url.searchParams.get("customerId")?.trim() ?? "";
    const sourceTypeRaw = url.searchParams.get("sourceType")?.trim().toUpperCase() ?? "ALL";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const sourceTypeFilter: "INVOICE" | "POS_BILL" | undefined =
      sourceTypeRaw === "INVOICE" || sourceTypeRaw === "POS_BILL"
        ? (sourceTypeRaw as "INVOICE" | "POS_BILL")
        : undefined;

    const where: Prisma.AccountingCustomerReturnWhereInput = {
      status: "APPROVED",
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(sourceTypeFilter ? { sourceType: sourceTypeFilter } : {}),
      ...(from || to
        ? {
            returnDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const returns = await prisma.accountingCustomerReturn.findMany({
      where,
      orderBy: { returnDate: "asc" },
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        sourceType: true,
        reasonHeader: true,
        totalNet: true,
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
        sourcePosBill: { select: { billNo: true } },
      },
    });

    const rows: string[][] = returns.map((r, idx) => {
      const sourceNo =
        r.sourceType === "INVOICE"
          ? r.invoice?.invoiceNumber ?? "—"
          : r.sourcePosBill?.billNo ?? "—";
      return [
        String(idx + 1),
        r.returnNumber,
        fmtDateSlt(r.returnDate),
        r.customer.name,
        r.sourceType,
        sourceNo,
        r.reasonHeader || "—",
        fmtMoneyAlways(r.totalNet),
      ];
    });

    const totals = [
      { label: "Returns", value: String(returns.length) },
      {
        label: "Net Reversed",
        value: fmtMoneyAlways(sumDecimals(returns.map((r) => r.totalNet))),
        bold: true,
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Return No", "Date", "Customer", "Source", "Source No", "Reason", "Net Reversed"],
      align: ["center", "left", "left", "left", "left", "left", "left", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Customer returns register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT CUSTOMER-RETURNS-REGISTER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
