// GET /api/accounting/pos-bills/cr-options?customerId=<merchantClientId>
//
// Returns COMPLETED SPLIT POS bills the picked merchant can be
// returned against. Per accounting-theories.md § 7 Returns and
// pos-integration-flow.md § 3.8:
//
//   • Cash / Card / Mixed POS bills are NOT returnable through the
//     Customer Return module — they are settled at POS time and need
//     a separate cash-refund flow (out of scope this phase).
//   • Only SPLIT POS bills are returnable. The "customer" passed in
//     must be the merchant — that's who owes us until they settle
//     via CPR, and that's who the AAR / sub-ledger rows are tagged
//     with on the POS bill posting (per § 7.2).
//   • Voucher lines on a POS bill are filtered out of the returnable
//     line list per § 7.5 (vouchers cannot be returned once issued).

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CrPosBillLineOption = {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  unitPrice: string;
  discount: string;
  originalQty: string;
  remainingQty: string;
  lineTotal: string;
  lineOrder: number;
  // VOUCHER lines are filtered out before the response is built; this
  // field is present so the UI can defensively render a "voucher"
  // indicator if ever surfaced. Always false in current responses.
  isVoucher: boolean;
};

export type CrPosBillOption = {
  id: string;
  billNo: string;
  billDate: string;
  customerId: string; // merchantClientId
  currency: string;
  status: string;
  totalAmount: string;
  paidAmount: string; // reserved for future merchant-CPR settlement
  remainingReturnable: string;
  notes: string;
  endCustomerName: string; // bill.customerId's display name (real client)
  lines: CrPosBillLineOption[];
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const merchantClientId = url.searchParams.get("customerId");
    if (!merchantClientId) {
      return NextResponse.json(
        fail("customerId (merchantClientId) is required.", "CUSTOMER_REQUIRED"),
        { status: 422 },
      );
    }

    const bills = await prisma.accountingPosBill.findMany({
      where: {
        status: "COMPLETED",
        paymentMethod: "SPLIT",
        merchantClientId,
      },
      orderBy: { postedAt: "asc" },
      include: {
        customer: { select: { name: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            description: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            uomName: true,
            uomBase: true,
            uomMinQty: true,
            lineOrder: true,
            voucherSerialId: true,
            product: { select: { itemType: true } },
          },
        },
        // Approved customer returns against this POS bill — subtract
        // their net values from the bill's remaining returnable amount.
        customerReturns: {
          where: { status: "APPROVED" },
          select: {
            totalNet: true,
            lines: { select: { sourcePosBillLineId: true, returnQty: true } },
          },
        },
      },
    });

    const items: CrPosBillOption[] = bills
      .map((bill) => {
        const billTotal = Number(bill.total);
        // Future: when CPR-against-POS-bill lands (merchant settles),
        // subtract the settled portion here. Today CPR allocations
        // only reference invoices, so paidAmount is always 0 for SPLIT
        // POS bills. The cap rule reduces to "remainingReturnable =
        // total − approved CR net".
        const paidAmount = 0;
        const returnedNet = bill.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remainingReturnable = Math.max(
          0,
          billTotal - paidAmount - returnedNet,
        );

        const returnedByLineId = new Map<string, number>();
        for (const r of bill.customerReturns) {
          for (const l of r.lines) {
            if (!l.sourcePosBillLineId) continue;
            returnedByLineId.set(
              l.sourcePosBillLineId,
              (returnedByLineId.get(l.sourcePosBillLineId) ?? 0) +
                Number(l.returnQty),
            );
          }
        }

        return {
          id: bill.id,
          billNo: bill.billNo,
          billDate: bill.postedAt ? formatDate(bill.postedAt) : "",
          customerId: bill.merchantClientId ?? "",
          currency: "LKR",
          status: bill.status,
          totalAmount: billTotal.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          remainingReturnable: remainingReturnable.toFixed(2),
          notes: bill.notes,
          endCustomerName: bill.customer.name,
          lines: bill.lines
            // Filter out voucher lines per theory § 7.5.
            .filter((l) => l.product.itemType !== "VOUCHER")
            .map((line) => {
              const originalQty = Number(line.quantity);
              const alreadyReturned = returnedByLineId.get(line.id) ?? 0;
              const remainingQty = Math.max(
                0,
                originalQty - alreadyReturned,
              );
              return {
                id: line.id,
                itemCode: line.itemCode,
                itemName: line.itemName,
                description: line.description,
                uomName: line.uomName,
                uomBase: line.uomBase,
                uomMinQty: Number(line.uomMinQty).toString(),
                unitPrice: Number(line.unitPrice).toFixed(2),
                discount: Number(line.discount).toFixed(2),
                originalQty: originalQty.toString(),
                remainingQty: remainingQty.toString(),
                lineTotal: Number(line.lineTotal).toFixed(2),
                lineOrder: line.lineOrder,
                isVoucher: false,
              };
            }),
        };
      })
      .filter((bill) => Number(bill.remainingReturnable) > 0);

    return NextResponse.json(
      ok({ items }, "Returnable SPLIT POS bills fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CR POS-BILL OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
