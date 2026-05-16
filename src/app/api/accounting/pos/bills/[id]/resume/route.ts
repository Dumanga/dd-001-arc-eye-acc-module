// POST /api/accounting/pos/bills/[id]/resume
//
// Flips a held bill (DRAFT, isHeld=true) back to live (DRAFT,
// isHeld=false) and reattaches it to the calling cashier. Per
// pos-integration-flow.md § 3.3 / § 5.6.
//
// If the cashier already has a different live DRAFT, the resume is
// rejected — the cashier should hold or clear that one first.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { billQueryInclude, serializeBill } from "@/lib/accounting/pos-bill";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.accountingPosBill.findUnique({
        where: { id },
        select: { id: true, status: true, isHeld: true, storeId: true },
      });
      if (!bill) throw new Error("BILL_NOT_FOUND:POS bill not found.");
      if (bill.status !== "DRAFT") {
        throw new Error("BILL_NOT_EDITABLE:Bill cannot be resumed.");
      }
      if (!bill.isHeld) {
        throw new Error("BILL_NOT_HELD:Bill is not in a held state.");
      }

      // Reject if the cashier already has a live DRAFT at this store
      const liveDraft = await tx.accountingPosBill.findFirst({
        where: {
          cashierId: currentUser.id,
          storeId: bill.storeId,
          status: "DRAFT",
          isHeld: false,
        },
        select: { id: true, billNo: true },
      });
      if (liveDraft) {
        throw new Error(
          `LIVE_DRAFT_EXISTS:You already have a live bill ${liveDraft.billNo}. Hold or clear it first.`
        );
      }

      return tx.accountingPosBill.update({
        where: { id },
        data: {
          isHeld: false,
          heldAt: null,
          heldNote: null,
          cashierId: currentUser.id, // reattach to whoever resumed
          lastActivityAt: new Date(),
        },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(ok({ bill: serializeBill(result) }, "Bill resumed."), {
      status: 200,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      return NextResponse.json(fail(rest.join(":") || "Unable to resume.", code), {
        status: code === "BILL_NOT_FOUND" ? 404 : 409,
      });
    }
    console.error("[POS BILL RESUME]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
