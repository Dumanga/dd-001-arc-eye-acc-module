// One-time backfill: write accounting ledger rows for every previously
// APPROVED GRN that doesn't yet have ledger rows. Safe to re-run; skips
// GRNs whose journal entries already exist.
//
// Run with:  node scripts/backfill-grn-accounting.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SYSTEM_ACCOUNT_DEFAULTS = {
  SUPPLIER_PAYABLE: "LAP001",
  DEBTOR_RECEIVABLE: "AAR001",
  PRODUCTION_INVENTORY: "INVE0001",
  CASH_ON_HAND: "ACCH001",
  SSCL_TAX_PAYABLE: "SSCL0001",
  VAT_PAYABLE: "VATP0001",
  PRODUCT_INCOME: "PRIN0001",
  CASH_DISCOUNT_INCOME: "IOOI001",
  COST_OF_GOODS_SOLD: "COGS0001",
  SALES_DISCOUNT_EXPENSE: "EES001",
  CASH_DISCOUNT_EXPENSE: "EOPS001",
};

async function getSystemAccountId(tx, key) {
  const existing = await tx.accountingSystemAccount.findUnique({
    where: { key },
    select: { accountId: true },
  });
  if (existing) return existing.accountId;
  const code = SYSTEM_ACCOUNT_DEFAULTS[key];
  const account = await tx.chartOfAccount.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!account) throw new Error(`Missing chart-of-accounts row for ${code}`);
  const created = await tx.accountingSystemAccount.create({
    data: { key, accountId: account.id },
    select: { accountId: true },
  });
  return created.accountId;
}

async function backfillGrn(grn) {
  const existing = await prisma.accountingJournalEntry.findFirst({
    where: { documentType: "GRN", documentId: grn.id },
    select: { id: true },
  });
  if (existing) {
    console.log(`  ↪︎ ${grn.grnNumber} already has ledger rows — skipping`);
    return { skipped: true };
  }

  const createdById = grn.approvedById ?? grn.createdById;
  const result = await prisma.$transaction(async (tx) => {
    const fallbackInventory = await getSystemAccountId(tx, "PRODUCTION_INVENTORY");
    const supplierPayable = await getSystemAccountId(tx, "SUPPLIER_PAYABLE");

    // Resolve account, supplier, product snapshots
    const supplier = await tx.accountingSupplier.findUniqueOrThrow({
      where: { id: grn.supplierId },
      select: { code: true, name: true },
    });

    const productIds = Array.from(
      new Set(grn.lines.map((l) => l.productId))
    );
    const products = await tx.accountingProduct.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        code: true,
        purchaseName: true,
        salesName: true,
        itemType: true,
        inventoryAccountId: true,
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const accountIdsNeeded = new Set([supplierPayable]);
    for (const line of grn.lines) {
      const product = productById.get(line.productId);
      if (!product || product.itemType !== "INVENTORY_ITEM") continue;
      accountIdsNeeded.add(product.inventoryAccountId ?? fallbackInventory);
    }
    const accounts = await tx.chartOfAccount.findMany({
      where: { id: { in: Array.from(accountIdsNeeded) } },
      select: { id: true, code: true, name: true },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const glRows = [];
    let totalValue = 0;
    for (const line of grn.lines) {
      const qty = Number(line.receivedQty);
      const unitPrice = Number(line.unitPrice);
      if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || qty <= 0) continue;
      const lineValue = qty * unitPrice;
      totalValue += lineValue;

      const product = productById.get(line.productId);
      if (!product || product.itemType !== "INVENTORY_ITEM") continue;
      const accountId = product.inventoryAccountId ?? fallbackInventory;
      const account = accountById.get(accountId);

      glRows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        documentType: "GRN",
        documentId: grn.id,
        documentNumber: grn.grnNumber,
        documentDate: grn.receiptDate,
        sourceLineId: line.id,
        supplierId: grn.supplierId,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        productId: line.productId,
        productCode: product.code,
        productName: product.purchaseName ?? product.salesName ?? product.code,
        value: lineValue,
        currency: grn.currency,
        narration: `Inventory receipt — ${line.description || "GRN line"}`,
        createdById,
      });
    }

    const supplierPayableAccount = accountById.get(supplierPayable);
    glRows.push({
      accountId: supplierPayableAccount.id,
      accountCode: supplierPayableAccount.code,
      accountName: supplierPayableAccount.name,
      documentType: "GRN",
      documentId: grn.id,
      documentNumber: grn.grnNumber,
      documentDate: grn.receiptDate,
      sourceLineId: null,
      supplierId: grn.supplierId,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      productId: null,
      productCode: null,
      productName: null,
      value: totalValue,
      currency: grn.currency,
      narration: `Supplier payable for ${grn.grnNumber}`,
      createdById,
    });

    await tx.accountingJournalEntry.createMany({ data: glRows });

    await tx.accountingSupplierLedgerEntry.create({
      data: {
        supplierId: grn.supplierId,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        documentType: "GRN",
        documentId: grn.id,
        documentNumber: grn.grnNumber,
        documentDate: grn.receiptDate,
        value: totalValue,
        currency: grn.currency,
        narration: `GRN goods receipt — ${grn.grnNumber}`,
        createdById,
      },
    });

    return { glCount: glRows.length, totalValue };
  });

  console.log(
    `  ✓ ${grn.grnNumber}: ${result.glCount} GL rows + 1 supplier-ledger row, total ${result.totalValue} ${grn.currency}`
  );
  return { skipped: false, ...result };
}

async function main() {
  const grns = await prisma.accountingGoodsReceipt.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    include: {
      lines: {
        select: {
          id: true,
          productId: true,
          description: true,
          receivedQty: true,
          unitPrice: true,
        },
        orderBy: { lineOrder: "asc" },
      },
    },
  });

  console.log(`Found ${grns.length} approved GRNs to consider.`);
  let posted = 0;
  let skipped = 0;
  for (const grn of grns) {
    try {
      const r = await backfillGrn(grn);
      if (r.skipped) skipped += 1;
      else posted += 1;
    } catch (err) {
      console.error(`  ✗ ${grn.grnNumber} failed:`, err.message);
    }
  }
  console.log(`Done. Posted ${posted}, skipped ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
