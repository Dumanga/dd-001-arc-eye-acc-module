import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostCustomerReturnApprovalInput = {
  customerReturnId: string;
  createdById: string;
  allowExisting?: boolean;
};

export type PostCustomerReturnApprovalResult = {
  glEntriesWritten: number;
  customerLedgerEntriesWritten: number;
  totalGross: number;
  totalCogs: number;
  totalDiscount: number;
};

// Posts the accounting transactions for an approved customer return per
// accounting-theories.md §§ 6.1 and 6.2 — the inverse of invoice approval.
//
//   JE 1 — by sales value (reversal):
//     debtor receivable: -totalGross (one row per return, per customer)
//     sales income:      -lineGross (one row per inventory line, posted to
//                                    that line's product incomeAccountId)
//
//   JE 2 — by cost (reversal, per inventory line):
//     inventory:         +lineCost (positive — goods back in stock)
//     cost of sales:     -lineCost
//
//   JE 3 — by discount reversal (only when totalDiscount > 0):
//     debtor receivable: +totalDiscount
//     sales discount:    -totalDiscount
//
//   Customer sub-ledger: -totalGross (always); +totalDiscount (when present)
//
// Cost basis is read from the original COGS GL row of the source invoice line
// (joined via sourceLineId on the invoice's COGS posting). For a partial
// return (returnQty < originalQty), the proportional cost is used:
//
//     lineCost = (returnQty / originalQty) × originalCogsValue
//
// This guarantees a "perfect reversal" — when all goods come back, the books
// fully reconcile with no residual cost or inventory drift.
export async function postCustomerReturnApproval(
  tx: Tx,
  input: PostCustomerReturnApprovalInput,
): Promise<PostCustomerReturnApprovalResult> {
  const ret = await tx.accountingCustomerReturn.findUniqueOrThrow({
    where: { id: input.customerReturnId },
    select: {
      id: true,
      returnNumber: true,
      returnDate: true,
      currency: true,
      customerId: true,
      storeId: true,
      sourceType: true,
      sourcePosBillId: true,
      lines: {
        select: {
          id: true,
          invoiceLineId: true,
          sourcePosBillLineId: true,
          productId: true,
          itemName: true,
          originalQty: true,
          returnQty: true,
          lineGross: true,
          lineDiscount: true,
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
    },
  });

  // For POS_BILL-source returns, peek at the source bill's payment
  // method + primary cash account. Cash-like bills need an extra
  // cash-refund leg (the original sale already settled the AAR via
  // the till; reversing the receivable without refunding cash would
  // leave AAR negative — i.e. we'd "owe" ourselves). SPLIT bills
  // skip this because they still carry an open receivable against
  // the merchant.
  let cashRefundContext: {
    primaryCashAccountId: string;
  } | null = null;
  if (ret.sourceType === "POS_BILL" && ret.sourcePosBillId) {
    const sourceBill = await tx.accountingPosBill.findUnique({
      where: { id: ret.sourcePosBillId },
      select: { paymentMethod: true, primaryCashAccountId: true },
    });
    if (
      sourceBill &&
      sourceBill.paymentMethod !== "SPLIT" &&
      sourceBill.paymentMethod !== null
    ) {
      if (!sourceBill.primaryCashAccountId) {
        throw new Error(
          "CR_POS_BILL_NO_CASH_ACCOUNT:Source POS bill has no primary cash account — cannot post the cash refund leg.",
        );
      }
      cashRefundContext = {
        primaryCashAccountId: sourceBill.primaryCashAccountId,
      };
    }
  }

  const debtorReceivableAccountId = await resolveSystemAccount(tx, "DEBTOR_RECEIVABLE");

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let totalGross = 0;
  let totalCogs = 0;
  let totalDiscount = 0;

  for (const line of ret.lines) {
    const returnQty = Number(line.returnQty);
    const originalQty = Number(line.originalQty);
    const lineGross = Number(line.lineGross);
    const lineDiscount = Number(line.lineDiscount);
    if (!Number.isFinite(returnQty) || returnQty <= 0) continue;

    totalGross += lineGross;
    totalDiscount += lineDiscount;

    if (line.product.itemType === "INVENTORY_ITEM") {
      if (
        !line.product.incomeAccountId ||
        !line.product.cogsAccountId ||
        !line.product.inventoryAccountId
      ) {
        throw new Error(
          `CR_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Product is missing income / COGS / inventory account mapping.",
        );
      }

      // JE 1 step 2 — income reversal (negative)
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: -lineGross,
        customerId: ret.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Sales return income reversal — ${line.itemName}`,
      });

      // JE 2 — proportional cost reversal at the original cost basis.
      // Read from whichever source document this return points at —
      // INVOICE-source returns join to the original INV posting,
      // POS_BILL-source returns join to the original POS posting.
      let originalLineCogs: number;
      if (ret.sourceType === "POS_BILL") {
        if (!line.sourcePosBillLineId) {
          throw new Error(
            `CR_POS_BILL_LINE_MISSING:${line.product.code}` +
              ":POS bill line reference required for POS_BILL-source customer return.",
          );
        }
        originalLineCogs = await getOriginalLineCogs(
          tx,
          "POS",
          line.sourcePosBillLineId,
          line.product.cogsAccountId,
        );
      } else {
        if (!line.invoiceLineId) {
          throw new Error(
            `CR_INVOICE_LINE_MISSING:${line.product.code}` +
              ":Invoice line reference required for INVOICE-source customer return.",
          );
        }
        originalLineCogs = await getOriginalLineCogs(
          tx,
          "INV",
          line.invoiceLineId,
          line.product.cogsAccountId,
        );
      }
      if (originalLineCogs <= 0 || originalQty <= 0) {
        throw new Error(
          `CR_NO_COST_BASIS:${line.product.code}` +
            ":Cannot determine original cost basis — source invoice line has no COGS posting.",
        );
      }
      const lineCost = (returnQty / originalQty) * originalLineCogs;
      totalCogs += lineCost;

      glEntries.push({
        accountId: line.product.inventoryAccountId,
        value: lineCost,
        customerId: ret.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Inventory in (return) — ${line.itemName}`,
      });
      glEntries.push({
        accountId: line.product.cogsAccountId,
        value: -lineCost,
        customerId: ret.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Cost of sales reversal — ${line.itemName}`,
      });
    } else {
      // Service / group items — no inventory or COGS reversal. Income reversal only.
      if (!line.product.incomeAccountId) {
        throw new Error(
          `CR_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Service product is missing income account mapping.",
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: -lineGross,
        customerId: ret.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Service return income reversal — ${line.itemName}`,
      });
    }
  }

  // JE 1 step 1 — receivable header at gross reversal (one row per return).
  glEntries.push({
    accountId: debtorReceivableAccountId,
    value: -totalGross,
    customerId: ret.customerId,
    narration: `Receivable reversal for ${ret.returnNumber}`,
  });

  // Customer sub-ledger — always one −gross row.
  const customerLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["customerLedgerEntries"] = [
    {
      customerId: ret.customerId,
      value: -totalGross,
      narration: `Sales return — ${ret.returnNumber}`,
    },
  ];

  // JE 3 — discount reversal layer (only when discount being reversed > 0).
  if (totalDiscount > 0) {
    const salesDiscountExpenseAccountId = await resolveSystemAccount(tx, "SALES_DISCOUNT_EXPENSE");
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: totalDiscount,
      customerId: ret.customerId,
      narration: `Receivable add-back for discount reversal — ${ret.returnNumber}`,
    });
    glEntries.push({
      accountId: salesDiscountExpenseAccountId,
      value: -totalDiscount,
      customerId: ret.customerId,
      narration: `Sales discount reversal — ${ret.returnNumber}`,
    });
    customerLedgerEntries.push({
      customerId: ret.customerId,
      value: totalDiscount,
      narration: `Discount reversal on ${ret.returnNumber}`,
    });
  }

  // ─── JE 4 — cash refund leg for non-SPLIT POS source bills ────
  // The income/COGS/inventory/discount reversals above leave AAR
  // sitting at −net for the returned customer. For SPLIT bills
  // that's correct — the merchant's open receivable shrinks. For
  // cash-tendered bills (CASH/CARD/MIXED) the original posting
  // already settled AAR to 0 at sale time, so we need to:
  //   • bump AAR back up by net    (DR  AAR  +net)
  //   • pull cash out of the till  (CR  Cash −net)
  //   • mirror on the customer ledger (+net entry)
  // Net AAR after these legs returns to 0; net cash is −net (money
  // leaves the till); customer ledger nets to 0.
  if (cashRefundContext) {
    const totalNet = Math.max(0, totalGross - totalDiscount);
    if (totalNet > 0) {
      glEntries.push({
        accountId: debtorReceivableAccountId,
        value: totalNet,
        customerId: ret.customerId,
        narration: `Cash refund settlement — ${ret.returnNumber}`,
      });
      glEntries.push({
        accountId: cashRefundContext.primaryCashAccountId,
        value: -totalNet,
        customerId: ret.customerId,
        narration: `Cash refund to customer — ${ret.returnNumber}`,
      });
      customerLedgerEntries.push({
        customerId: ret.customerId,
        value: totalNet,
        narration: `Cash refund settlement — ${ret.returnNumber}`,
      });
    }
  }

  return postAccountingTransactions(tx, {
    documentType: "SR",
    documentId: ret.id,
    documentNumber: ret.returnNumber,
    documentDate: ret.returnDate,
    storeId: ret.storeId,
    currency: ret.currency,
    createdById: input.createdById,
    glEntries,
    customerLedgerEntries,
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    totalGross,
    totalCogs,
    totalDiscount,
  }));
}

// Sums the absolute COGS GL value(s) posted for a source document line
// at the time of approval. `documentType` discriminates INVOICE vs POS
// — both flows post COGS rows tagged with `sourceLineId = lineId`, so
// the lookup shape is identical. Returns 0 if no posting exists
// (caller throws CR_NO_COST_BASIS in that case).
async function getOriginalLineCogs(
  tx: Tx,
  documentType: "INV" | "POS",
  sourceLineId: string,
  cogsAccountId: string,
): Promise<number> {
  const rows = await tx.accountingJournalEntry.findMany({
    where: {
      documentType,
      sourceLineId,
      accountId: cogsAccountId,
    },
    select: { value: true },
  });
  let total = 0;
  for (const row of rows) {
    total += Math.abs(Number(row.value));
  }
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
