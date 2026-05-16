import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CrInvoiceLineOption = {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  unitPrice: string;
  discount: string; // line-level discount on the source invoice line
  originalQty: string;
  remainingQty: string; // originalQty minus already-returned qty across approved CRs
  lineTotal: string;
  lineOrder: number;
};

export type CrInvoiceOption = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerId: string;
  currency: string;
  status: string;
  totalAmount: string; // original invoice total (after-discount AAR booking)
  paidAmount: string; // sum of approved CPR receivable_cleared (cash + discount)
  remainingReturnable: string; // total − paid (paid portion is closed per business rule)
  notes: string;
  lines: CrInvoiceLineOption[];
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/accounting/invoices/cr-options?customerId=<id>
//
// Returns the invoices that are eligible to be returned against by a new
// customer return. Eligibility rules:
//   1. The invoice status must be APPROVED — only approved invoices have
//      actually booked customer receivable on AAR and the customer ledger.
//   2. The remaining returnable value must be greater than zero, where
//        remainingReturnable = invoiceTotal
//                              − sum(approved customer-payment allocations against this invoice)
//                              − (future) sum(approved customer-return values)
//
//      Per the business rule confirmed for this build: the portion of an
//      invoice that has been paid is "closed" — the customer paid for those
//      goods, so they cannot be returned without going through a refund flow
//      (out of scope). Only the unpaid portion is returnable.
//
// Each invoice in the response also includes its line snapshots with their
// remaining returnable quantities (= original line qty, since customer
// returns aren't built yet — once they are, this will subtract approved CR
// lines).
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
        // Approved customer returns against this invoice — subtract their
        // net values too (the paid-portion-is-closed cap operates on the
        // unpaid + un-returned slice of the invoice).
        customerReturns: {
          where: { status: "APPROVED" },
          select: {
            totalNet: true,
            lines: { select: { invoiceLineId: true, returnQty: true } },
          },
        },
        lines: {
          orderBy: { lineOrder: "asc" },
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            description: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            uomName: true,
            uomBase: true,
            uomMinQty: true,
            lineOrder: true,
          },
        },
      },
    });

    const items: CrInvoiceOption[] = invoices
      .map((inv) => {
        const invoiceTotal = Number(inv.total);
        const paidAmount = inv.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        const returnedNet = inv.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remainingReturnable = Math.max(
          0,
          invoiceTotal - paidAmount - returnedNet,
        );

        // Per-line returnable qty: original line qty minus already-returned qty
        // across approved customer returns on this invoice.
        const returnedByLineId = new Map<string, number>();
        for (const r of inv.customerReturns) {
          for (const l of r.lines) {
            if (!l.invoiceLineId) continue;
            returnedByLineId.set(
              l.invoiceLineId,
              (returnedByLineId.get(l.invoiceLineId) ?? 0) + Number(l.returnQty),
            );
          }
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: formatDate(inv.invoiceDate),
          dueDate: formatDate(inv.dueDate),
          customerId: inv.customerId,
          currency: inv.currency,
          status: inv.status,
          totalAmount: invoiceTotal.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          remainingReturnable: remainingReturnable.toFixed(2),
          notes: inv.notes,
          lines: inv.lines.map((line) => {
            const originalQty = Number(line.quantity);
            const alreadyReturned = returnedByLineId.get(line.id) ?? 0;
            const remainingQty = Math.max(0, originalQty - alreadyReturned);
            return {
              id: line.id,
              itemCode: line.itemCode,
              itemName: line.itemName,
              description: line.description,
              uomName: line.uomName,
              uomBase: line.uomBase,
              uomMinQty: Number(line.uomMinQty).toString(),
              unitPrice: Number(line.unitPrice).toFixed(2),
              discount: Number(line.discount).toFixed(2),
              originalQty: originalQty.toString(),
              remainingQty: remainingQty.toString(),
              lineTotal: Number(line.lineTotal).toFixed(2),
              lineOrder: line.lineOrder,
            };
          }),
        };
      })
      // Hide invoices with nothing left to return (fully paid or zero-value).
      .filter((inv) => Number(inv.remainingReturnable) > 0);

    return NextResponse.json(
      ok({ items }, "Returnable invoices fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CR INVOICE OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
