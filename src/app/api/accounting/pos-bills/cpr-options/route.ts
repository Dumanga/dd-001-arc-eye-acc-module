// GET /api/accounting/pos-bills/cpr-options?customerId=<merchantClientId>
//
// Returns COMPLETED SPLIT POS bills the merchant still owes us — i.e.
// open allocations that a CPR can clear. Per accounting-theories.md
// § 7.2 — when the merchant transfer arrives, the operator records a
// CPR against the merchant and allocates it to one or more open
// SPLIT POS bills.
//
// Cap math:
//   remainingReceivable = bill.total
//                         − SUM(approved CPR allocations targeting this bill)
//                         − SUM(approved CR net targeting this bill)

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CprPosBillOption = {
  id: string;
  billNo: string;
  billDate: string;
  customerId: string; // merchantClientId
  currency: string;
  status: string;
  totalAmount: string;
  remainingReceivable: string;
  notes: string;
  endCustomerName: string;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const merchantClientId = url.searchParams.get("customerId");
    if (!merchantClientId) {
      return NextResponse.json(
        fail("customerId (merchantClientId) is required.", "CUSTOMER_REQUIRED"),
        { status: 422 },
      );
    }

    const bills = await prisma.accountingPosBill.findMany({
      where: {
        status: "COMPLETED",
        paymentMethod: "SPLIT",
        merchantClientId,
      },
      orderBy: { postedAt: "asc" },
      include: {
        customer: { select: { name: true } },
        paymentAllocations: {
          where: { receipt: { status: "APPROVED" } },
          select: { receivableAmount: true },
        },
        customerReturns: {
          where: { status: "APPROVED" },
          select: { totalNet: true },
        },
      },
    });

    const items: CprPosBillOption[] = bills
      .map((bill) => {
        const billTotal = Number(bill.total);
        const allocated = bill.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        const returnedNet = bill.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remaining = Math.max(0, billTotal - allocated - returnedNet);
        return {
          id: bill.id,
          billNo: bill.billNo,
          billDate: bill.postedAt ? formatDate(bill.postedAt) : "",
          customerId: bill.merchantClientId ?? "",
          currency: "LKR",
          status: bill.status,
          totalAmount: billTotal.toFixed(2),
          remainingReceivable: remaining.toFixed(2),
          notes: bill.notes,
          endCustomerName: bill.customer.name,
        };
      })
      .filter((b) => Number(b.remainingReceivable) > 0);

    return NextResponse.json(
      ok({ items }, "Pending SPLIT POS bills fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CPR POS-BILL OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
