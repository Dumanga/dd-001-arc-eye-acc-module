import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postPaymentVoucherApproval } from "@/lib/accounting/payment-voucher-posting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const voucher = await prisma.accountingPaymentVoucher.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!voucher) {
      return NextResponse.json(
        fail("Payment voucher not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (voucher.status === "APPROVED") {
      return NextResponse.json(
        fail("Payment voucher is already approved.", "ALREADY_APPROVED"),
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
      // Re-validate per-GRN cap inside the transaction. Another return or PV
      // may have been approved while this one was a draft, so we re-compute
      // the remaining payable per GRN excluding this draft's own allocations
      // and ensure each GRN's total allocation on this voucher still fits.
      const draftAllocations = await tx.accountingPaymentVoucherAllocation.findMany({
        where: { paymentVoucherId: id },
        select: { goodsReceiptId: true, payableAmount: true },
      });
      const requestedByGrnId = new Map<string, number>();
      for (const a of draftAllocations) {
        if (!a.goodsReceiptId) continue;
        const v = Number(a.payableAmount);
        requestedByGrnId.set(
          a.goodsReceiptId,
          (requestedByGrnId.get(a.goodsReceiptId) ?? 0) + v
        );
      }
      const grnIds = Array.from(requestedByGrnId.keys());
      if (grnIds.length) {
        const grns = await tx.accountingGoodsReceipt.findMany({
          where: { id: { in: grnIds } },
          include: {
            lines: { select: { receivedQty: true, unitPrice: true } },
            goodsReturns: {
              where: { status: "APPROVED" },
              select: { totalValue: true },
            },
            // Approved PV allocations on OTHER vouchers — exclude this one
            // since it's still a draft and we're approving it now.
            paymentAllocations: {
              where: {
                paymentVoucher: { status: "APPROVED" },
                paymentVoucherId: { not: id },
              },
              select: { payableAmount: true },
            },
          },
        });
        for (const grn of grns) {
          const grnTotal = grn.lines.reduce(
            (sum, l) => sum + Number(l.receivedQty) * Number(l.unitPrice),
            0
          );
          const returnedTotal = grn.goodsReturns.reduce((sum, r) => sum + Number(r.totalValue), 0);
          const allocatedTotal = grn.paymentAllocations.reduce(
            (sum, a) => sum + Number(a.payableAmount),
            0
          );
          const remaining = Math.max(0, grnTotal - returnedTotal - allocatedTotal);
          const requested = requestedByGrnId.get(grn.id) ?? 0;
          if (requested > remaining + 1e-9) {
            throw new Error("PV_APPROVAL_EXCEEDS_REMAINING");
          }
        }
      }

      const approvedAt = new Date();
      const update = await tx.accountingPaymentVoucher.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });

      if (update.count !== 1) {
        throw new Error("PAYMENT_VOUCHER_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingPaymentVoucher.findUniqueOrThrow({
        where: { id },
        select: { id: true, voucherNumber: true },
      });

      // Post double-entry + supplier-ledger transactions per
      // accounting-theories.md (sections 2.1 + 2.2).
      await postPaymentVoucherApproval(tx, {
        paymentVoucherId: id,
        createdById: currentUser.id,
      });

      return { updated };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          voucherNumber: result.updated.voucherNumber,
        },
        "Payment voucher approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PAYMENT_VOUCHER_APPROVAL_STATE_CHANGED") {
        return NextResponse.json(
          fail(
            "Payment voucher approval state changed. Refresh and try again.",
            "INVALID_STATE"
          ),
          { status: 409 }
        );
      }
      if (err.message === "PV_APPROVAL_EXCEEDS_REMAINING") {
        return NextResponse.json(
          fail(
            "One or more allocations exceed the remaining payable on the linked GRN. Reduce the amount and try again.",
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
    }

    console.error("[PAYMENT VOUCHER APPROVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
