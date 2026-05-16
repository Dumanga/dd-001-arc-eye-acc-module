// POST /api/accounting/expenses/[id]/approve
//
// Transitions a DRAFT expense voucher to APPROVED and posts the GL rows per
// accounting-theories.md §8. Idempotent guard: rejects if already APPROVED
// or CANCELLED.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postExpenseVoucherApproval } from "@/lib/accounting/expense-voucher-posting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const voucher = await prisma.accountingExpenseVoucher.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!voucher) {
      return NextResponse.json(
        fail("Expense voucher not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (voucher.status === "APPROVED") {
      return NextResponse.json(
        fail("Expense voucher is already approved.", "ALREADY_APPROVED"),
        { status: 409 }
      );
    }
    if (voucher.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled vouchers cannot be approved.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const statusUpdate = await tx.accountingExpenseVoucher.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });
      if (statusUpdate.count !== 1) {
        throw new Error("EXPENSE_APPROVAL_STATE_CHANGED");
      }

      const posted = await postExpenseVoucherApproval(tx, {
        expenseVoucherId: id,
        createdById: currentUser.id,
      });

      const updated = await tx.accountingExpenseVoucher.findUniqueOrThrow({
        where: { id },
        select: { id: true, voucherNumber: true },
      });

      return { updated, posted };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          voucherNumber: result.updated.voucherNumber,
          glEntriesWritten: result.posted.glEntriesWritten,
          total: result.posted.total.toFixed(2),
        },
        "Expense voucher approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "EXPENSE_APPROVAL_STATE_CHANGED") {
      return NextResponse.json(
        fail("Voucher state changed — refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }
    console.error("[EXPENSE APPROVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
