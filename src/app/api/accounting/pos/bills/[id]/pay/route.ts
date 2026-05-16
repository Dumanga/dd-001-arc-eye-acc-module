// POST /api/accounting/pos/bills/[id]/pay
//
// Validates payments, writes the payment rows, transitions the bill from
// DRAFT → COMPLETED, posts journal entries via `postPosBillApproval`, and
// decrements branch stock — all inside one Prisma transaction so a posting
// failure rolls the whole thing back. See accounting-theories.md § 7.1 /
// § 7.2 / § 7.3.
//
// Body shape (also locked by the spec):
//   {
//     paymentMethod: 'CASH' | 'CARD' | 'MIXED' | 'SPLIT',
//     payments: [
//       { method: 'CASH' | 'CARD' | 'SPLIT', cashAccountId?, merchantClientId?, amount }
//     ],
//     primaryCashAccountId?: string  // for next-bill default memory
//   }
//
// Validations (per pos-integration-flow.md § 5.7):
//   • payments are non-empty
//   • payment.amount sums to bill.total within 1e-9 tolerance
//   • CASH/CARD rows require cashAccountId, merchantClientId null
//   • SPLIT rows require merchantClientId (isMerchant=true), cashAccountId null
//   • If any tender = SPLIT then bill.customerId must be a registered
//     customer (not the walk-in row), per theory § 7.2
//   • MIXED needs at least 2 cash-side rows with different cashAccountIds

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { billQueryInclude, serializeBill } from "@/lib/accounting/pos-bill";
import { postPosBillApproval } from "@/lib/accounting/pos-bill-posting";

type PaymentRow = {
  method: "CASH" | "CARD" | "SPLIT" | "REDEEM_VOUCHER";
  cashAccountId?: string | null;
  merchantClientId?: string | null;
  voucherSerialId?: string | null;
  amount: number;
};

function parsePayments(value: unknown): PaymentRow[] | null {
  if (!Array.isArray(value)) return null;
  const out: PaymentRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const method = typeof r.method === "string" ? r.method.toUpperCase() : "";
    if (method !== "CASH" && method !== "CARD" && method !== "SPLIT" && method !== "REDEEM_VOUCHER") return null;
    const amt = Number(typeof r.amount === "number" ? r.amount : (r.amount as string));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    out.push({
      method: method as PaymentRow["method"],
      cashAccountId: typeof r.cashAccountId === "string" ? r.cashAccountId : null,
      merchantClientId: typeof r.merchantClientId === "string" ? r.merchantClientId : null,
      voucherSerialId: typeof r.voucherSerialId === "string" ? r.voucherSerialId : null,
      amount: amt,
    });
  }
  return out;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const summaryMethodRaw = typeof body.paymentMethod === "string" ? body.paymentMethod.toUpperCase() : "";
    const summaryMethod = ["CASH", "CARD", "MIXED", "SPLIT"].includes(summaryMethodRaw)
      ? (summaryMethodRaw as "CASH" | "CARD" | "MIXED" | "SPLIT")
      : null;
    if (!summaryMethod) {
      return NextResponse.json(fail("Pick a payment method.", "VALIDATION"), { status: 422 });
    }
    const payments = parsePayments(body.payments);
    if (!payments || payments.length === 0) {
      return NextResponse.json(fail("At least one payment row is required.", "VALIDATION"), {
        status: 422,
      });
    }
    const primaryCashAccountId =
      typeof body.primaryCashAccountId === "string" ? body.primaryCashAccountId.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.accountingPosBill.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, isWalkIn: true, isMerchant: true } },
          lines: { select: { id: true, productId: true, quantity: true } },
        },
      });
      if (!bill) throw new Error("BILL_NOT_FOUND:POS bill not found.");
      if (bill.cashierId !== currentUser.id) {
        throw new Error("BILL_NOT_OWNED:Bill belongs to another cashier.");
      }
      if (bill.status !== "DRAFT") {
        throw new Error("BILL_NOT_PAYABLE:Only draft bills can be paid.");
      }
      if (bill.lines.length === 0) {
        throw new Error("BILL_EMPTY:Add at least one line before paying.");
      }

      // Sum check
      const billTotal = Number(bill.total);
      const sum = payments.reduce((acc, p) => acc + p.amount, 0);
      if (Math.abs(sum - billTotal) > 1e-2) {
        throw new Error(
          `PAYMENT_MISMATCH:Payments total (${sum.toFixed(2)}) does not match bill total (${billTotal.toFixed(2)}).`
        );
      }

      // Per-row shape check
      let merchantClientId: string | null = null;
      const cashAccounts: Set<string> = new Set();
      const voucherSerials: Set<string> = new Set();
      let hasSplit = false;
      let hasCashSide = false;
      let hasVoucherRedemption = false;
      for (const p of payments) {
        if (p.method === "SPLIT") {
          hasSplit = true;
          if (!p.merchantClientId) {
            throw new Error("SPLIT_REQUIRES_MERCHANT:SPLIT tender row needs a merchant.");
          }
          if (p.cashAccountId) {
            throw new Error("SPLIT_NO_CASH_ACCOUNT:SPLIT tender row must not carry a cash account.");
          }
          if (merchantClientId && merchantClientId !== p.merchantClientId) {
            throw new Error(
              "SPLIT_MULTIPLE_MERCHANTS:Only one merchant per bill is supported in this phase."
            );
          }
          merchantClientId = p.merchantClientId ?? null;
        } else if (p.method === "REDEEM_VOUCHER") {
          hasVoucherRedemption = true;
          if (!p.voucherSerialId) {
            throw new Error(
              "REDEEM_VOUCHER_REQUIRES_SERIAL:REDEEM_VOUCHER tender row needs a voucher serial id.",
            );
          }
          if (p.cashAccountId || p.merchantClientId) {
            throw new Error(
              "REDEEM_VOUCHER_NO_OTHER_REFS:REDEEM_VOUCHER row must not carry a cash account or merchant.",
            );
          }
          if (voucherSerials.has(p.voucherSerialId)) {
            throw new Error(
              "REDEEM_VOUCHER_DUPLICATE:Same voucher serial cannot be redeemed twice on a bill.",
            );
          }
          voucherSerials.add(p.voucherSerialId);
        } else {
          // CASH or CARD
          hasCashSide = true;
          if (!p.cashAccountId) {
            throw new Error(`${p.method}_REQUIRES_CASH_ACCOUNT:Pick a cash/cash-equivalent account.`);
          }
          if (p.merchantClientId) {
            throw new Error(`${p.method}_NO_MERCHANT:Cash/Card rows must not carry a merchant.`);
          }
          cashAccounts.add(p.cashAccountId);
        }
      }

      if (summaryMethod === "MIXED") {
        // MIXED can be either:
        //   • two cash-equivalent accounts, OR
        //   • cash + voucher redemption, OR
        //   • voucher redemption + voucher redemption (multi-voucher)
        // The common shape is "two tender types covering one bill".
        const distinctTenderShapes = cashAccounts.size + (hasVoucherRedemption ? 1 : 0);
        if (distinctTenderShapes < 2) {
          throw new Error(
            "MIXED_NEEDS_TWO_TENDERS:MIXED bills need two distinct tenders (two cash accounts, or cash + voucher).",
          );
        }
        if (hasSplit) {
          throw new Error("MIXED_NO_SPLIT:MIXED cannot mix with SPLIT in this phase.");
        }
      }
      if (summaryMethod === "SPLIT") {
        if (!hasSplit) {
          throw new Error("SPLIT_REQUIRES_SPLIT_ROW:SPLIT bills need at least one SPLIT tender row.");
        }
        if (hasCashSide) {
          throw new Error("SPLIT_NO_CASH_SIDE:SPLIT bills cannot mix with cash/card in this phase.");
        }
        if (hasVoucherRedemption) {
          throw new Error("SPLIT_NO_VOUCHER:SPLIT cannot mix with voucher redemption in this phase.");
        }
        // Per theory § 7.2: SPLIT requires registered customer, walk-in rejected.
        if (bill.customer.isWalkIn) {
          throw new Error("SPLIT_REQUIRES_REAL_CUSTOMER:Pick a registered customer for SPLIT bills.");
        }
      }

      // Validate referenced FKs exist + have correct flags
      if (cashAccounts.size > 0) {
        const accCount = await tx.chartOfAccount.count({
          where: { id: { in: [...cashAccounts] }, isActive: true },
        });
        if (accCount !== cashAccounts.size) {
          throw new Error("CASH_ACCOUNT_INVALID:One of the selected cash accounts is not active.");
        }
      }
      if (merchantClientId) {
        const merchant = await tx.accountingClient.findUnique({
          where: { id: merchantClientId },
          select: { isMerchant: true },
        });
        if (!merchant?.isMerchant) {
          throw new Error("MERCHANT_INVALID:Selected merchant is not flagged as a merchant.");
        }
      }
      // Voucher serial validation: must (a) exist, (b) be in ISSUED
      // state — i.e., referenced by a COMPLETED bill line as the
      // selling line's voucherSerialId, (c) NOT already be referenced
      // by another COMPLETED bill payment as a REDEEM_VOUCHER row
      // (already redeemed). Per theory § 7.4.
      for (const serialId of voucherSerials) {
        const serial = await tx.accountingGoodsReceiptLineSerial.findUnique({
          where: { id: serialId },
          include: {
            posBillLines: {
              where: { posBill: { status: "COMPLETED" } },
              select: { id: true, productId: true, product: { select: { incomeAccountId: true } } },
            },
            posBillPayments: {
              where: { method: "REDEEM_VOUCHER", bill: { status: "COMPLETED" } },
              select: { id: true },
            },
          },
        });
        if (!serial) {
          throw new Error(`VOUCHER_SERIAL_NOT_FOUND:Voucher serial ${serialId} not found.`);
        }
        if (serial.posBillLines.length === 0) {
          throw new Error(
            `VOUCHER_SERIAL_NOT_ISSUED:${serial.serialNumber}:Voucher serial has not been sold yet — only ISSUED serials can be redeemed.`,
          );
        }
        if (serial.posBillPayments.length > 0) {
          throw new Error(
            `VOUCHER_SERIAL_REDEEMED:${serial.serialNumber}:This voucher serial has already been redeemed.`,
          );
        }
      }

      // Final stock re-check (per theory § 7 cap rule — another cashier may
      // have just oversold our reservation)
      for (const line of bill.lines) {
        const stock = await tx.accountingProductStock.findFirst({
          where: { productId: line.productId, storeId: bill.storeId },
          select: { qtyOnHand: true },
        });
        const onHand = Number(stock?.qtyOnHand ?? 0);
        if (Number(line.quantity) > onHand + 1e-9) {
          throw new Error(
            `STOCK_DEPLETED:Branch stock dropped below this bill's qty for one of the lines.`
          );
        }
      }

      // Write payment rows, set summary fields, transition the bill status
      // to COMPLETED, then post journal entries + decrement branch stock
      // via postPosBillApproval (per accounting-theories.md § 7.1 / § 7.2 /
      // § 7.3). Everything sits inside this Prisma transaction so a
      // posting failure rolls the status flip back too.
      await tx.accountingPosBillPayment.deleteMany({ where: { billId: id } });
      await tx.accountingPosBillPayment.createMany({
        data: payments.map((p, idx) => ({
          billId: id,
          method: p.method,
          cashAccountId: p.cashAccountId ?? null,
          merchantClientId: p.merchantClientId ?? null,
          voucherSerialId: p.voucherSerialId ?? null,
          amount: new Prisma.Decimal(p.amount.toFixed(4)),
          rowOrder: idx,
        })),
      });

      // Set the bill's summary fields BEFORE posting so the posting
      // helper can read paymentMethod + merchantClientId off the bill row.
      await tx.accountingPosBill.update({
        where: { id },
        data: {
          paymentMethod: summaryMethod,
          merchantClientId,
          primaryCashAccountId: primaryCashAccountId || [...cashAccounts][0] || null,
        },
      });

      const postingResult = await postPosBillApproval(tx, {
        billId: id,
        createdById: currentUser.id,
      });

      // Final status flip + record postedAt + posting reference.
      return tx.accountingPosBill.update({
        where: { id },
        data: {
          status: "COMPLETED",
          postedAt: new Date(),
          lastActivityAt: new Date(),
          // postingId column is a snapshot — we don't have a single
          // GL header id since postAccountingTransactions writes many
          // rows; stash a marker so reports can confirm postings ran.
          postingId: `posted:${postingResult.glEntriesWritten}gl/${postingResult.customerLedgerEntriesWritten}cust`,
        },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(
      ok({ bill: serializeBill(result) }, "Bill paid."),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      const message = rest.join(":") || "Unable to pay bill.";
      const status =
        code === "BILL_NOT_FOUND" ? 404 :
        code === "BILL_NOT_OWNED" ? 403 :
        code === "STOCK_DEPLETED" ? 409 :
        422;
      return NextResponse.json(fail(message, code), { status });
    }
    console.error("[POS BILL PAY]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
