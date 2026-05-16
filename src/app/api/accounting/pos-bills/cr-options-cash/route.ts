// GET /api/accounting/pos-bills/cr-options-cash?customerId=<id>&skip=0&take=20&q=<billNo>
//
// Returns COMPLETED non-SPLIT POS bills (CASH / CARD / MIXED) that
// can be partially or fully returned through the Customer Return
// form. Mirrors `/pos-bills/cr-options` (which serves SPLIT bills)
// but discriminated by paymentMethod and filtered on the bill's
// actual customer rather than merchantClientId.
//
// Pagination + search:
//   • skip / take    — infinite-scroll style; default take=20
//   • q              — case-insensitive substring match on billNo
//
// Line returnable info:
//   • `remainingQty = originalQty − sum(returnQty across approved
//     customer returns for this bill line)` — so the form caps the
//     user's input.
//   • Voucher lines are filtered out — vouchers aren't returnable
//     once issued (per accounting-theories.md § 7.5).

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CrCashPosBillLineOption = {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  unitPrice: string;
  discount: string;
  originalQty: string;
  remainingQty: string;
  lineTotal: string;
  lineOrder: number;
  isVoucher: boolean;
};

export type CrCashPosBillOption = {
  id: string;
  billNo: string;
  billDate: string;
  customerId: string;        // the bill's real customer (walk-in or registered)
  currency: string;
  status: string;
  paymentMethod: "CASH" | "CARD" | "MIXED";
  totalAmount: string;       // full bill total
  paidAmount: string;        // amount settled at the till (always = totalAmount for CASH/CARD/MIXED)
  remainingReturnable: string;
  notes: string;
  customerName: string;
  lines: CrCashPosBillLineOption[];
};

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "0"));
    const take = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(url.searchParams.get("take") ?? PAGE_SIZE)),
    );
    const q = url.searchParams.get("q")?.trim() ?? "";

    const where = {
      status: "COMPLETED" as const,
      paymentMethod: {
        in: ["CASH", "CARD", "MIXED"] as ("CASH" | "CARD" | "MIXED")[],
      },
      customerId,
      ...(q ? { billNo: { contains: q } } : {}),
    };

    const bills = await prisma.accountingPosBill.findMany({
      where,
      orderBy: { postedAt: "desc" },
      skip,
      // Fetch one extra to determine hasMore — same trick the product
      // options endpoint uses.
      take: take + 1,
      include: {
        customer: { select: { name: true } },
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
            voucherSerialId: true,
            product: { select: { itemType: true } },
          },
        },
        customerReturns: {
          where: { status: "APPROVED" },
          select: {
            totalNet: true,
            lines: { select: { sourcePosBillLineId: true, returnQty: true } },
          },
        },
      },
    });

    const hasMore = bills.length > take;
    const page = bills.slice(0, take);

    const items: CrCashPosBillOption[] = page
      .map((bill) => {
        const billTotal = Number(bill.total);
        const returnedNet = bill.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        const remainingReturnable = Math.max(0, billTotal - returnedNet);

        // Map line → already-returned qty across all approved returns.
        const returnedByLineId = new Map<string, number>();
        for (const r of bill.customerReturns) {
          for (const l of r.lines) {
            if (!l.sourcePosBillLineId) continue;
            returnedByLineId.set(
              l.sourcePosBillLineId,
              (returnedByLineId.get(l.sourcePosBillLineId) ?? 0) +
                Number(l.returnQty),
            );
          }
        }

        return {
          id: bill.id,
          billNo: bill.billNo,
          billDate: bill.postedAt ? formatDate(bill.postedAt) : "",
          customerId: bill.customerId,
          currency: "LKR",
          status: bill.status,
          paymentMethod: bill.paymentMethod as "CASH" | "CARD" | "MIXED",
          totalAmount: billTotal.toFixed(2),
          paidAmount: billTotal.toFixed(2),
          remainingReturnable: remainingReturnable.toFixed(2),
          notes: bill.notes,
          customerName: bill.customer.name,
          lines: bill.lines
            // Voucher lines not returnable here per § 7.5.
            .filter((l) => l.product.itemType !== "VOUCHER")
            .map((line) => {
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
                isVoucher: false,
              };
            }),
        };
      })
      // Hide fully-returned bills from the picker.
      .filter((bill) => Number(bill.remainingReturnable) > 0);

    return NextResponse.json(
      ok({ items, hasMore }, "Returnable cash POS bills fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CR CASH POS-BILL OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
