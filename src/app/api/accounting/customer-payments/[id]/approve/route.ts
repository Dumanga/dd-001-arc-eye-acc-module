import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postCustomerPaymentReceiptApproval } from "@/lib/accounting/customer-payment-posting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const receipt = await prisma.accountingCustomerPaymentReceipt.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!receipt) {
      return NextResponse.json(
        fail("Customer payment receipt not found.", "NOT_FOUND"),
        { status: 404 },
      );
    }
    if (receipt.status === "APPROVED") {
      return NextResponse.json(
        fail("Customer payment receipt is already approved.", "ALREADY_APPROVED"),
        { status: 409 },
      );
    }
    if (receipt.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled receipts cannot be approved.", "INVALID_STATE"),
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Re-validate per-invoice cap inside the transaction. Another receipt
      // may have been approved while this one was a draft, so we re-compute
      // the remaining receivable per invoice excluding this draft's own
      // allocations.
      const draftAllocations = await tx.accountingCustomerPaymentAllocation.findMany({
        where: { customerPaymentReceiptId: id },
        select: { invoiceId: true, receivableAmount: true, isOnAccount: true },
      });
      const requestedByInvoiceId = new Map<string, number>();
      for (const a of draftAllocations) {
        if (a.isOnAccount || !a.invoiceId) continue;
        const v = Number(a.receivableAmount);
        requestedByInvoiceId.set(
          a.invoiceId,
          (requestedByInvoiceId.get(a.invoiceId) ?? 0) + v,
        );
      }
      const invoiceIds = Array.from(requestedByInvoiceId.keys());
      if (invoiceIds.length) {
        const invoices = await tx.accountingInvoice.findMany({
          where: { id: { in: invoiceIds } },
          include: {
            // Approved CPR allocations on OTHER receipts — exclude this one
            // since it's still a draft and we're approving it now.
            paymentAllocations: {
              where: {
                receipt: { status: "APPROVED" },
                customerPaymentReceiptId: { not: id },
              },
              select: { receivableAmount: true },
            },
          },
        });
        for (const inv of invoices) {
          const total = Number(inv.total);
          const allocated = inv.paymentAllocations.reduce(
            (sum, a) => sum + Number(a.receivableAmount),
            0,
          );
          const remaining = Math.max(0, total - allocated);
          const requested = requestedByInvoiceId.get(inv.id) ?? 0;
          if (requested > remaining + 1e-9) {
            throw new Error("CPR_APPROVAL_EXCEEDS_REMAINING");
          }
        }
      }

      const approvedAt = new Date();
      const update = await tx.accountingCustomerPaymentReceipt.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });

      if (update.count !== 1) {
        throw new Error("CPR_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingCustomerPaymentReceipt.findUniqueOrThrow({
        where: { id },
        select: { id: true, receiptNumber: true },
      });

      // Post double-entry + customer-ledger transactions per
      // accounting-theories.md (sections 5.1 + 5.2).
      await postCustomerPaymentReceiptApproval(tx, {
        customerPaymentReceiptId: id,
        createdById: currentUser.id,
      });

      return { updated };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          receiptNumber: result.updated.receiptNumber,
        },
        "Customer payment receipt approved.",
      ),
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "CPR_APPROVAL_STATE_CHANGED") {
        return NextResponse.json(
          fail(
            "Receipt approval state changed. Refresh and try again.",
            "INVALID_STATE",
          ),
          { status: 409 },
        );
      }
      if (err.message === "CPR_APPROVAL_EXCEEDS_REMAINING") {
        return NextResponse.json(
          fail(
            "One or more allocations exceed the remaining receivable on the linked invoice. Reduce the amount and try again.",
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
    }

    console.error("[CUSTOMER PAYMENT APPROVE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
