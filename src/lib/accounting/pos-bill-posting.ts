import { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostPosBillInput = {
  billId: string;
  createdById: string;
};

export type PostPosBillResult = {
  glEntriesWritten: number;
  customerLedgerEntriesWritten: number;
  grossSalesTotal: number;
  totalCogs: number;
  totalDiscount: number;
  netTotal: number;
  // The customerId actually used on AAR / sub-ledger rows. For
  // CASH/CARD/MIXED bills this is the bill's customerId (walk-in or
  // registered). For SPLIT bills this is the merchantClientId — the
  // merchant is who owes us until they settle later via CPR.
  receivableCustomerId: string;
};

// Posts the accounting transactions for a POS bill at Pay time, per
// accounting-theories.md § 7 (POS Bill Scenario):
//
//   JE 1 — Sales Value (per § 7.1 / § 7.2)
//     debtor receivable: +grossSales (one row, against `receivableCustomerId`)
//     per-product income: +lineGross (per line — for VOUCHER the
//                                     "income" account is actually a
//                                     current-liability per § 7.3)
//
//   JE 2 — Cost (per § 7.1) — one COGS/Inventory pair per INVENTORY_ITEM
//     line, at lifetime weighted-average cost from approved GRN
//     history. SKIPPED for VOUCHER lines (cost = 0 per § 7.3).
//
//   JE 3 — Line-Level Discount (when SUM(line.discount) > 0)
//     sales discount expense (EES001): +totalDiscount
//     debtor receivable:               -totalDiscount
//
//   JE 4 — Customer Receipt (CASH/CARD/MIXED only — NOT for SPLIT)
//     selected receive-to cash account(s): +amount per payment row
//     debtor receivable:                   -netTotal (one row)
//
//   Customer sub-ledger (against `receivableCustomerId`):
//     +grossSales, -totalDiscount (when > 0), -netTotal (CASH/CARD/MIXED only)
//
// `receivableCustomerId`:
//   • CASH / CARD / MIXED → bill's `customerId` (walk-in row or registered)
//   • SPLIT               → bill's `merchantClientId` (the merchant
//                            owes us until their CPR settles, per § 7.2)
//
// Side effects (also handled here, in the same transaction):
//   • Decrement `accountingproductstock.qtyOnHand` for each line at the
//     bill's storeId. Per theory § 7 cap rule we re-check stock inside
//     the transaction; if any line would go negative, throw
//     STOCK_DEPLETED and roll back.
//   • Voucher serial state is implicit — no explicit `state` column on
//     `accountinggoodsreceiptlineserial`. A voucher is "sold" iff it is
//     referenced by a COMPLETED bill line via `voucherSerialId`. Pickers
//     and lookups derive state from that reference.
//
// If a non-voucher product has no approved GRN history we throw
// POS_NO_COST_BASIS (mirrors the invoice flow's INV_NO_COST_BASIS).
export async function postPosBillApproval(
  tx: Tx,
  input: PostPosBillInput
): Promise<PostPosBillResult> {
  const bill = await tx.accountingPosBill.findUniqueOrThrow({
    where: { id: input.billId },
    select: {
      id: true,
      billNo: true,
      postedAt: true,
      paymentMethod: true,
      storeId: true,
      customerId: true,
      merchantClientId: true,
      total: true,
      totalDiscount: true,
      subtotal: true,
      lines: {
        select: {
          id: true,
          productId: true,
          itemName: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          lineTotal: true,
          voucherSerialId: true,
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
        select: {
          method: true,
          cashAccountId: true,
          merchantClientId: true,
          voucherSerialId: true,
          amount: true,
          rowOrder: true,
          // Need the voucher product's incomeAccountId (which points
          // to the liability account) to debit at redemption.
          voucherSerial: {
            select: {
              serialNumber: true,
              line: {
                select: {
                  product: {
                    select: { incomeAccountId: true, code: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { rowOrder: "asc" },
      },
    },
  });

  if (!bill.paymentMethod) {
    throw new Error("POS_PAYMENT_METHOD_MISSING:Cannot post a bill without a paymentMethod.");
  }

  // Receivable-side customer per § 7.2 / § 7 Customer Treatment table.
  const isSplit = bill.paymentMethod === "SPLIT";
  if (isSplit && !bill.merchantClientId) {
    throw new Error("POS_SPLIT_NO_MERCHANT:SPLIT bill has no merchantClientId.");
  }
  const receivableCustomerId = isSplit ? bill.merchantClientId! : bill.customerId;

  const debtorReceivableAccountId = await resolveSystemAccount(tx, "DEBTOR_RECEIVABLE");

  // Pre-resolve weighted-average cost for every distinct INVENTORY_ITEM
  // product on the bill. VOUCHER lines skip JE 2 entirely per § 7.3.
  const inventoryProductIds = Array.from(
    new Set(
      bill.lines
        .filter((l) => l.product.itemType === "INVENTORY_ITEM")
        .map((l) => l.productId)
    )
  );
  const costByProductId = new Map<string, number>();
  for (const productId of inventoryProductIds) {
    costByProductId.set(productId, await getWeightedAvgCost(tx, productId));
  }

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  const customerLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["customerLedgerEntries"] = [];

  let grossSalesTotal = 0;
  let totalCogs = 0;
  let totalDiscount = 0;

  // ─── Per-line processing: JE 1 step 2 + JE 2 + line discount ───
  for (const line of bill.lines) {
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(unitPrice)) continue;

    // Gross = qty × unitPrice (line.lineTotal is gross − discount, so we
    // recompute gross for clarity. The line.discount column carries the
    // line's discount amount.)
    const lineDiscount = Number(line.discount);
    const lineGross = qty * unitPrice;
    grossSalesTotal += lineGross;
    totalDiscount += lineDiscount;

    if (line.product.itemType === "VOUCHER") {
      // § 7.3: voucher line credits the liability account that the
      // voucher product's `incomeAccountId` points to. JE 2 SKIPPED
      // (cost = 0). Discount on voucher lines is structurally zero
      // (form forces 0; defensive guard).
      if (!line.product.incomeAccountId) {
        throw new Error(
          `POS_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Voucher product is missing its liability (incomeAccountId) mapping."
        );
      }
      if (lineDiscount > 0) {
        throw new Error(
          `POS_VOUCHER_DISCOUNTED:${line.product.code}` +
            ":Voucher lines cannot carry a discount."
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: lineGross,
        customerId: receivableCustomerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Voucher liability accrued — ${line.itemName}`,
      });
      continue;
    }

    if (line.product.itemType === "INVENTORY_ITEM") {
      if (
        !line.product.incomeAccountId ||
        !line.product.cogsAccountId ||
        !line.product.inventoryAccountId
      ) {
        throw new Error(
          `POS_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Product is missing income / COGS / inventory account mapping."
        );
      }
      // JE 1 step 2 — line gross to product income
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: lineGross,
        customerId: receivableCustomerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Product income — ${line.itemName}`,
      });

      // JE 2 — cost pair at weighted-avg cost
      const avgCost = costByProductId.get(line.productId);
      if (avgCost === undefined || avgCost <= 0) {
        throw new Error(
          `POS_NO_COST_BASIS:${line.product.code}` +
            ":Cannot determine cost basis — no approved GRN history for this product."
        );
      }
      const lineCost = qty * avgCost;
      totalCogs += lineCost;

      glEntries.push({
        accountId: line.product.cogsAccountId,
        value: lineCost,
        customerId: receivableCustomerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Cost of sales — ${line.itemName}`,
      });
      glEntries.push({
        accountId: line.product.inventoryAccountId,
        value: -lineCost,
        customerId: receivableCustomerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Inventory out (cost) — ${line.itemName}`,
      });
    } else {
      // Service / group items — same shape as the invoice flow.
      if (!line.product.incomeAccountId) {
        throw new Error(
          `POS_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Service product is missing income account mapping."
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: lineGross,
        customerId: receivableCustomerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Service income — ${line.itemName}`,
      });
    }
  }

  // JE 1 step 1 — receivable header at gross.
  glEntries.push({
    accountId: debtorReceivableAccountId,
    value: grossSalesTotal,
    customerId: receivableCustomerId,
    narration: `Receivable for ${bill.billNo}`,
  });

  // Customer sub-ledger step 1 — +gross
  customerLedgerEntries.push({
    customerId: receivableCustomerId,
    value: grossSalesTotal,
    narration: `POS sale — ${bill.billNo}`,
  });

  // JE 3 — line-level discount (sum of line discounts > 0)
  if (totalDiscount > 0) {
    const salesDiscountExpenseAccountId = await resolveSystemAccount(
      tx,
      "SALES_DISCOUNT_EXPENSE"
    );
    glEntries.push({
      accountId: salesDiscountExpenseAccountId,
      value: totalDiscount,
      customerId: receivableCustomerId,
      narration: `Line discounts — ${bill.billNo}`,
    });
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -totalDiscount,
      customerId: receivableCustomerId,
      narration: `Receivable offset for line discounts — ${bill.billNo}`,
    });
    customerLedgerEntries.push({
      customerId: receivableCustomerId,
      value: -totalDiscount,
      narration: `Line discounts on ${bill.billNo}`,
    });
  }

  const netTotal = grossSalesTotal - totalDiscount;

  // JE 4 — Customer Receipt (CASH/CARD/MIXED only). REDEEM_VOUCHER
  // rows participate here too (per theory § 7.4): instead of debiting
  // a cash account, they debit the voucher's liability account —
  // clearing the deferred-revenue obligation that was created when
  // the voucher was originally sold.
  if (!isSplit) {
    let receiptRowSum = 0;
    for (const p of bill.payments) {
      if (p.method === "SPLIT") continue; // shouldn't happen on non-split bill
      const amt = Number(p.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      if (p.method === "REDEEM_VOUCHER") {
        const liabilityAccountId = p.voucherSerial?.line.product.incomeAccountId;
        if (!liabilityAccountId) {
          throw new Error(
            `REDEEM_VOUCHER_NO_LIABILITY_ACCOUNT:Voucher serial ${p.voucherSerial?.serialNumber ?? "?"} has no liability account on its product.`,
          );
        }
        // Redemption SHRINKS the deferred-revenue liability that was
        // recorded when the voucher was originally sold. Per the
        // additive sign convention (see posting.ts header):
        //   value > 0 grows the natural balance
        //   value < 0 reduces it
        // Liability is credit-normal, so reducing it is a DEBIT to
        // the account — which corresponds to value < 0 here. Writing
        // a positive value would (incorrectly) GROW the liability,
        // which is what was causing POS-2026-00015 to throw the
        // trial balance off by 10,000.
        glEntries.push({
          accountId: liabilityAccountId,
          value: -amt,
          customerId: receivableCustomerId,
          narration: `Voucher redemption (${p.voucherSerial?.serialNumber ?? ""}) — ${bill.billNo}`,
        });
        receiptRowSum += amt;
      } else {
        // CASH or CARD
        if (!p.cashAccountId) {
          throw new Error(
            `POS_PAYMENT_NO_CASH_ACCOUNT:Payment row missing cashAccountId.`,
          );
        }
        glEntries.push({
          accountId: p.cashAccountId,
          value: amt,
          customerId: receivableCustomerId,
          narration: `Cash receipt (${p.method}) — ${bill.billNo}`,
        });
        receiptRowSum += amt;
      }
    }
    if (Math.abs(receiptRowSum - netTotal) > 0.01) {
      throw new Error(
        `POS_PAYMENT_SUM_MISMATCH:Payment rows sum (${receiptRowSum.toFixed(2)}) != net total (${netTotal.toFixed(2)}).`,
      );
    }
    // Single offsetting AAR credit at netTotal.
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -netTotal,
      customerId: receivableCustomerId,
      narration: `Receivable settled (cash receipt) — ${bill.billNo}`,
    });
    customerLedgerEntries.push({
      customerId: receivableCustomerId,
      value: -netTotal,
      narration: `Cash settlement — ${bill.billNo}`,
    });
  }

  // ─── Side effect: branch stock decrement (per theory § 7 stock cap) ───
  // Re-check + decrement INSIDE the same transaction so concurrent bills
  // can't oversell. Voucher lines decrement stock too (a voucher serial is
  // a unit of stock from POS' point of view).
  for (const line of bill.lines) {
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const stockRow = await tx.accountingProductStock.findFirst({
      where: { productId: line.productId, storeId: bill.storeId },
      select: { id: true, qtyOnHand: true },
    });
    if (!stockRow) {
      throw new Error(
        `POS_NO_BRANCH_STOCK:${line.product.code}` +
          ":Product has no branch-stock row at this branch."
      );
    }
    const onHand = Number(stockRow.qtyOnHand);
    if (qty > onHand + 1e-9) {
      throw new Error(
        `STOCK_DEPLETED:${line.product.code}` +
          `:Branch stock dropped to ${onHand.toFixed(2)} below this bill's qty ${qty.toFixed(2)}.`
      );
    }
    await tx.accountingProductStock.update({
      where: { id: stockRow.id },
      data: { qtyOnHand: new Prisma.Decimal((onHand - qty).toFixed(4)) },
    });
  }

  // Voucher serial transitions ACTIVE → ISSUED is currently identified
  // implicitly via the line's voucherSerialId being referenced by a
  // COMPLETED bill — no state column to flip yet. Phase voucher-redemption
  // (§ 7.4) lands the explicit `state` column.

  return postAccountingTransactions(tx, {
    documentType: "POS",
    documentId: bill.id,
    documentNumber: bill.billNo,
    documentDate: new Date(),
    storeId: bill.storeId,
    currency: "LKR",
    createdById: input.createdById,
    glEntries,
    customerLedgerEntries,
    allowExisting: false,
  }).then((result) => ({
    ...result,
    grossSalesTotal,
    totalCogs,
    totalDiscount,
    netTotal,
    receivableCustomerId,
  }));
}

// Lifetime weighted-average cost from approved GRN lines for one product.
// Mirrors invoice-posting.ts. Returns 0 when no approved GRN history.
async function getWeightedAvgCost(tx: Tx, productId: string): Promise<number> {
  const lines = await tx.accountingGoodsReceiptLine.findMany({
    where: {
      productId,
      goodsReceipt: { status: "APPROVED" },
    },
    select: { receivedQty: true, unitPrice: true },
  });

  let totalQty = 0;
  let totalValue = 0;
  for (const line of lines) {
    const qty = Number(line.receivedQty);
    const price = Number(line.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    totalQty += qty;
    totalValue += qty * price;
  }

  if (totalQty <= 0) return 0;
  return totalValue / totalQty;
}

async function resolveSystemAccount(
  tx: Tx,
  key: "DEBTOR_RECEIVABLE" | "SALES_DISCOUNT_EXPENSE"
): Promise<string> {
  const row = await tx.accountingSystemAccount.findUnique({
    where: { key },
    select: { accountId: true },
  });
  if (!row) {
    throw new Error(
      `System account ${key} is not mapped — set it in Settings → Chart of Accounts.`
    );
  }
  return row.accountId;
}
