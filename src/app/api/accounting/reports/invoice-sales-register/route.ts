// GET /api/accounting/reports/invoice-sales-register?dateRange=&storeId=&customerId=&status=
//
// Lists invoices in the given date range with their net total and
// current outstanding balance. Outstanding = invoice.total minus
// approved CPR allocations against the invoice minus approved
// customer-return totalNet against the invoice.

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
    const statusRaw = url.searchParams.get("status")?.trim().toUpperCase() ?? "APPROVED";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const statusFilter: "APPROVED" | "DRAFT" | "CANCELLED" | undefined = (() => {
      if (statusRaw === "APPROVED") return "APPROVED";
      if (statusRaw === "DRAFT") return "DRAFT";
      if (statusRaw === "CANCELLED") return "CANCELLED";
      return undefined;
    })();

    const where: Prisma.AccountingInvoiceWhereInput = {
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to
        ? {
            invoiceDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const invoices = await prisma.accountingInvoice.findMany({
      where,
      orderBy: { invoiceDate: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        total: true,
        customer: { select: { name: true } },
        store: { select: { code: true } },
        // Sum of approved-CPR allocations against this invoice — paid amount
        paymentAllocations: {
          where: { receipt: { status: "APPROVED" } },
          select: { receivingAmount: true, discount: true },
        },
        // Sum of approved customer-return totalNet against this invoice
        customerReturns: {
          where: { status: "APPROVED" },
          select: { totalNet: true },
        },
      },
    });

    const rows: string[][] = [];
    let sumNet = 0;
    let sumOutstanding = 0;
    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      const paid = sumDecimals(
        inv.paymentAllocations.flatMap((a) => [a.receivingAmount, a.discount]),
      );
      const returned = sumDecimals(inv.customerReturns.map((r) => r.totalNet));
      const net = Number(inv.total);
      const outstanding = Math.max(0, net - paid - returned);
      sumNet += net;
      sumOutstanding += outstanding;
      rows.push([
        String(i + 1),
        inv.invoiceNumber,
        fmtDateSlt(inv.invoiceDate),
        inv.customer.name,
        inv.store.code,
        inv.status,
        fmtMoneyAlways(net),
        outstanding > 0.001 ? fmtMoneyAlways(outstanding) : "—",
      ]);
    }

    const totals = [
      { label: "Invoices", value: String(invoices.length) },
      { label: "Net Total", value: fmtMoneyAlways(sumNet), bold: true },
      { label: "Outstanding", value: fmtMoneyAlways(sumOutstanding) },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Invoice No", "Date", "Customer", "Branch", "Status", "Net Total", "Outstanding"],
      align: ["center", "left", "left", "left", "left", "left", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Invoice sales register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT INVOICE-SALES-REGISTER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
