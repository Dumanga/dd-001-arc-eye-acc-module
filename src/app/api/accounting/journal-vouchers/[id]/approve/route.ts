// POST /api/accounting/journal-vouchers/[id]/approve
//
// Transitions a DRAFT journal voucher to POSTED and writes the GL rows per
// accounting-theories.md §9. Idempotent guard: rejects if already POSTED
// or CANCELLED.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postJournalVoucherApproval } from "@/lib/accounting/journal-voucher-posting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const voucher = await prisma.accountingJournalVoucher.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!voucher) {
      return NextResponse.json(
        fail("Journal voucher not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (voucher.status === "POSTED") {
      return NextResponse.json(
        fail("Journal voucher is already posted.", "ALREADY_POSTED"),
        { status: 409 }
      );
    }
    if (voucher.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled vouchers cannot be posted.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const postedAt = new Date();
      const statusUpdate = await tx.accountingJournalVoucher.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "POSTED",
          postedById: currentUser.id,
          postedAt,
        },
      });
      if (statusUpdate.count !== 1) {
        throw new Error("JOURNAL_VOUCHER_STATE_CHANGED");
      }

      const posted = await postJournalVoucherApproval(tx, {
        journalVoucherId: id,
        createdById: currentUser.id,
      });

      const updated = await tx.accountingJournalVoucher.findUniqueOrThrow({
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
        "Journal voucher posted."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "JOURNAL_VOUCHER_STATE_CHANGED") {
      return NextResponse.json(
        fail("Voucher state changed — refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }
    console.error("[JOURNAL VOUCHER POST]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
