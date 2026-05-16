import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const SS_001 = "cmnarg5ft0002tsskhpol5mns";

console.log("=== Per-branch stock vs. legacy global counter (in-sync check) ===\n");

const products = await prisma.accountingProduct.findMany({
  where: { itemType: "INVENTORY_ITEM" },
  select: {
    code: true,
    stockOnHand: true,
    branchStock: {
      select: { qtyOnHand: true, store: { select: { code: true } } },
      orderBy: { store: { code: "asc" } },
    },
  },
  orderBy: { code: "asc" },
});

let allOk = true;
for (const p of products) {
  const branchSum = p.branchStock.reduce((s, r) => s + Number(r.qtyOnHand), 0);
  const global = Number(p.stockOnHand);
  const inSync = Math.abs(branchSum - global) < 1e-6;
  if (!inSync) allOk = false;
  console.log(`  ${p.code.padEnd(22)} global=${global.toString().padStart(4)}  branch-sum=${branchSum.toString().padStart(4)}  ${inSync ? "✅" : "❌ OUT OF SYNC"}`);
  for (const row of p.branchStock) {
    console.log(`     · ${row.store.code.padEnd(10)} qty=${row.qtyOnHand}`);
  }
}
console.log(`\n  ${allOk ? "✅ all products in sync" : "❌ MISMATCH FOUND"}`);

console.log("\n=== Phase 4 expected math ===");
const ss = await prisma.accountingProduct.findUnique({
  where: { id: SS_001 },
  select: { stockOnHand: true, branchStock: { select: { qtyOnHand: true, store: { select: { code: true } } } } },
});
const main = ss.branchStock.find((r) => r.store.code === "MAIN-001");
console.log(`  SS-001 history (since Phase 4 started):`);
console.log(`    Phase 4 backfill:           branch(MAIN-001) = 1 (from legacy stockOnHand)`);
console.log(`    + GRN-2026-0002 +3 received:                  = 4`);
console.log(`    − GR-2026-0002  -1 returned:                  = 3`);
console.log(`    expected: branch(MAIN-001)=3, global=3`);
console.log(`    actual:   branch(MAIN-001)=${main?.qtyOnHand ?? "MISSING"}, global=${ss.stockOnHand}`);
const ok = main && Number(main.qtyOnHand) === 3 && Number(ss.stockOnHand) === 3;
console.log(`    ${ok ? "✅" : "❌"}`);

console.log("\n=== storeId stamps on the new ledger rows ===");
const docTypes = ["GRN", "PV", "GRR"];
for (const t of docTypes) {
  const rows = await prisma.accountingJournalEntry.findMany({
    where: { documentType: t, documentNumber: { in: ["GRN-2026-0002", "GR-2026-0002"] } },
    select: { documentNumber: true, accountCode: true, value: true, storeId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) {
    const stamp = r.storeId === KOTTE ? "✅" : "❌";
    console.log(`  ${stamp} ${r.documentNumber.padEnd(15)} ${r.accountCode.padEnd(10)} value=${r.value} store=${r.storeId}`);
  }
}

await prisma.$disconnect();
