// POST /api/accounting/pos/bills/[id]/clear
//
// Removes every line from a DRAFT bill but keeps the bill row alive
// (status stays DRAFT, billNo stays reserved). Use case: cashier
// abandons the customer's selection mid-way but wants to start
// over without burning the bill number. Per pos-integration-flow.md
// § 5.5.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import {
  billQueryInclude,
  recomputeBillTotals,
  serializeBill,
} from "@/lib/accounting/pos-bill";

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
        select: { id: true, status: true, cashierId: true },
      });
      if (!bill) throw new Error("BILL_NOT_FOUND:POS bill not found.");
      if (bill.cashierId !== currentUser.id) {
        throw new Error("BILL_NOT_OWNED:Bill belongs to another cashier.");
      }
      if (bill.status !== "DRAFT") {
        throw new Error("BILL_NOT_EDITABLE:Posted or cancelled bills cannot be cleared.");
      }
      await tx.accountingPosBillLine.deleteMany({ where: { billId: id } });
      await recomputeBillTotals(tx, id);
      return tx.accountingPosBill.findUniqueOrThrow({
        where: { id },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(ok({ bill: serializeBill(result) }, "Bill cleared."), {
      status: 200,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      return NextResponse.json(fail(rest.join(":") || "Unable to clear bill.", code), {
        status: code === "BILL_NOT_FOUND" ? 404 : code === "BILL_NOT_OWNED" ? 403 : 409,
      });
    }
    console.error("[POS BILL CLEAR]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
