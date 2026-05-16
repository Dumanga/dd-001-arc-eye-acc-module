// GET    /api/accounting/pos/bills/[id]    — load any bill the cashier owns (or super admin)
// PATCH  /api/accounting/pos/bills/[id]    — patch customer / payment method / cash account
// DELETE /api/accounting/pos/bills/[id]    — cancel a held bill (status → CANCELLED, billNo burned)
//
// The DELETE path is what implements the bill-number burn rule from
// pos-integration-flow.md § 8.4. Cancelled bills keep their billNo
// on the cancelled row; the next NEW bill takes the next sequential
// number — no recycling.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { billQueryInclude, serializeBill } from "@/lib/accounting/pos-bill";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const bill = await prisma.accountingPosBill.findUnique({
      where: { id },
      include: billQueryInclude,
    });
    if (!bill) {
      return NextResponse.json(fail("POS bill not found.", "BILL_NOT_FOUND"), { status: 404 });
    }
    // Branch users can only view bills at their assigned store; super
    // admin can view any bill.
    if (currentUser.role !== "SUPER_ADMIN" && currentUser.storeId !== bill.storeId) {
      return NextResponse.json(fail("Bill belongs to another branch.", "BILL_OUT_OF_SCOPE"), {
        status: 403,
      });
    }
    return NextResponse.json(ok({ bill: serializeBill(bill) }, "POS bill loaded."));
  } catch (err) {
    console.error("[POS BILL GET]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes : null;

    const bill = await prisma.accountingPosBill.findUnique({
      where: { id },
      select: { id: true, status: true, cashierId: true, storeId: true },
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
        fail("Only draft bills can be edited.", "BILL_NOT_EDITABLE"),
        { status: 409 }
      );
    }

    // If a customer is being patched, validate it exists and is not a
    // merchant — merchants can only sit on the merchantClientId column
    // (set during SPLIT tender selection in the /pay endpoint, not here).
    if (customerId) {
      const customer = await prisma.accountingClient.findUnique({
        where: { id: customerId },
        select: { id: true, isMerchant: true },
      });
      if (!customer) {
        return NextResponse.json(fail("Customer not found.", "CUSTOMER_NOT_FOUND"), { status: 404 });
      }
      if (customer.isMerchant) {
        return NextResponse.json(
          fail("Merchants cannot be the bill's customer; use the SPLIT picker.", "CUSTOMER_IS_MERCHANT"),
          { status: 422 }
        );
      }
    }

    const updated = await prisma.accountingPosBill.update({
      where: { id },
      data: {
        ...(customerId ? { customerId } : {}),
        ...(notes !== null ? { notes } : {}),
        lastActivityAt: new Date(),
      },
      include: billQueryInclude,
    });

    return NextResponse.json(ok({ bill: serializeBill(updated) }, "Bill updated."), { status: 200 });
  } catch (err) {
    console.error("[POS BILL PATCH]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
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
        fail("Only draft bills can be cancelled.", "BILL_NOT_EDITABLE"),
        { status: 409 }
      );
    }
    if (!bill.isHeld) {
      // Live drafts use /clear to empty lines without burning the billNo.
      // Deleting a live draft would burn the number unintentionally.
      return NextResponse.json(
        fail(
          "Live drafts can be cleared but not deleted. Hold the bill first if you want to discard it.",
          "DELETE_REQUIRES_HOLD"
        ),
        { status: 409 }
      );
    }

    // Burn the billNo: row stays, status flips to CANCELLED. Next NEW
    // bill takes the next form-id sequential number; cancelled numbers
    // are NEVER recycled. See pos-integration-flow.md § 8.4.
    const updated = await prisma.accountingPosBill.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelReason: "user-deleted",
        cancelledAt: new Date(),
      },
      select: { id: true, billNo: true, status: true, cancelReason: true, cancelledAt: true },
    });

    return NextResponse.json(
      ok(
        {
          billId: updated.id,
          billNo: updated.billNo,
          status: updated.status,
          cancelReason: updated.cancelReason,
          cancelledAt: updated.cancelledAt?.toISOString() ?? null,
        },
        "Bill deleted (number burned)."
      ),
      { status: 200 }
    );
  } catch (err) {
    console.error("[POS BILL DELETE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
