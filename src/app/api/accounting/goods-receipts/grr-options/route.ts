import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type GrrGrnOption = {
  id: string;
  grnNumber: string;
  receiptDate: string;
  supplierId: string;
  currency: string;
  status: string;
  statusLabel: string;
  lines: Array<{
    grnLineId: string;
    itemId: string;
    itemCode: string;
    itemLabel: string;
    description: string;
    receivedQty: string;
    remainingQty: string; // received - already-approved-returns
    unitPrice: string;
    uomName: string;
    uomBase: string;
  }>;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatNumber(n: number): string {
  return n.toString();
}

// GET /api/accounting/goods-receipts/grr-options
//
// Returns the GRNs that are eligible to be the source of a new goods return.
// Eligibility rules:
//   1. The GRN status must be APPROVED (drafts and cancelled GRNs cannot be
//      returned against — accounting hasn't been booked for them).
//   2. The GRN must have at least one line whose remaining returnable qty
//      is greater than zero, where remaining = receivedQty - approved-returns.
//
// Per-line qty in the response is the remaining returnable qty so the form
// can both display it and clamp the user's input correctly.
export async function GET() {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;

    const grns = await prisma.accountingGoodsReceipt.findMany({
      // Opening Balance GRNs (§1.2) have no supplier — there is no one to
      // return the goods to. Exclude them from the goods-return picker.
      where: { status: "APPROVED", openingBalanceMode: false },
      orderBy: { createdAt: "desc" },
      include: {
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            product: { select: { code: true, purchaseName: true, salesName: true } },
            // Only count approved goods-return rows when working out the
            // remaining returnable qty per line. Drafts shouldn't reduce it.
            returnLines: {
              where: { goodsReturn: { status: "APPROVED" } },
              select: { returnQty: true },
            },
          },
        },
      },
    });

    const items: GrrGrnOption[] = grns
      .map((grn) => ({
        id: grn.id,
        grnNumber: grn.grnNumber,
        receiptDate: formatDate(grn.receiptDate),
        // Filtered to non-opening-balance GRNs above, so supplierId is set.
        supplierId: grn.supplierId!,
        currency: grn.currency,
        status: grn.status,
        statusLabel: "Approved",
        lines: grn.lines.map((line) => {
          const received = Number(line.receivedQty);
          const alreadyReturned = line.returnLines.reduce(
            (sum, rl) => sum + Number(rl.returnQty),
            0
          );
          const remaining = Math.max(0, received - alreadyReturned);
          const productName =
            line.product.purchaseName ?? line.product.salesName ?? line.product.code;
          return {
            grnLineId: line.id,
            itemId: line.productId,
            itemCode: line.product.code,
            itemLabel: `${line.product.code} - ${productName}`,
            description: line.description || productName,
            receivedQty: formatNumber(received),
            remainingQty: formatNumber(remaining),
            unitPrice: Number(line.unitPrice).toFixed(2),
            uomName: line.uomName,
            uomBase: line.uomBase,
          };
        }),
      }))
      // Drop GRNs that have no remaining returnable qty across all lines.
      .filter((grn) => grn.lines.some((line) => Number(line.remainingQty) > 0));

    return NextResponse.json(ok({ items }, "Approved GRNs fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GRR GRN OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
