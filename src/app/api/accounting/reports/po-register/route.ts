// GET /api/accounting/reports/po-register?dateRange=&storeId=&supplierId=&status=
//
// List of POs in a date range with their total ordered value and
// total received-against value (sum of received-line value across
// linked GRN lines).

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

const STATUS_VALUES = ["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;

// Maps the UI's friendlier status options to the schema enum.
const STATUS_ALIAS: Record<string, (typeof STATUS_VALUES)[number] | undefined> = {
  OPEN: "SENT", // Treat user-friendly "Open" as the SENT state
  PARTIAL: "PARTIALLY_RECEIVED",
  CLOSED: "RECEIVED",
};

const READABLE_STATUS: Record<(typeof STATUS_VALUES)[number], string> = {
  DRAFT: "Draft",
  SENT: "Open",
  PARTIALLY_RECEIVED: "Partial",
  RECEIVED: "Closed",
  CANCELLED: "Cancelled",
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const supplierId = url.searchParams.get("supplierId")?.trim() ?? "";
    const statusRaw = url.searchParams.get("status")?.trim().toUpperCase() ?? "ALL";

    const statusFilter =
      STATUS_VALUES.includes(statusRaw as (typeof STATUS_VALUES)[number])
        ? (statusRaw as (typeof STATUS_VALUES)[number])
        : STATUS_ALIAS[statusRaw];

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingPurchaseOrderWhereInput = {
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(from || to
        ? {
            poDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const pos = await prisma.accountingPurchaseOrder.findMany({
      where,
      orderBy: { poDate: "asc" },
      select: {
        poNumber: true,
        poDate: true,
        status: true,
        supplier: { select: { name: true } },
        store: { select: { code: true } },
        lines: {
          select: { quantity: true, unitPrice: true },
        },
        goodsReceipts: {
          where: { status: "APPROVED" },
          select: {
            lines: {
              select: { receivedQty: true, unitPrice: true, discount: true },
            },
          },
        },
      },
    });

    let totalOrdered = 0;
    let totalReceived = 0;
    const rows: string[][] = pos.map((po, idx) => {
      const ordered = po.lines.reduce(
        (s, l) => s + Number(l.quantity) * Number(l.unitPrice),
        0,
      );
      const received = po.goodsReceipts.reduce(
        (s, g) =>
          s +
          g.lines.reduce(
            (s2, l) =>
              s2 + Number(l.receivedQty) * Number(l.unitPrice) - Number(l.discount),
            0,
          ),
        0,
      );
      totalOrdered += ordered;
      totalReceived += received;
      return [
        String(idx + 1),
        po.poNumber,
        fmtDateSlt(po.poDate),
        po.supplier.name,
        po.store.code,
        READABLE_STATUS[po.status],
        fmtMoneyAlways(ordered),
        received > 0 ? fmtMoneyAlways(received) : "—",
      ];
    });

    const totals = [
      { label: "POs", value: String(pos.length) },
      { label: "Total", value: fmtMoneyAlways(totalOrdered), bold: true },
      { label: "Received", value: fmtMoneyAlways(totalReceived) },
    ];

    const payload: ReportPayload = {
      columns: ["#", "PO No", "Date", "Supplier", "Branch", "Status", "Total", "Received"],
      align: ["center", "left", "left", "left", "left", "left", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Purchase order register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT PO-REGISTER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
