import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";
import { getSystemAccountId } from "@/lib/accounting/system-accounts";

type Tx = Prisma.TransactionClient;

export type PostGoodsReturnInput = {
  goodsReturnId: string;
  createdById: string;
  // When true, will not error if ledger rows already exist for this return.
  // Used by future backfill scripts.
  allowExisting?: boolean;
};

export type PostGoodsReturnResult = {
  glEntriesWritten: number;
  supplierLedgerEntriesWritten: number;
  totalReturnValue: number;
};

// Posts the accounting transactions for an approved goods return per
// accounting-theories.md, section 3 (the inverse of GRN approval):
//
//   - One negative GL row per inventory line, hitting product.inventoryAccountId
//     (falls back to the system PRODUCTION_INVENTORY account when missing).
//     Service-item lines do not produce inventory rows; their value still rolls
//     into the supplier-payable header reduction below.
//   - One negative GL row to SUPPLIER_PAYABLE for the total return value.
//   - One negative supplier-ledger row for the total return value.
//
// Skips line postings whose returnQty is zero (no economic event).
export async function postGoodsReturnApproval(
  tx: Tx,
  input: PostGoodsReturnInput
): Promise<PostGoodsReturnResult> {
  const goodsReturn = await tx.accountingGoodsReturn.findUniqueOrThrow({
    where: { id: input.goodsReturnId },
    select: {
      id: true,
      returnNumber: true,
      returnDate: true,
      currency: true,
      supplierId: true,
      storeId: true,
      lines: {
        select: {
          id: true,
          productId: true,
          returnQty: true,
          unitPrice: true,
          description: true,
          product: {
            select: { itemType: true, inventoryAccountId: true, cogsAccountId: true },
          },
        },
        orderBy: { lineOrder: "asc" },
      },
    },
  });

  const fallbackInventoryAccountId = await getSystemAccountId(
    "PRODUCTION_INVENTORY",
    tx
  );
  const supplierPayableAccountId = await getSystemAccountId(
    "SUPPLIER_PAYABLE",
    tx
  );

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let totalValue = 0;

  for (const line of goodsReturn.lines) {
    const qty = Number(line.returnQty);
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || qty <= 0) continue;

    const lineValue = qty * unitPrice;
    totalValue += lineValue;

    // Service items don't sit in inventory — the GRN debited COGS, so the
    // return credits COGS (Cr COGS / Dr AP) to reverse the expense.
    if (line.product.itemType === "SERVICE_ITEM") {
      if (!line.product.cogsAccountId) {
        throw new Error(
          `Goods return ${goodsReturn.returnNumber} has a SERVICE_ITEM line without a COGS account configured`
        );
      }
      glEntries.push({
        accountId: line.product.cogsAccountId,
        value: -lineValue,
        supplierId: goodsReturn.supplierId,
        productId: line.productId,
        sourceLineId: line.id,
        narration: `Service expense reversal — ${line.description || "GRR line"}`,
      });
      continue;
    }

    // Anything else that isn't an inventory item is skipped (no posting
    // story for group items today).
    if (line.product.itemType !== "INVENTORY_ITEM") continue;

    glEntries.push({
      accountId: line.product.inventoryAccountId ?? fallbackInventoryAccountId,
      value: -lineValue,
      supplierId: goodsReturn.supplierId,
      productId: line.productId,
      sourceLineId: line.id,
      narration: `Inventory return — ${line.description || "GRR line"}`,
    });
  }

  // Supplier payable header reduction (one row per goods return)
  glEntries.push({
    accountId: supplierPayableAccountId,
    value: -totalValue,
    supplierId: goodsReturn.supplierId,
    narration: `Supplier payable reduced for ${goodsReturn.returnNumber}`,
  });

  return postAccountingTransactions(tx, {
    documentType: "GRR",
    documentId: goodsReturn.id,
    documentNumber: goodsReturn.returnNumber,
    documentDate: goodsReturn.returnDate,
    storeId: goodsReturn.storeId,
    currency: goodsReturn.currency,
    createdById: input.createdById,
    glEntries,
    supplierLedgerEntries: [
      {
        supplierId: goodsReturn.supplierId,
        value: -totalValue,
        narration: `Goods return — ${goodsReturn.returnNumber}`,
      },
    ],
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    totalReturnValue: totalValue,
  }));
}
