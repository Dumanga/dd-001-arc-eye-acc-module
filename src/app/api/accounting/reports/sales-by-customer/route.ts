// GET /api/accounting/reports/sales-by-customer?dateRange=&storeId=&limit=
//
// Top customers by net sales in the period. Sources:
//   - APPROVED invoices (gross = invoice.total)
//   - COMPLETED POS bills (gross = bill.total)
//   - APPROVED customer returns (returned amount subtracts from net)
//
// Net sales = gross sales − returns. Sorted by net sales desc.

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
} from "@/lib/accounting/reports-shared";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const limitRaw = url.searchParams.get("limit")?.trim().toUpperCase() ?? "20";
    const limit = limitRaw === "ALL" ? Infinity : Math.max(1, Number(limitRaw) || 20);

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }
    const storeId = scope.where.storeId;

    type CustomerBucket = {
      id: string;
      name: string;
      docCount: number;
      gross: number;
      returns: number;
    };
    const byCust = new Map<string, CustomerBucket>();
    function bucketFor(id: string, name: string): CustomerBucket {
      const ex = byCust.get(id);
      if (ex) return ex;
      const fresh: CustomerBucket = { id, name, docCount: 0, gross: 0, returns: 0 };
      byCust.set(id, fresh);
      return fresh;
    }

    // Invoices
    const invs = await prisma.accountingInvoice.findMany({
      where: {
        status: "APPROVED",
        ...(storeId ? { storeId } : {}),
        ...(from || to
          ? {
              invoiceDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        customerId: true,
        total: true,
        customer: { select: { name: true } },
      },
    });
    for (const inv of invs) {
      const b = bucketFor(inv.customerId, inv.customer.name);
      b.docCount += 1;
      b.gross += Number(inv.total);
    }

    // POS bills
    const bills = await prisma.accountingPosBill.findMany({
      where: {
        status: "COMPLETED",
        ...(storeId ? { storeId } : {}),
        ...(from || to
          ? {
              postedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        customerId: true,
        total: true,
        customer: { select: { name: true } },
      },
    });
    for (const b of bills) {
      const c = bucketFor(b.customerId, b.customer.name);
      c.docCount += 1;
      c.gross += Number(b.total);
    }

    // Customer returns (subtracted from net)
    const rets = await prisma.accountingCustomerReturn.findMany({
      where: {
        status: "APPROVED",
        ...(storeId ? { storeId } : {}),
        ...(from || to
          ? {
              returnDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        customerId: true,
        totalNet: true,
        customer: { select: { name: true } },
      },
    });
    for (const r of rets) {
      const c = bucketFor(r.customerId, r.customer.name);
      c.returns += Number(r.totalNet);
    }

    const all = Array.from(byCust.values()).sort(
      (a, b) => b.gross - b.returns - (a.gross - a.returns),
    );
    const sliced = limit === Infinity ? all : all.slice(0, limit);

    let totalNet = 0;
    const rows: string[][] = sliced.map((b, idx) => {
      const net = b.gross - b.returns;
      totalNet += net;
      return [
        String(idx + 1),
        b.name,
        String(b.docCount),
        fmtMoneyAlways(b.gross),
        b.returns > 0 ? fmtMoneyAlways(b.returns) : "—",
        fmtMoneyAlways(net),
      ];
    });

    const totals = [
      { label: "Customers", value: String(sliced.length) },
      { label: "Net Sales", value: fmtMoneyAlways(totalNet), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Customer", "Bills / Invoices", "Gross Sales", "Returns", "Net Sales"],
      align: ["center", "left", "right", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Sales by customer generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT SALES-BY-CUSTOMER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
