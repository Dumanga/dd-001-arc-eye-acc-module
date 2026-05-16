// GET /api/accounting/reports/stock-report?storeId=&statusFilter=
//
// Per-product stock snapshot — reuses the same data model as
// /api/accounting/inventory/stock-report but reshapes the response
// into the ReportPayload structure the hub expects. Filters by
// branch (super admin) and stock status (Healthy / Low / Out / All).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { fmtMoneyAlways, type ReportPayload } from "@/lib/accounting/reports-shared";

const LOW_THRESHOLD = 5;

function statusForQty(qty: number): "HEALTHY" | "LOW" | "OUT" {
  if (qty <= 0) return "OUT";
  if (qty <= LOW_THRESHOLD) return "LOW";
  return "HEALTHY";
}

function statusLabel(qty: number): string {
  const s = statusForQty(qty);
  if (s === "OUT") return "Out of stock";
  if (s === "LOW") return "Low stock";
  return "Healthy";
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const statusRaw = url.searchParams.get("statusFilter")?.trim().toUpperCase() ?? "ALL";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingProductWhereInput = {
      itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
      status: "ACTIVE",
      ...(scope.where.storeId
        ? { branchStock: { some: { storeId: scope.where.storeId } } }
        : {}),
    };

    const products = await prisma.accountingProduct.findMany({
      where,
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        salesName: true,
        purchaseName: true,
        itemType: true,
        costPrice: true,
        uomCategory: { select: { baseUnitName: true } },
        branchStock: {
          ...(scope.where.storeId ? { where: { storeId: scope.where.storeId } } : {}),
          select: {
            qtyOnHand: true,
            store: { select: { code: true } },
          },
        },
      },
    });

    let total = 0;
    let unitsTotal = 0;
    let valueTotal = 0;
    const rows: string[][] = [];
    for (const p of products) {
      const qty = p.branchStock.reduce((s, b) => s + Number(b.qtyOnHand), 0);
      const status = statusForQty(qty);
      if (statusRaw === "HEALTHY" && status !== "HEALTHY") continue;
      if (statusRaw === "LOW" && status !== "LOW") continue;
      if (statusRaw === "OUT" && status !== "OUT") continue;
      const cost = Number(p.costPrice ?? 0);
      const stockValue = qty * cost;
      total += 1;
      unitsTotal += qty;
      valueTotal += stockValue;
      rows.push([
        String(rows.length + 1),
        p.code,
        p.salesName ?? p.purchaseName ?? p.code,
        p.itemType === "VOUCHER" ? "Voucher" : "Inventory",
        qty.toString(),
        cost > 0 ? fmtMoneyAlways(cost) : "—",
        stockValue > 0 ? fmtMoneyAlways(stockValue) : "—",
        statusLabel(qty),
      ]);
    }

    const totals = [
      { label: "Products", value: String(total) },
      { label: "Total Units", value: unitsTotal.toLocaleString("en-US") },
      { label: "Total Value", value: fmtMoneyAlways(valueTotal), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Code", "Product", "Type", "On Hand", "Avg Cost", "Stock Value", "Status"],
      align: ["center", "left", "left", "left", "right", "right", "right", "left"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Stock report generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT STOCK-REPORT]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
