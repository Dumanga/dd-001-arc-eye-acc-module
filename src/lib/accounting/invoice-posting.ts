import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type PostInvoiceApprovalInput = {
  invoiceId: string;
  createdById: string;
  // When true, will not error if ledger rows already exist for this invoice.
  // Used by future backfill scripts.
  allowExisting?: boolean;
};

export type PostInvoiceApprovalResult = {
  glEntriesWritten: number;
  supplierLedgerEntriesWritten: number;
  customerLedgerEntriesWritten: number;
  grossSalesTotal: number;
  totalCogs: number;
  discountAmount: number;
};

// Posts the accounting transactions for an approved invoice per
// accounting-theories.md §§ 4 and 4.1:
//
//   JE 1 — by sales value:
//     debtor receivable: +grossSales (one row per invoice, per customer)
//     sales income:      +lineGrossSales (one row per inventory line,
//                                         posted to that line's product
//                                         incomeAccountId)
//
//   JE 2 — by cost (per inventory line, weighted-average from GRN history):
//     cost of sales:     +lineCost  (per line, per product cogsAccountId)
//     inventory:         -lineCost  (per line, per product inventoryAccountId)
//
//   JE 3 — by discount (only when invoice.discount > 0):
//     sales discount:    +discount
//     debtor receivable: -discount
//
//   Customer sub-ledger: +grossSales (always); -discount (when present)
//
// Cost basis is the lifetime weighted-average from approved GRN line history
// for the product (theory § 4 "Cost Basis"):
//
//     weighted_avg(productId)
//       = Σ(receivedQty × unitPrice) / Σ(receivedQty)  across approved GRNs
//
// If a product has no approved GRN history, posting fails with
// INV_NO_COST_BASIS. The 3 product account mappings (income/cogs/inventory)
// are required at create time; if any is missing here we fail with
// INV_PRODUCT_ACCOUNTS_MISSING (defensive — should not happen in practice).
export async function postInvoiceApproval(
  tx: Tx,
  input: PostInvoiceApprovalInput
): Promise<PostInvoiceApprovalResult> {
  const invoice = await tx.accountingInvoice.findUniqueOrThrow({
    where: { id: input.invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      currency: true,
      customerId: true,
      storeId: true,
      discount: true,
      lines: {
        select: {
          id: true,
          productId: true,
          itemName: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
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

  const debtorReceivableAccountId = await resolveSystemAccount(tx, "DEBTOR_RECEIVABLE");

  // Resolve weighted-average cost for every distinct inventory product on
  // the invoice in one pass. Reused across lines that share a product.
  const productIds = Array.from(
    new Set(
      invoice.lines
        .filter((l) => l.product.itemType === "INVENTORY_ITEM")
        .map((l) => l.productId)
    )
  );
  const costByProductId = new Map<string, number>();
  for (const productId of productIds) {
    costByProductId.set(productId, await getWeightedAvgCost(tx, productId));
  }

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let grossSalesTotal = 0;
  let totalCogs = 0;

  for (const line of invoice.lines) {
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(unitPrice)) continue;

    const lineGrossSales = Number(line.lineTotal);
    grossSalesTotal += lineGrossSales;

    if (line.product.itemType === "INVENTORY_ITEM") {
      // All three product accounts are required (validated at product create).
      // Defensive check here in case an older row predates the rule.
      if (!line.product.incomeAccountId || !line.product.cogsAccountId || !line.product.inventoryAccountId) {
        throw new Error(
          `INV_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Product is missing income / COGS / inventory account mapping."
        );
      }

      // JE 1 step 2 — sales income at line gross, posted to product's
      // incomeAccountId so per-product P&L slicing is free at report time.
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: lineGrossSales,
        customerId: invoice.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Product income — ${line.itemName}`,
      });

      // JE 2 — cost pair at weighted-avg cost
      const avgCost = costByProductId.get(line.productId);
      if (avgCost === undefined || avgCost <= 0) {
        throw new Error(
          `INV_NO_COST_BASIS:${line.product.code}` +
            ":Cannot determine cost basis — no approved GRN history for this product."
        );
      }
      const lineCost = qty * avgCost;
      totalCogs += lineCost;

      glEntries.push({
        accountId: line.product.cogsAccountId,
        value: lineCost,
        customerId: invoice.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Cost of sales — ${line.itemName}`,
      });
      glEntries.push({
        accountId: line.product.inventoryAccountId,
        value: -lineCost,
        customerId: invoice.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Inventory out (cost) — ${line.itemName}`,
      });
    } else {
      // Service / group items — no inventory, no COGS, no weighted-avg cost.
      // The line value still flows into Debtor Receivable and Sales Income,
      // so the income hit still uses the product's incomeAccountId. If a
      // service item somehow has no incomeAccountId, fail loudly.
      if (!line.product.incomeAccountId) {
        throw new Error(
          `INV_PRODUCT_ACCOUNTS_MISSING:${line.product.code}` +
            ":Service product is missing income account mapping."
        );
      }
      glEntries.push({
        accountId: line.product.incomeAccountId,
        value: lineGrossSales,
        customerId: invoice.customerId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Service income — ${line.itemName}`,
      });
    }
  }

  // JE 1 step 1 — receivable header at gross (one row per invoice).
  glEntries.push({
    accountId: debtorReceivableAccountId,
    value: grossSalesTotal,
    customerId: invoice.customerId,
    narration: `Receivable for ${invoice.invoiceNumber}`,
  });

  // Customer sub-ledger — always one +gross row.
  const customerLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["customerLedgerEntries"] = [
    {
      customerId: invoice.customerId,
      value: grossSalesTotal,
      narration: `Sale invoice — ${invoice.invoiceNumber}`,
    },
  ];

  // JE 3 — header discount layer
  const discountAmount = Math.max(0, Number(invoice.discount ?? 0));
  if (discountAmount > 0) {
    const salesDiscountExpenseAccountId = await resolveSystemAccount(tx, "SALES_DISCOUNT_EXPENSE");
    glEntries.push({
      accountId: salesDiscountExpenseAccountId,
      value: discountAmount,
      customerId: invoice.customerId,
      narration: `Sales discount given — ${invoice.invoiceNumber}`,
    });
    glEntries.push({
      accountId: debtorReceivableAccountId,
      value: -discountAmount,
      customerId: invoice.customerId,
      narration: `Receivable offset for discount — ${invoice.invoiceNumber}`,
    });
    customerLedgerEntries.push({
      customerId: invoice.customerId,
      value: -discountAmount,
      narration: `Header discount on ${invoice.invoiceNumber}`,
    });
  }

  return postAccountingTransactions(tx, {
    documentType: "INV",
    documentId: invoice.id,
    documentNumber: invoice.invoiceNumber,
    documentDate: invoice.invoiceDate,
    storeId: invoice.storeId,
    currency: invoice.currency,
    createdById: input.createdById,
    glEntries,
    customerLedgerEntries,
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    grossSalesTotal,
    totalCogs,
    discountAmount,
  }));
}

// Lifetime weighted-average cost from approved GRN lines for a single
// product. Returns 0 if no approved GRN lines exist (caller throws
// INV_NO_COST_BASIS in that case).
//
// Exported so other "stock-out" postings (POS COGS, Material Issue Note)
// can reuse the same cost-basis source — keeps cost recognition consistent
// across every place inventory leaves the books.
export async function getWeightedAvgCost(tx: Tx, productId: string): Promise<number> {
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

async function resolveSystemAccount(tx: Tx, key: "DEBTOR_RECEIVABLE" | "SALES_DISCOUNT_EXPENSE"): Promise<string> {
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
