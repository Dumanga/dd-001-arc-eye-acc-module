// GET /api/accounting/reports/pos-bill-history?dateRange=&storeId=&method=&customerId=
//
// Returns COMPLETED POS bills in the given date range. Branch-scoped
// per the standard list rules (branch users locked to their store,
// super admin can pass storeId or omit for all branches).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { POS_ENABLED } from "@/lib/accounting/feature-flags";
import {
  fmtMoneyAlways,
  fmtDateTimeSlt,
  parseDateRange,
  sumDecimals,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

const ALLOWED_METHODS = new Set(["CASH", "CARD", "MIXED", "SPLIT"]);

export async function GET(request: Request) {
  try {
    if (!POS_ENABLED) {
      return NextResponse.json(
        fail("POS reporting is disabled on this deployment.", "FEATURE_DISABLED"),
        { status: 404 }
      );
    }
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const methodRaw = url.searchParams.get("method")?.trim().toUpperCase() ?? "";
    const customerId = url.searchParams.get("customerId")?.trim() ?? "";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingPosBillWhereInput = {
      status: "COMPLETED",
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(ALLOWED_METHODS.has(methodRaw)
        ? { paymentMethod: methodRaw as "CASH" | "CARD" | "MIXED" | "SPLIT" }
        : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to
        ? {
            postedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const bills = await prisma.accountingPosBill.findMany({
      where,
      orderBy: { postedAt: "asc" },
      select: {
        id: true,
        billNo: true,
        postedAt: true,
        paymentMethod: true,
        total: true,
        cashier: { select: { displayName: true } },
        customer: { select: { name: true } },
        merchantClient: { select: { name: true } },
        store: { select: { code: true } },
        _count: { select: { lines: true } },
      },
    });

    const rows: string[][] = bills.map((b, idx) => [
      String(idx + 1),
      b.billNo,
      b.postedAt ? fmtDateTimeSlt(b.postedAt) : "—",
      b.cashier.displayName,
      b.paymentMethod === "SPLIT" && b.merchantClient
        ? `${b.customer.name} → ${b.merchantClient.name}`
        : b.customer.name,
      b.paymentMethod ?? "—",
      String(b._count.lines),
      fmtMoneyAlways(b.total),
    ]);

    // Per-method subtotals
    const sumByMethod = new Map<string, number>();
    for (const b of bills) {
      const m = b.paymentMethod ?? "OTHER";
      sumByMethod.set(m, (sumByMethod.get(m) ?? 0) + Number(b.total));
    }
    const grand = sumDecimals(bills.map((b) => b.total));

    const totals = [
      { label: "Bills", value: String(bills.length) },
      ...Array.from(sumByMethod.entries()).map(([m, v]) => ({
        label: m.charAt(0) + m.slice(1).toLowerCase(),
        value: fmtMoneyAlways(v),
      })),
      { label: "Total", value: fmtMoneyAlways(grand), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Bill No", "Posted", "Cashier", "Customer", "Method", "Items", "Total"],
      align: ["center", "left", "left", "left", "left", "left", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "POS bill history report generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT POS-BILL-HISTORY]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
