// GET /api/accounting/reports/stock-movement-register?dateRange=&storeId=&productId=&source=
//
// There is no dedicated stock_movement table — movements are
// synthesized at query time by unioning rows from the source
// documents:
//
//   GRN     → +receivedQty (in)
//   GRR     → -returnQty   (out)  Goods return to supplier
//   INVOICE → -quantity    (out)  Approved invoice line
//   POS     → -quantity    (out)  Completed POS bill line
//   CR      → +returnQty   (in)   Approved customer return line
//
// Each row carries source label, source document number, product
// code/name, branch code, and the signed qty. The endpoint sorts the
// combined feed chronologically and surfaces an In/Out/Net summary.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtDateSlt,
  parseDateRange,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

type Source = "GRN" | "GRR" | "INVOICE" | "POS" | "CR" | "MIN";

type Movement = {
  date: Date;
  source: Source;
  docNo: string;
  productCode: string;
  productName: string;
  storeCode: string;
  inQty: number;
  outQty: number;
};

const ALLOWED_SOURCES = new Set<Source>(["GRN", "GRR", "INVOICE", "POS", "CR", "MIN"]);

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const productId = url.searchParams.get("productId")?.trim() ?? "";
    const sourceRaw = url.searchParams.get("source")?.trim().toUpperCase() ?? "ALL";
    const sourceFilter: Source | null = ALLOWED_SOURCES.has(sourceRaw as Source)
      ? (sourceRaw as Source)
      : null;

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

    // Build a date filter usable across the 5 source queries below.
    const dateWindow: { gte?: Date; lte?: Date } = {};
    if (from) dateWindow.gte = from;
    if (to) dateWindow.lte = to;
    const hasDateWindow = from || to;

    const movements: Movement[] = [];
    const includeAll = !sourceFilter;

    // GRN lines (IN)
    if (includeAll || sourceFilter === "GRN") {
      const grns = await prisma.accountingGoodsReceipt.findMany({
        where: {
          status: "APPROVED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { receiptDate: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          grnNumber: true,
          receiptDate: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              receivedQty: true,
              product: { select: { code: true, salesName: true, purchaseName: true } },
            },
          },
        },
      });
      for (const g of grns) {
        for (const l of g.lines) {
          movements.push({
            date: g.receiptDate,
            source: "GRN",
            docNo: g.grnNumber,
            productCode: l.product.code,
            productName: l.product.salesName ?? l.product.purchaseName ?? l.product.code,
            storeCode: g.store.code,
            inQty: Number(l.receivedQty),
            outQty: 0,
          });
        }
      }
    }

    // Goods Return to supplier (OUT)
    if (includeAll || sourceFilter === "GRR") {
      const grrs = await prisma.accountingGoodsReturn.findMany({
        where: {
          status: "APPROVED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { returnDate: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          returnNumber: true,
          returnDate: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              returnQty: true,
              product: { select: { code: true, salesName: true, purchaseName: true } },
            },
          },
        },
      });
      for (const r of grrs) {
        for (const l of r.lines) {
          movements.push({
            date: r.returnDate,
            source: "GRR",
            docNo: r.returnNumber,
            productCode: l.product.code,
            productName: l.product.salesName ?? l.product.purchaseName ?? l.product.code,
            storeCode: r.store.code,
            inQty: 0,
            outQty: Number(l.returnQty),
          });
        }
      }
    }

    // Invoice (OUT)
    if (includeAll || sourceFilter === "INVOICE") {
      const invs = await prisma.accountingInvoice.findMany({
        where: {
          status: "APPROVED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { invoiceDate: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          invoiceNumber: true,
          invoiceDate: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              quantity: true,
              product: { select: { code: true, salesName: true, purchaseName: true } },
            },
          },
        },
      });
      for (const inv of invs) {
        for (const l of inv.lines) {
          movements.push({
            date: inv.invoiceDate,
            source: "INVOICE",
            docNo: inv.invoiceNumber,
            productCode: l.product.code,
            productName: l.product.salesName ?? l.product.purchaseName ?? l.product.code,
            storeCode: inv.store.code,
            inQty: 0,
            outQty: Number(l.quantity),
          });
        }
      }
    }

    // POS bill (OUT)
    if (includeAll || sourceFilter === "POS") {
      const bills = await prisma.accountingPosBill.findMany({
        where: {
          status: "COMPLETED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { postedAt: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          billNo: true,
          postedAt: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              quantity: true,
              product: { select: { code: true, salesName: true, purchaseName: true } },
            },
          },
        },
      });
      for (const b of bills) {
        if (!b.postedAt) continue;
        for (const l of b.lines) {
          movements.push({
            date: b.postedAt,
            source: "POS",
            docNo: b.billNo,
            productCode: l.product.code,
            productName: l.product.salesName ?? l.product.purchaseName ?? l.product.code,
            storeCode: b.store.code,
            inQty: 0,
            outQty: Number(l.quantity),
          });
        }
      }
    }

    // Customer Returns — INVOICE source returns and POS_BILL source returns;
    // both bring stock back IN. (Returns from cash/card POS aren't supported
    // operationally yet but the SR table covers both branches today.)
    if (includeAll || sourceFilter === "CR") {
      const crs = await prisma.accountingCustomerReturn.findMany({
        where: {
          status: "APPROVED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { returnDate: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          returnNumber: true,
          returnDate: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              returnQty: true,
              product: { select: { code: true, salesName: true, purchaseName: true } },
            },
          },
        },
      });
      for (const r of crs) {
        for (const l of r.lines) {
          movements.push({
            date: r.returnDate,
            source: "CR",
            docNo: r.returnNumber,
            productCode: l.product.code,
            productName: l.product.salesName ?? l.product.purchaseName ?? l.product.code,
            storeCode: r.store.code,
            inQty: Number(l.returnQty),
            outQty: 0,
          });
        }
      }
    }

    // Material Issue Notes — internal consumption (OUT).
    if (includeAll || sourceFilter === "MIN") {
      const mins = await prisma.accountingMaterialIssue.findMany({
        where: {
          status: "APPROVED",
          ...(storeId ? { storeId } : {}),
          ...(hasDateWindow ? { issueDate: dateWindow } : {}),
          ...(productId ? { lines: { some: { productId } } } : {}),
        },
        select: {
          issueNumber: true,
          issueDate: true,
          store: { select: { code: true } },
          lines: {
            ...(productId ? { where: { productId } } : {}),
            select: {
              quantity: true,
              itemCode: true,
              itemName: true,
            },
          },
        },
      });
      for (const m of mins) {
        for (const l of m.lines) {
          movements.push({
            date: m.issueDate,
            source: "MIN",
            docNo: m.issueNumber,
            productCode: l.itemCode,
            productName: l.itemName,
            storeCode: m.store.code,
            inQty: 0,
            outQty: Number(l.quantity),
          });
        }
      }
    }

    // Sort chronologically (oldest first), then by source for ties.
    movements.sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      if (d !== 0) return d;
      return a.source.localeCompare(b.source);
    });

    // Build the rows with a running per-product balance (only when a
    // productId filter was set — running balance across multiple
    // products would be meaningless). Without a product filter the
    // Balance column shows the running In−Out across the result set,
    // which still tells the user net inflow during the period.
    let running = 0;
    const rows: string[][] = movements.map((m, idx) => {
      running += m.inQty - m.outQty;
      return [
        String(idx + 1),
        fmtDateSlt(m.date),
        m.source,
        m.docNo,
        `${m.productCode} ${m.productName}`,
        m.storeCode,
        m.inQty > 0 ? formatQty(m.inQty) : "—",
        m.outQty > 0 ? formatQty(m.outQty) : "—",
        formatSignedQty(running),
      ];
    });

    const sumIn = movements.reduce((s, m) => s + m.inQty, 0);
    const sumOut = movements.reduce((s, m) => s + m.outQty, 0);
    const net = sumIn - sumOut;
    const totals = [
      { label: "Movements", value: String(movements.length) },
      { label: "In", value: formatQty(sumIn) },
      { label: "Out", value: formatQty(sumOut) },
      { label: "Net", value: formatSignedQty(net), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Date", "Source", "Doc No", "Product", "Branch", "In", "Out", "Balance"],
      align: ["center", "left", "left", "left", "left", "left", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Stock movement register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT STOCK-MOVEMENT-REGISTER]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatSignedQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatQty(Math.abs(n))}`;
}
