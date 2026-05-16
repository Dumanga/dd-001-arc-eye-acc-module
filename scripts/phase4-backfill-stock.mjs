// Phase 4 backfill — seed AccountingProductStock from the legacy
// accountingproduct.stockOnHand global counter. Every existing product gets
// one row at the default branch (MAIN-001 — Kotte Store - Main).
//
// Idempotent via upsert — re-running won't duplicate rows.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";

async function main() {
  const products = await prisma.accountingProduct.findMany({
    select: { id: true, code: true, stockOnHand: true, itemType: true },
  });

  let upserts = 0;
  for (const p of products) {
    if (p.itemType !== "INVENTORY_ITEM") continue;
    await prisma.accountingProductStock.upsert({
      where: { productId_storeId: { productId: p.id, storeId: KOTTE } },
      update: { qtyOnHand: p.stockOnHand },
      create: { productId: p.id, storeId: KOTTE, qtyOnHand: p.stockOnHand },
    });
    upserts++;
  }
  console.log(`Backfilled ${upserts} (productId, MAIN-001) row(s).`);

  console.log("\n--- AccountingProductStock state ---");
  const rows = await prisma.accountingProductStock.findMany({
    select: {
      qtyOnHand: true,
      product: { select: { code: true } },
      store: { select: { code: true } },
    },
    orderBy: [{ product: { code: "asc" } }, { store: { code: "asc" } }],
  });
  for (const r of rows) {
    console.log(`  ${r.product.code.padEnd(12)} @ ${r.store.code.padEnd(10)} qty=${r.qtyOnHand}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
