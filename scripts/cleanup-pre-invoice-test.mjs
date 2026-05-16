// Pre-test cleanup before exercising the new invoice posting flow.
//
// State before: INV-2026-0001 approved without journal rows (created in Phase 4
// testing, before we added invoice posting). INV-2026-0099 was a 100-unit draft
// rejected at approve time. Both should be removed so we start clean.
//
// Side-effect: INV-2026-0001 decremented SS-001 stock by 1. We restore that 1
// unit so per-branch and global counters reflect the steady state after
// Checkpoint 2 (3 on hand: GRN +3, GR -1, then this restore).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const SS_001 = "cmnarg5ft0002tsskhpol5mns";

async function main() {
  const beforeStock = await prisma.accountingProduct.findUnique({
    where: { id: SS_001 },
    select: { stockOnHand: true },
  });
  const beforeBranchStock = await prisma.accountingProductStock.findUnique({
    where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
    select: { qtyOnHand: true },
  });
  console.log("BEFORE:");
  console.log("  SS-001 global stockOnHand =", beforeStock?.stockOnHand);
  console.log("  SS-001 @ MAIN-001 qtyOnHand =", beforeBranchStock?.qtyOnHand);

  // Delete invoice lines first (FK cascade should handle it but being explicit).
  await prisma.accountingInvoiceLine.deleteMany({
    where: { invoice: { invoiceNumber: { in: ["INV-2026-0001", "INV-2026-0099"] } } },
  });
  const invDel = await prisma.accountingInvoice.deleteMany({
    where: { invoiceNumber: { in: ["INV-2026-0001", "INV-2026-0099"] } },
  });
  console.log(`Deleted ${invDel.count} invoice(s).`);

  // Restore 1 unit of SS-001 stock at MAIN-001 + global counter to undo the
  // approved INV-2026-0001's stock decrement.
  await prisma.accountingProductStock.update({
    where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
    data: { qtyOnHand: { increment: 1 } },
  });
  await prisma.accountingProduct.update({
    where: { id: SS_001 },
    data: { stockOnHand: { increment: 1 } },
  });

  // Reset INV form-id back to 0001 so the next created invoice is clean
  await prisma.accountingFormIdConfig.updateMany({
    where: { formType: "INV" },
    data: { nextNumber: "0001" },
  });

  const afterStock = await prisma.accountingProduct.findUnique({
    where: { id: SS_001 },
    select: { stockOnHand: true },
  });
  const afterBranchStock = await prisma.accountingProductStock.findUnique({
    where: { productId_storeId: { productId: SS_001, storeId: KOTTE } },
    select: { qtyOnHand: true },
  });
  console.log("AFTER:");
  console.log("  SS-001 global stockOnHand =", afterStock?.stockOnHand);
  console.log("  SS-001 @ MAIN-001 qtyOnHand =", afterBranchStock?.qtyOnHand);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
