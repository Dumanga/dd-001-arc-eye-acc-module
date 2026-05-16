// GET /api/accounting/reports/grn-register?dateRange=&storeId=&supplierId=
//
// List of APPROVED GRNs with their linked PO, supplier, branch,
// item count and gross-less-line-discount net value.

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
    const supplierId = url.searchParams.get("supplierId")?.trim() ?? "";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingGoodsReceiptWhereInput = {
      status: "APPROVED",
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(from || to
        ? {
            receiptDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const grns = await prisma.accountingGoodsReceipt.findMany({
      where,
      orderBy: { receiptDate: "asc" },
      select: {
        grnNumber: true,
        receiptDate: true,
        openingBalanceMode: true,
        supplier: { select: { name: true } },
        store: { select: { code: true } },
        purchaseOrder: { select: { poNumber: true } },
        lines: {
          select: { receivedQty: true, unitPrice: true, discount: true },
        },
        _count: { select: { lines: true } },
      },
    });

    let totalValue = 0;
    const rows: string[][] = grns.map((g, idx) => {
      const net = g.lines.reduce(
        (s, l) => s + Number(l.receivedQty) * Number(l.unitPrice) - Number(l.discount),
        0,
      );
      totalValue += net;
      return [
        String(idx + 1),
        g.grnNumber,
        fmtDateSlt(g.receiptDate),
        g.purchaseOrder?.poNumber ?? "—",
        g.supplier?.name ?? (g.openingBalanceMode ? "Opening Balance" : "—"),
        g.store.code,
        String(g._count.lines),
        fmtMoneyAlways(net),
      ];
    });

    const totals = [
      { label: "GRNs", value: String(grns.length) },
      { label: "Total Value", value: fmtMoneyAlways(totalValue), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "GRN No", "Date", "Linked PO", "Supplier", "Branch", "Items", "Total"],
      align: ["center", "left", "left", "left", "left", "left", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "GRN register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT GRN-REGISTER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
