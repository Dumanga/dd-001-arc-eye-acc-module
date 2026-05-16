// GET /api/accounting/reports/sales-by-product?dateRange=&storeId=&salesChannel=
//
// Per-product revenue + margin from both invoice lines and POS bill
// lines in the period. Branch-scoped.
//
// For each product:
//   qtySold  = SUM(invoiceLine.quantity where status=APPROVED) + SUM(posBillLine.quantity where status=COMPLETED)
//   revenue  = SUM(invoiceLine.lineTotal − apportioned head discount)
//              + SUM(posBillLine.lineTotal)
//   cogs     = SUM(JE.value where accountCategory=EXPENSES, type code matches COGS)
//              filtered by productId in date range
//   grossProfit = revenue − cogs

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

type Channel = "ALL" | "INVOICE" | "POS";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const channelRaw = url.searchParams.get("salesChannel")?.trim().toUpperCase() ?? "ALL";
    const channel: Channel = ["ALL", "INVOICE", "POS"].includes(channelRaw)
      ? (channelRaw as Channel)
      : "ALL";

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

    type ProductBucket = {
      id: string;
      code: string;
      name: string;
      qty: number;
      revenue: number;
      cogs: number;
    };
    const byProduct = new Map<string, ProductBucket>();

    function getBucket(id: string, code: string, name: string): ProductBucket {
      const ex = byProduct.get(id);
      if (ex) return ex;
      const fresh: ProductBucket = { id, code, name, qty: 0, revenue: 0, cogs: 0 };
      byProduct.set(id, fresh);
      return fresh;
    }

    // Invoice side
    if (channel === "ALL" || channel === "INVOICE") {
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
          lines: {
            select: {
              productId: true,
              itemCode: true,
              itemName: true,
              quantity: true,
              lineTotal: true,
              discount: true,
            },
          },
        },
      });
      for (const inv of invs) {
        for (const l of inv.lines) {
          const b = getBucket(l.productId, l.itemCode, l.itemName);
          b.qty += Number(l.quantity);
          b.revenue += Number(l.lineTotal) - Number(l.discount);
        }
      }
    }

    // POS side
    if (channel === "ALL" || channel === "POS") {
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
          lines: {
            select: {
              productId: true,
              itemCode: true,
              itemName: true,
              quantity: true,
              lineTotal: true,
              discount: true,
            },
          },
        },
      });
      for (const b of bills) {
        for (const l of b.lines) {
          const bucket = getBucket(l.productId, l.itemCode, l.itemName);
          bucket.qty += Number(l.quantity);
          bucket.revenue += Number(l.lineTotal) - Number(l.discount);
        }
      }
    }

    // COGS — sum JE rows where documentType ∈ {INV,POS}, account code COGS*, productId match
    const productIds = Array.from(byProduct.keys());
    if (productIds.length) {
      const cogsJe = await prisma.accountingJournalEntry.findMany({
        where: {
          productId: { in: productIds },
          ...(storeId ? { storeId } : {}),
          documentType: { in: ["INV", "POS"] },
          account: { code: { startsWith: "COGS" } },
          ...(from || to
            ? {
                documentDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        select: { productId: true, value: true },
      });
      for (const e of cogsJe) {
        if (!e.productId) continue;
        const b = byProduct.get(e.productId);
        if (!b) continue;
        // value > 0 means COGS debited (cost recognised). value < 0 means COGS reversed.
        b.cogs += Number(e.value);
      }
    }

    const ordered = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);

    let totalRevenue = 0;
    let totalCogs = 0;
    const rows: string[][] = ordered.map((b, idx) => {
      const gp = b.revenue - b.cogs;
      totalRevenue += b.revenue;
      totalCogs += b.cogs;
      const marginPct = b.revenue > 0 ? (gp / b.revenue) * 100 : 0;
      return [
        String(idx + 1),
        b.code,
        b.name,
        b.qty.toString(),
        fmtMoneyAlways(b.revenue),
        b.cogs > 0 ? fmtMoneyAlways(b.cogs) : "—",
        gp !== 0 ? fmtMoneyAlways(gp) : "—",
        b.revenue > 0 ? `${marginPct.toFixed(1)}%` : "—",
      ];
    });

    const totals = [
      { label: "Products", value: String(ordered.length) },
      { label: "Revenue", value: fmtMoneyAlways(totalRevenue) },
      { label: "Gross Profit", value: fmtMoneyAlways(totalRevenue - totalCogs), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Code", "Product", "Qty Sold", "Revenue", "COGS", "Gross Profit", "Margin %"],
      align: ["center", "left", "left", "right", "right", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Sales by product generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT SALES-BY-PRODUCT]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
