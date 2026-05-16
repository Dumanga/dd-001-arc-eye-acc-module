import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CprInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerId: string;
  currency: string;
  status: string;
  totalAmount: string; // original invoice total (after-discount AAR booking)
  remainingReceivable: string; // total − approved customer-payment allocations − approved customer returns
  notes: string;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/accounting/invoices/cpr-options?customerId=<id>
//
// Returns the invoices that are eligible to be allocated against by a new
// customer payment receipt. Eligibility rules:
//   1. The invoice status must be APPROVED — only approved invoices have
//      actually booked customer receivable on the AAR account and customer
//      ledger.
//   2. The remaining outstanding receivable must be greater than zero, where
//        remainingReceivable = invoiceTotal
//                              − sum(approved customer-payment allocations against this invoice)
//                              − sum(approved customer-return totalNet against this invoice)
//
//      `invoice.total` is the after-discount net booking on AAR per § 4.1.
//      Customer returns' `totalNet` (gross − discount) is the actual receivable
//      reduction posted by the return-approval flow (see
//      customer-return-posting.ts) — that's what we subtract here so the
//      picker matches the customer ledger.
export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        fail("customerId is required.", "CUSTOMER_REQUIRED"),
        { status: 422 },
      );
    }

    const invoices = await prisma.accountingInvoice.findMany({
      where: { status: "APPROVED", customerId },
      orderBy: { invoiceDate: "asc" },
      include: {
        // Approved CPR allocations against this invoice — subtract their
        // receivable values from the original invoice total.
        paymentAllocations: {
          where: { receipt: { status: "APPROVED" } },
          select: { receivableAmount: true },
        },
        // Approved customer returns sourced from this invoice — subtract
        // their net values so the outstanding matches the customer ledger.
        customerReturns: {
          where: { status: "APPROVED", sourceType: "INVOICE" },
          select: { totalNet: true },
        },
      },
    });

    const items: CprInvoiceOption[] = invoices
      .map((inv) => {
        const invoiceTotal = Number(inv.total);
        const allocated = inv.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        const returned = inv.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remaining = Math.max(0, invoiceTotal - allocated - returned);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: formatDate(inv.invoiceDate),
          dueDate: formatDate(inv.dueDate),
          customerId: inv.customerId,
          currency: inv.currency,
          status: inv.status,
          totalAmount: invoiceTotal.toFixed(2),
          remainingReceivable: remaining.toFixed(2),
          notes: inv.notes,
        };
      })
      // Hide invoices with nothing left to settle.
      .filter((inv) => Number(inv.remainingReceivable) > 0);

    return NextResponse.json(
      ok({ items }, "Pending receivable invoices fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CPR INVOICE OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
