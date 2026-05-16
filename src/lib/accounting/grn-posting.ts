import type { Prisma } from "@prisma/client";
import { postAccountingTransactions } from "@/lib/accounting/posting";
import { getSystemAccountId } from "@/lib/accounting/system-accounts";

type Tx = Prisma.TransactionClient;

export type PostGrnApprovalInput = {
  grnId: string;
  createdById: string;
  // When true, will not error if ledger rows already exist for this GRN.
  // Used by the backfill script.
  allowExisting?: boolean;
};

export type PostGrnApprovalResult = {
  glEntriesWritten: number;
  supplierLedgerEntriesWritten: number;
  totalReceiptValue: number;
};

// Posts the accounting transactions for an approved GRN per the spec in
// accounting-theories.md, sections 1, 1.1, 1.2, and "Implementation Approach":
//
// Normal supplier GRN (openingBalanceMode = false):
//   - One positive GL row per inventory line, posted at the GROSS line value
//     (qty × unitPrice, before discount), hitting product.inventoryAccountId
//     (falls back to the system PRODUCTION_INVENTORY account when missing).
//   - One positive GL row to SUPPLIER_PAYABLE for the GROSS GRN total.
//   - When line-level discounts exist: one negative GL row to SUPPLIER_PAYABLE
//     and one positive GL row to SALES_DISCOUNT_INCOME, both for the total
//     discount. Net effect on AP settles to the after-discount amount owed.
//   - Supplier ledger gets a positive row for gross + a negative row for any
//     total discount, mirroring the GL.
//
// Opening Balance GRN (openingBalanceMode = true, §1.2):
//   - Same per-line inventory DR rows as above.
//   - Single CR row to the GRN's openingEquityAccountId for the GRN total.
//   - No SUPPLIER_PAYABLE entry, no SALES_DISCOUNT_INCOME entry, and NO
//     supplier-ledger row (there is no supplier).
//   - Discount is forced to 0 at the form/API layer, so no discount logic runs.
//
// Skips line postings whose receivedQty is zero (no economic event). When all
// lines have zero receivedQty totals end up zero and the call short-circuits.
export async function postGrnApproval(
  tx: Tx,
  input: PostGrnApprovalInput
): Promise<PostGrnApprovalResult> {
  const grn = await tx.accountingGoodsReceipt.findUniqueOrThrow({
    where: { id: input.grnId },
    select: {
      id: true,
      grnNumber: true,
      receiptDate: true,
      currency: true,
      supplierId: true,
      storeId: true,
      openingBalanceMode: true,
      openingEquityAccountId: true,
      lines: {
        select: {
          id: true,
          productId: true,
          receivedQty: true,
          unitPrice: true,
          discount: true,
          description: true,
          product: {
            select: { itemType: true, inventoryAccountId: true },
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

  const glEntries: Parameters<typeof postAccountingTransactions>[1]["glEntries"] = [];
  let grossTotal = 0;
  let totalDiscount = 0;

  // ── Per-line inventory DR rows (same shape for both modes) ───────────────
  for (const line of grn.lines) {
    const qty = Number(line.receivedQty);
    const unitPrice = Number(line.unitPrice);
    const lineDiscount = Math.max(0, Number(line.discount ?? 0));
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || qty <= 0) continue;

    const lineGross = qty * unitPrice;
    grossTotal += lineGross;
    totalDiscount += lineDiscount;

    // Service items don't sit in inventory, but the spec says one row per GRN
    // line. We post inventory rows only for inventory items; service-item
    // values still land in the offset account (AP or Equity) via the total.
    if (line.product.itemType !== "INVENTORY_ITEM") continue;

    glEntries.push({
      accountId: line.product.inventoryAccountId ?? fallbackInventoryAccountId,
      value: lineGross,
      supplierId: grn.supplierId,
      productId: line.productId,
      sourceLineId: line.id,
      narration: `Inventory receipt — ${line.description || "GRN line"}`,
    });
  }

  if (grn.openingBalanceMode) {
    // ── §1.2 Opening Balance branch ───────────────────────────────────────
    // Single credit to the selected equity account; no AP, no supplier
    // ledger, no discount logic (discount is forced to 0).
    if (!grn.openingEquityAccountId) {
      throw new Error(
        `Opening Balance GRN ${grn.grnNumber} is missing openingEquityAccountId`
      );
    }
    glEntries.push({
      accountId: grn.openingEquityAccountId,
      value: grossTotal,
      // No supplier on opening balance entries — supplierId stays null
      // and posting.ts will leave the snapshot fields blank.
      narration: `Opening balance equity for ${grn.grnNumber}`,
    });

    return postAccountingTransactions(tx, {
      documentType: "GRN",
      documentId: grn.id,
      documentNumber: grn.grnNumber,
      documentDate: grn.receiptDate,
      storeId: grn.storeId,
      currency: grn.currency,
      createdById: input.createdById,
      glEntries,
      supplierLedgerEntries: [],
      allowExisting: input.allowExisting ?? false,
    }).then((result) => ({
      ...result,
      totalReceiptValue: grossTotal,
    }));
  }

  // ── §1 / §1.1 Normal supplier branch ────────────────────────────────────
  const supplierPayableAccountId = await getSystemAccountId(
    "SUPPLIER_PAYABLE",
    tx
  );

  // Supplier payable header posting at GROSS (one row per GRN)
  glEntries.push({
    accountId: supplierPayableAccountId,
    value: grossTotal,
    supplierId: grn.supplierId,
    narration: `Supplier payable for ${grn.grnNumber}`,
  });

  // Layer the discount postings on top when any line discount was captured.
  if (totalDiscount > 0) {
    const salesDiscountIncomeAccountId = await getSystemAccountId(
      "SALES_DISCOUNT_INCOME",
      tx
    );
    glEntries.push({
      accountId: supplierPayableAccountId,
      value: -totalDiscount,
      supplierId: grn.supplierId,
      narration: `Line discount offset on ${grn.grnNumber}`,
    });
    glEntries.push({
      accountId: salesDiscountIncomeAccountId,
      value: totalDiscount,
      supplierId: grn.supplierId,
      narration: `Sales discount received on ${grn.grnNumber}`,
    });
  }

  if (!grn.supplierId) {
    throw new Error(
      `GRN ${grn.grnNumber} is missing a supplier and is not in opening-balance mode`
    );
  }

  const supplierLedgerEntries: Parameters<
    typeof postAccountingTransactions
  >[1]["supplierLedgerEntries"] = [
    {
      supplierId: grn.supplierId,
      value: grossTotal,
      narration: `GRN goods receipt — ${grn.grnNumber}`,
    },
  ];
  if (totalDiscount > 0) {
    supplierLedgerEntries.push({
      supplierId: grn.supplierId,
      value: -totalDiscount,
      narration: `Line discount on ${grn.grnNumber}`,
    });
  }

  return postAccountingTransactions(tx, {
    documentType: "GRN",
    documentId: grn.id,
    documentNumber: grn.grnNumber,
    documentDate: grn.receiptDate,
    storeId: grn.storeId,
    currency: grn.currency,
    createdById: input.createdById,
    glEntries,
    supplierLedgerEntries,
    allowExisting: input.allowExisting ?? false,
  }).then((result) => ({
    ...result,
    totalReceiptValue: grossTotal - totalDiscount,
  }));
}
