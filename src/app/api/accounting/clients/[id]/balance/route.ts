import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

// Returns the customer's current outstanding balance per
// accounting-theories.md § "Integrity Invariant" (customer side):
//
//   SUM(value FROM accountingcustomerledgerentry WHERE customerId = X)
//
// The customer ledger table is the source of truth for per-customer
// balance calculation — it tallies every approved invoice (positive),
// future customer payment receipt (negative), and customer return
// (negative) for the customer. Per the invariant, this sum is always
// equal to SUM(GL value WHERE accountId = DEBTOR_RECEIVABLE AND
// customerId = X), so the displayed balance reconciles to the GL.
//
// Positive balance = customer owes us. Negative = customer has overpaid
// / has credit balance. Zero = settled.
//
// Used by the customer payment receipt create form to show "Outstanding:
// LKR X" next to the picked customer.

export type CustomerBalance = {
  customerId: string;
  customerName: string;
  currency: string;
  balance: string;
  ledgerRowCount: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { id } = await params;

    const customer = await prisma.accountingClient.findUnique({
      where: { id },
      select: { id: true, name: true, currency: true },
    });
    if (!customer) {
      return NextResponse.json(fail("Customer not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    const aggregate = await prisma.accountingCustomerLedgerEntry.aggregate({
      where: { customerId: id },
      _sum: { value: true },
      _count: { id: true },
    });

    const balance = Number(aggregate._sum.value ?? 0);

    const payload: CustomerBalance = {
      customerId: customer.id,
      customerName: customer.name,
      currency: customer.currency || "LKR",
      balance: balance.toFixed(2),
      ledgerRowCount: aggregate._count.id,
    };

    return NextResponse.json(ok(payload, "Customer balance fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GET /api/accounting/clients/[id]/balance]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
