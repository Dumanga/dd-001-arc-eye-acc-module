// POST /api/accounting/pos/bills/[id]/void
//
// Cash refund / void for COMPLETED CASH/CARD/MIXED POS bills. Per
// theory § 7 Returns + pos-integration-flow.md § 3.8 — these bills
// can't go through Customer Returns (no open receivable to reverse);
// they need this dedicated reversal flow instead.
//
// Body: { reason: string }
//
// On success:
//   • Bill status flips COMPLETED → CANCELLED with cancelReason="cash-refunded"
//   • Posting reverses every JE leg, customer ledger, and stock decrement
//     (per pos-bill-void-posting.ts)
//   • A new SR-style void number is allocated for the document number on
//     the reversal rows so they're distinguishable from the original posting

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postPosBillVoid } from "@/lib/accounting/pos-bill-void-posting";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
    if (!reason) {
      return NextResponse.json(
        fail("Void reason is required.", "VALIDATION"),
        { status: 422 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.accountingPosBill.findUnique({
        where: { id },
        select: { id: true, billNo: true, status: true, paymentMethod: true, storeId: true, postedAt: true },
      });
      if (!bill) throw new Error("BILL_NOT_FOUND:POS bill not found.");
      if (bill.status !== "COMPLETED") {
        throw new Error(`BILL_NOT_VOIDABLE:Bill status is ${bill.status}; only COMPLETED bills can be voided.`);
      }
      if (bill.paymentMethod === "SPLIT") {
        throw new Error(
          "SPLIT_USE_RETURNS:SPLIT POS bills should be reversed via the Customer Return module, not the void/refund flow.",
        );
      }

      // Authority — branch users can only void bills at their branch.
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.storeId !== bill.storeId) {
        throw new Error("BILL_OUT_OF_SCOPE:Bill belongs to another branch.");
      }

      // Allocate a void document number — uses the same form-id series
      // as the bill (POS) but suffixed with "-V" to mark it as a void
      // posting. Keeps the original bill's billNo intact on the bill
      // row; the void document number lives only on the GL reversal
      // entries.
      const voidNumber = `${bill.billNo}-V`;

      const posting = await postPosBillVoid(tx, {
        billId: id,
        voidNumber,
        voidDate: new Date(),
        createdById: currentUser.id,
        reason,
      });

      await tx.accountingPosBill.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason: `cash-refunded: ${reason}`.slice(0, 80),
          cancelledAt: new Date(),
        },
      });

      return { voidNumber, totalReversed: posting.totalReversed };
    });

    return NextResponse.json(
      ok(result, `Bill voided. Cash refund of ${result.totalReversed.toFixed(2)} processed.`),
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      const status =
        code === "BILL_NOT_FOUND" ? 404 :
        code === "BILL_OUT_OF_SCOPE" ? 403 :
        code === "BILL_NOT_VOIDABLE" || code === "SPLIT_USE_RETURNS" ? 409 :
        422;
      return NextResponse.json(fail(rest.join(":") || err.message, code), { status });
    }
    console.error("[POS BILL VOID]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
