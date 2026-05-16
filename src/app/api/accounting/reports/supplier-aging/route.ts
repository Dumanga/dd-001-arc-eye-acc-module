// GET /api/accounting/reports/supplier-aging?asOfDate=&supplierId=
//
// Supplier aging — payable side. Aggregates per supplier the running
// balance from the supplier ledger as of the chosen date, then
// buckets each unpaid GRN by days-since-receipt:
//
//   ≤ 30 days   → Current
//   31-60 days  → 1-30 (assume net-30 implicit terms)
//   61-90       → 31-60
//   91-120      → 61-90
//   > 120       → Over 90
//
// Outstanding per GRN = grossTotal minus PV allocations against it
// (paying + discount) minus goods-return totalNet against it.

import { NextResponse } from "next/server";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { fmtMoneyAlways, type ReportPayload } from "@/lib/accounting/reports-shared";

type Bucket = "current" | "b1to30" | "b31to60" | "b61to90" | "over90";

function bucketFor(daysSinceReceipt: number): Bucket {
  if (daysSinceReceipt <= 30) return "current";
  if (daysSinceReceipt <= 60) return "b1to30";
  if (daysSinceReceipt <= 90) return "b31to60";
  if (daysSinceReceipt <= 120) return "b61to90";
  return "over90";
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const asOfRaw = url.searchParams.get("asOfDate")?.trim() ?? "";
    const supplierId = url.searchParams.get("supplierId")?.trim() ?? "";

    // Default = "latest" (no upper bound). Explicit asOfDate parses
    // the YYYY-MM-DD picker value. Same reasoning as the customer
    // aging endpoint — defaulting to server-clock "today" is brittle
    // across timezones.
    let asOf: Date | undefined;
    if (asOfRaw) {
      const parsed = new Date(asOfRaw + "T23:59:59.999Z");
      if (!Number.isNaN(parsed.getTime())) asOf = parsed;
    }

    // Pull approved GRNs with their gross/discount lines + linked PV
    // allocations + goods-return totalValue.
    const grns = await prisma.accountingGoodsReceipt.findMany({
      where: {
        status: "APPROVED",
        // Opening Balance GRNs (§1.2) don't post to Accounts Payable, so they
        // can't appear in supplier aging.
        openingBalanceMode: false,
        ...(asOf ? { receiptDate: { lte: asOf } } : {}),
        ...(supplierId ? { supplierId } : {}),
      },
      select: {
        id: true,
        grnNumber: true,
        receiptDate: true,
        supplierId: true,
        supplier: { select: { id: true, name: true, code: true } },
        lines: {
          select: { receivedQty: true, unitPrice: true, discount: true },
        },
        paymentAllocations: {
          where: { paymentVoucher: { status: "APPROVED" } },
          select: { payingAmount: true, discount: true },
        },
        goodsReturns: {
          where: { status: "APPROVED" },
          select: { totalValue: true },
        },
      },
    });

    type SupplierRow = {
      id: string;
      name: string;
      code: string;
      buckets: Record<Bucket, number>;
      total: number;
    };
    const bySupplier = new Map<string, SupplierRow>();

    for (const grn of grns) {
      const gross = grn.lines.reduce(
        (s, l) => s + Number(l.receivedQty) * Number(l.unitPrice),
        0,
      );
      const lineDiscount = grn.lines.reduce((s, l) => s + Number(l.discount), 0);
      const grnNet = gross - lineDiscount;
      const paid = grn.paymentAllocations.reduce(
        (s, a) => s + Number(a.payingAmount) + Number(a.discount),
        0,
      );
      const returned = grn.goodsReturns.reduce((s, r) => s + Number(r.totalValue), 0);
      const outstanding = grnNet - paid - returned;
      if (outstanding <= 0.005) continue;

      // "Now" basis for the days-since-receipt calc: explicit asOf
      // if set, else server clock.
      const asOfMs = asOf ? asOf.getTime() : Date.now();
      const days = Math.max(
        0,
        Math.floor((asOfMs - grn.receiptDate.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const bucket = bucketFor(days);

      // Filtered to non-opening-balance GRNs above, so supplier is always set.
      if (!grn.supplierId || !grn.supplier) continue;
      const existing =
        bySupplier.get(grn.supplierId) ??
        ({
          id: grn.supplierId,
          name: grn.supplier.name,
          code: grn.supplier.code,
          buckets: { current: 0, b1to30: 0, b31to60: 0, b61to90: 0, over90: 0 },
          total: 0,
        } satisfies SupplierRow);
      existing.buckets[bucket] += outstanding;
      existing.total += outstanding;
      bySupplier.set(grn.supplierId, existing);
    }

    const rows = Array.from(bySupplier.values()).sort((a, b) => b.total - a.total);

    const tableRows: string[][] = rows.map((s, idx) => [
      String(idx + 1),
      s.code ? `${s.code} ${s.name}` : s.name,
      s.buckets.current > 0 ? fmtMoneyAlways(s.buckets.current) : "—",
      s.buckets.b1to30 > 0 ? fmtMoneyAlways(s.buckets.b1to30) : "—",
      s.buckets.b31to60 > 0 ? fmtMoneyAlways(s.buckets.b31to60) : "—",
      s.buckets.b61to90 > 0 ? fmtMoneyAlways(s.buckets.b61to90) : "—",
      s.buckets.over90 > 0 ? fmtMoneyAlways(s.buckets.over90) : "—",
      fmtMoneyAlways(s.total),
    ]);

    const grand = rows.reduce((s, r) => s + r.total, 0);
    const totals = [
      { label: "Suppliers", value: String(rows.length) },
      { label: "Total Payable", value: fmtMoneyAlways(grand), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Supplier", "Current", "1-30", "31-60", "61-90", "Over 90", "Total"],
      align: ["center", "left", "right", "right", "right", "right", "right", "right"],
      rows: tableRows,
      totals,
    };

    return NextResponse.json(ok(payload, "Supplier aging report generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT SUPPLIER-AGING]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
