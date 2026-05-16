import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type PvGrnOption = {
  id: string;
  grnNumber: string;
  poNumber: string; // "—" if without-PO
  receiptDate: string;
  dueDate: string;
  supplierId: string;
  currency: string;
  status: string;
  receiptValue: string; // original GRN total (snapshot)
  remainingPayable: string; // GRN total − approved returns − approved PV allocations
  notes: string;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/accounting/goods-receipts/pv-options
//
// Returns the GRNs that are eligible to be allocated against by a new payment
// voucher. Eligibility rules:
//   1. The GRN status must be APPROVED — only approved GRNs have actually
//      booked supplier payable.
//   2. The remaining outstanding payable must be greater than zero, where
//        remainingPayable = grnTotal
//                           − sum(approved goods-return.totalValue)
//                           − sum(approved PV allocation.payableAmount)
//
//      `payableAmount` on a PV allocation is the amount of supplier payable
//      being cleared (= paying + discount per accounting-theories.md § 2.2).
//
// Per-GRN `remainingPayable` is what the form should default the line's payable
// to and what the create + approve endpoints must validate against.
export async function GET() {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "suppliers"]);
    if ("error" in auth) return auth.error;

    const grns = await prisma.accountingGoodsReceipt.findMany({
      // Opening Balance GRNs (§1.2) have no supplier payable, so they cannot
      // be settled by a payment voucher — exclude them from the picker.
      where: { status: "APPROVED", openingBalanceMode: false },
      orderBy: { createdAt: "desc" },
      include: {
        purchaseOrder: { select: { poNumber: true, expectedDate: true } },
        lines: { select: { receivedQty: true, unitPrice: true } },
        // Subtract value of all approved goods returns against this GRN.
        goodsReturns: {
          where: { status: "APPROVED" },
          select: { totalValue: true },
        },
        // Subtract value of all approved PV allocations against this GRN.
        paymentAllocations: {
          where: { paymentVoucher: { status: "APPROVED" } },
          select: { payableAmount: true },
        },
      },
    });

    const items: PvGrnOption[] = grns
      .map((grn) => {
        const grnTotal = grn.lines.reduce(
          (sum, l) => sum + Number(l.receivedQty) * Number(l.unitPrice),
          0
        );
        const returnedTotal = grn.goodsReturns.reduce(
          (sum, gr) => sum + Number(gr.totalValue),
          0
        );
        const allocatedTotal = grn.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.payableAmount),
          0
        );
        const remaining = Math.max(0, grnTotal - returnedTotal - allocatedTotal);
        return {
          id: grn.id,
          grnNumber: grn.grnNumber,
          poNumber: grn.purchaseOrder?.poNumber ?? "—",
          receiptDate: formatDate(grn.receiptDate),
          dueDate: grn.purchaseOrder?.expectedDate
            ? formatDate(grn.purchaseOrder.expectedDate)
            : formatDate(grn.receiptDate),
          // Filtered to non-opening-balance GRNs above, so supplierId is set.
          supplierId: grn.supplierId!,
          currency: grn.currency,
          status: grn.status,
          receiptValue: grnTotal.toFixed(2),
          remainingPayable: remaining.toFixed(2),
          notes: grn.notes,
        };
      })
      // Hide GRNs with nothing left to settle.
      .filter((grn) => Number(grn.remainingPayable) > 0);

    return NextResponse.json(ok({ items }, "Pending payable GRNs fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[PV GRN OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
