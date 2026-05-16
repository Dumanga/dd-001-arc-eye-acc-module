// POST /api/accounting/pos/bills/[id]/hold
// Body: { note?: string }
//
// Flips a DRAFT bill from "live" to "held" — same row, isHeld=true,
// reservations persist, billNo stays. Per pos-integration-flow.md
// § 3.3 / § 5.6.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { billQueryInclude, serializeBill } from "@/lib/accounting/pos-bill";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;

    const bill = await prisma.accountingPosBill.findUnique({
      where: { id },
      select: { id: true, status: true, isHeld: true, cashierId: true },
    });
    if (!bill) {
      return NextResponse.json(fail("POS bill not found.", "BILL_NOT_FOUND"), { status: 404 });
    }
    if (bill.cashierId !== currentUser.id) {
      return NextResponse.json(fail("Bill belongs to another cashier.", "BILL_NOT_OWNED"), {
        status: 403,
      });
    }
    if (bill.status !== "DRAFT") {
      return NextResponse.json(
        fail("Only draft bills can be held.", "BILL_NOT_EDITABLE"),
        { status: 409 }
      );
    }
    if (bill.isHeld) {
      return NextResponse.json(fail("Bill is already held.", "ALREADY_HELD"), { status: 409 });
    }

    const updated = await prisma.accountingPosBill.update({
      where: { id },
      data: { isHeld: true, heldAt: new Date(), heldNote: note, lastActivityAt: new Date() },
      include: billQueryInclude,
    });

    return NextResponse.json(ok({ bill: serializeBill(updated) }, "Bill held."), { status: 200 });
  } catch (err) {
    console.error("[POS BILL HOLD]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
