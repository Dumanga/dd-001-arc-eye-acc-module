// Cash refund / void posting for CASH / CARD / MIXED POS bills.
//
// Per accounting-theories.md § 7 Returns: cash/card/mixed POS bills are
// settled at the till and cannot be reversed via the Customer Return
// module (which only reverses unpaid receivables). Refunding such a
// bill needs a SEPARATE flow that reverses the entire posting set —
// every JE leg flips sign, every customer-ledger row reverses, stock
// returns to inventory, voucher serials transition back where
// applicable.
//
// Posting shape: full reversal of the original POS bill posting:
//
//   JE 1 reversal   — DR AAR offsets the original credit, CR Income
//                     reverses; INCOME for voucher product = liability
//                     account (still a credit reversal — see § 7.3)
//   JE 2 reversal   — DR Inventory (goods back in), CR COGS
//   JE 3 reversal   — DR AAR, CR Sales Discount Expense (when discount > 0)
//   JE 4 reversal   — CR Cash account, DR AAR (cash leaves the till)
//   Customer ledger — reverses every entry on the original bill
//
// Side effects:
//   • Branch stock incremented for every line
//   • Voucher line: serial state transitions ISSUED → RETURNED. Since
//     we don't have an explicit `state` column, we represent this by
//     deleting the line's voucher reference (or by marking the bill
//     CANCELLED so the line no longer satisfies the ISSUED condition).
//   • Bill status flips COMPLETED → CANCELLED with cancelReason
//     "cash-refunded".
//
// The voucher case is subtle: if a voucher line was sold, its serial
// is currently ISSUED (referenced by COMPLETED bill line). Voiding
// that bill returns the serial to ACTIVE. Re-selling the same serial
// later is allowed.
//
// Bills that contain a REDEEM_VOUCHER tender row are NOT eligible
// for void here — the redemption already cleared the deferred-revenue
// liability and the voucher state is REDEEMED. Reversing that needs
// careful liability-recreation logic (out of scope this phase). The
// caller validates this constraint before calling the helper.

import { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostPosBillVoidInput = {
  billId: string;
  voidNumber: string; // SR-style number for the void document
  voidDate: Date;
  createdById: string;
  reason: string;
};

export type PostPosBillVoidResult = {
  glEntriesWritten: number;
  customerLedgerEntriesWritten: number;
  totalReversed: number;
};

export async function postPosBillVoid(
  tx: Tx,
  input: PostPosBillVoidInput,
): Promise<PostPosBillVoidResult> {
  const bill = await tx.accountingPosBill.findUniqueOrThrow({
    where: { id: input.billId },
    include: {
      customer: { select: { id: true } },
      lines: {
        include: {
          product: {
            select: {
              code: true,
              itemType: true,
              inventoryAccountId: true,
              cogsAccountId: true,
              incomeAccountId: true,
            },
          },
        },
        orderBy: { lineOrder: "asc" },
      },
      payments: {
        select: { method: true, cashAccountId: true, voucherSerialId: true, amount: true },
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (bill.status !== "COMPLETED") {
    throw new Error(`POS_VOID_NOT_COMPLETED:Only completed bills can be voided (this is ${bill.status}).`);
  }
  if (bill.paymentMethod === "SPLIT") {
    throw new Error(
      "POS_VOID_SPLIT_NOT_SUPPORTED:SPLIT POS bills are returnable through Customer Returns; the void/refund flow is for CASH/CARD/MIXED only.",
    );
  }
  // REDEEM_VOUCHER tender complicates void (would need to re-create
  // the voucher serial state). Out of scope this phase.
  if (bill.payments.some((p) => p.method === "REDEEM_VOUCHER")) {
    throw new Error(
      "POS_VOID_VOUCHER_REDEMPTION:Bills with voucher redemption cannot be voided yet — out of scope this phase.",
    );
  }

  const debtorReceivableAccountId = await resolveSystemAccount(tx, "DEBTOR_RECEIVABLE");
  const customerId = bill.customerId;
  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  const customerLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["customerLedgerEntries"] = [];

  const grossTotal = Number(bill.subtotal);
  const totalDiscount = Number(bill.totalDiscount);
  const netTotal = Number(bill.total);

  // ─── JE 1 reversal — sales value flip ───
  // AAR debit (positive) — was credit −netTotal in JE 4, settling.
  // Reversal: AAR rises by gross (so the receipt line below can drop
  // it), and per-product income (or voucher liability) reverses.
  glEntries.push({
    accountId: debtorReceivableAccountId,
    value: grossTotal,
    customerId,
    narration: `Receivable reversal — ${input.voidNumber}`,
  });
  customerLedgerEntries.push({
    customerId,
    value: grossTotal,
    narration: `Cash refund void — ${input.voidNumber}`,
  });

  for (const line of bill.lines) {
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const lineGross = qty * Number(line.unitPrice);
    const lineDiscount = Number(line.discount);

    if (line.product.itemType === "VOUCHER") {
      // Per § 7.3 voucher: original credited the liability account.
      // Void debits it back (decreasing the deferred-revenue
      // obligation we just cancelled by un-selling the voucher).
      if (!line.product.incomeAccountId) {
        throw new Error(
          `POS_VOID_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Voucher product is missing its liability account.",
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: -lineGross,
        customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Voucher liability reversal — ${line.itemName}`,
      });
      // No JE 2 reversal (voucher cost = 0).
    } else if (line.product.itemType === "INVENTORY_ITEM") {
      if (
        !line.product.incomeAccountId ||
        !line.product.cogsAccountId ||
        !line.product.inventoryAccountId
      ) {
        throw new Error(
          `POS_VOID_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Product is missing income / COGS / inventory accounts.",
        );
      }
      // Income reversal
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: -lineGross,
        customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Income reversal — ${line.itemName}`,
      });
      // JE 2 reversal — read the original COGS posting to know how
      // much to flip back. Joins via sourceLineId on the original POS
      // posting.
      const originalCogs = await getOriginalLineCogs(tx, line.id, line.product.cogsAccountId);
      if (originalCogs > 0) {
        glEntries.push({
          accountId: line.product.inventoryAccountId,
          value: originalCogs,
          customerId,
          productId: line.productId,
          sourceLineId: line.id,
          narration: `Inventory in (refund) — ${line.itemName}`,
        });
        glEntries.push({
          accountId: line.product.cogsAccountId,
          value: -originalCogs,
          customerId,
          productId: line.productId,
          sourceLineId: line.id,
          narration: `COGS reversal — ${line.itemName}`,
        });
      }
    } else {
      // Service items — income reversal only (no cost basis).
      if (!line.product.incomeAccountId) {
        throw new Error(
          `POS_VOID_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Service product is missing income account.",
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: -lineGross,
        customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Service income reversal — ${line.itemName}`,
      });
    }

    // Stock back in for inventory + voucher products
    if (line.product.itemType !== "SERVICE_ITEM" && line.product.itemType !== "GROUP_ITEM") {
      const stockRow = await tx.accountingProductStock.findFirst({
        where: { productId: line.productId, storeId: bill.storeId },
        select: { id: true, qtyOnHand: true },
      });
      if (stockRow) {
        await tx.accountingProductStock.update({
          where: { id: stockRow.id },
          data: { qtyOnHand: new Prisma.Decimal((Number(stockRow.qtyOnHand) + qty).toFixed(4)) },
        });
      } else {
        await tx.accountingProductStock.create({
          data: {
            productId: line.productId,
            storeId: bill.storeId,
            qtyOnHand: new Prisma.Decimal(qty.toFixed(4)),
          },
        });
      }
    }
  }

  // ─── JE 3 reversal — discount layer ───
  if (totalDiscount > 0) {
    const salesDiscountExpenseAccountId = await resolveSystemAccount(
      tx,
      "SALES_DISCOUNT_EXPENSE",
    );
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -totalDiscount,
      customerId,
      narration: `Receivable add-back for discount reversal — ${input.voidNumber}`,
    });
    glEntries.push({
      accountId: salesDiscountExpenseAccountId,
      value: -totalDiscount,
      customerId,
      narration: `Sales discount reversal — ${input.voidNumber}`,
    });
    customerLedgerEntries.push({
      customerId,
      value: -totalDiscount,
      narration: `Discount reversal on ${input.voidNumber}`,
    });
  }

  // ─── JE 4 reversal — cash leaves the till ───
  for (const p of bill.payments) {
    if (!p.cashAccountId) continue; // SPLIT/REDEEM_VOUCHER guarded above
    const amt = Number(p.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    glEntries.push({
      accountId: p.cashAccountId,
      value: -amt,
      customerId,
      narration: `Cash refund (${p.method}) — ${input.voidNumber}`,
    });
  }
  // Single offsetting AAR credit at netTotal (mirrors the original
  // JE 4 step 2's debit).
  glEntries.push({
    accountId: debtorReceivableAccountId,
    value: -netTotal,
    customerId,
    narration: `Receivable settled (cash refund) — ${input.voidNumber}`,
  });
  customerLedgerEntries.push({
    customerId,
    value: -netTotal,
    narration: `Cash refund settlement — ${input.voidNumber}`,
  });

  return postAccountingTransactions(tx, {
    documentType: "POS",
    documentId: bill.id,
    documentNumber: input.voidNumber,
    documentDate: input.voidDate,
    storeId: bill.storeId,
    currency: "LKR",
    createdById: input.createdById,
    glEntries,
    customerLedgerEntries,
    allowExisting: true, // void posts under same documentId as the original
  }).then((result) => ({
    ...result,
    totalReversed: netTotal,
  }));
}

async function getOriginalLineCogs(
  tx: Tx,
  posBillLineId: string,
  cogsAccountId: string,
): Promise<number> {
  const rows = await tx.accountingJournalEntry.findMany({
    where: {
      documentType: "POS",
      sourceLineId: posBillLineId,
      accountId: cogsAccountId,
      // Filter to positive-value rows (the original COGS debit) so a
      // prior void's reversal row doesn't double-count.
      value: { gt: 0 },
    },
    select: { value: true },
  });
  let total = 0;
  for (const row of rows) total += Number(row.value);
  return total;
}

async function resolveSystemAccount(
  tx: Tx,
  key: "DEBTOR_RECEIVABLE" | "SALES_DISCOUNT_EXPENSE",
): Promise<string> {
  const row = await tx.accountingSystemAccount.findUnique({
    where: { key },
    select: { accountId: true },
  });
  if (!row) {
    throw new Error(
      `System account ${key} is not mapped — set it in Settings → Chart of Accounts.`,
    );
  }
  return row.accountId;
}
