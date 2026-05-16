import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const POID = "cmox7un6q0003wwh9uy9u50a1";
const GRNID = "cmox7v5690007wwh9tr44f7wi";
const PVID = "cmox7v5kw000fwwh9ymyckxep";
const GRID = "cmox7vn9j000nwwh9p3olyt4z";

async function check(label, value) {
  console.log(`${value === KOTTE ? "✅" : "❌"} ${label} → storeId=${value}`);
}

console.log("=== Doc table storeId stamps ===");
const po = await prisma.accountingPurchaseOrder.findUnique({ where: { id: POID }, select: { storeId: true, poNumber: true } });
await check(`PO ${po.poNumber}`, po.storeId);
const grn = await prisma.accountingGoodsReceipt.findUnique({ where: { id: GRNID }, select: { storeId: true, grnNumber: true, status: true } });
await check(`GRN ${grn.grnNumber} (${grn.status})`, grn.storeId);
const pv = await prisma.accountingPaymentVoucher.findUnique({ where: { id: PVID }, select: { storeId: true, voucherNumber: true, status: true } });
await check(`PV ${pv.voucherNumber} (${pv.status})`, pv.storeId);
const gr = await prisma.accountingGoodsReturn.findUnique({ where: { id: GRID }, select: { storeId: true, returnNumber: true, status: true } });
await check(`GR ${gr.returnNumber} (${gr.status})`, gr.storeId);

console.log("\n=== Journal entry storeId stamps (per source doc) ===");
for (const [type, id, label] of [["GRN", GRNID, "GRN-2026-0001"], ["PV", PVID, "PV-2026-0001"], ["GRR", GRID, "GR-2026-0001"]]) {
  const rows = await prisma.accountingJournalEntry.findMany({
    where: { documentType: type, documentId: id },
    select: { id: true, storeId: true, accountCode: true, value: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  ${label} produced ${rows.length} GL row(s):`);
  let allOk = true;
  for (const row of rows) {
    const stamped = row.storeId === KOTTE;
    if (!stamped) allOk = false;
    console.log(`    ${stamped ? "✅" : "❌"} ${row.accountCode.padEnd(8)} value=${row.value.toString().padStart(10)} store=${row.storeId} narration=${row.narration}`);
  }
  console.log(`    ${allOk ? "ALL stamped MAIN-001 ✅" : "MISMATCH ❌"}`);
}

console.log("\n=== Supplier ledger storeId stamps (per source doc) ===");
for (const [type, id, label] of [["GRN", GRNID, "GRN-2026-0001"], ["PV", PVID, "PV-2026-0001"], ["GRR", GRID, "GR-2026-0001"]]) {
  const rows = await prisma.accountingSupplierLedgerEntry.findMany({
    where: { documentType: type, documentId: id },
    select: { storeId: true, value: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  ${label} produced ${rows.length} ledger row(s):`);
  for (const row of rows) {
    const stamped = row.storeId === KOTTE;
    console.log(`    ${stamped ? "✅" : "❌"} value=${row.value.toString().padStart(10)} store=${row.storeId} narration=${row.narration}`);
  }
}

console.log("\n=== Integrity invariant (supplier ledger sum = SUPPLIER_PAYABLE GL sum, per supplier) ===");
const supplierId = "cmn9xzc790000tsrgtgg14d6g";
const ledgerSum = await prisma.accountingSupplierLedgerEntry.aggregate({
  where: { supplierId },
  _sum: { value: true },
});
const payableGlSum = await prisma.accountingJournalEntry.aggregate({
  where: { supplierId, accountCode: "LAP001" },
  _sum: { value: true },
});
const ledger = Number(ledgerSum._sum.value || 0);
const gl = Number(payableGlSum._sum.value || 0);
const ok = Math.abs(ledger - gl) < 1e-6;
console.log(`  Demax Store ledger=${ledger}, LAP001 GL=${gl}  ${ok ? "✅" : "❌"}`);

console.log("\n=== Expected math ===");
console.log("  GRN +2000, PV -1000, GRR -1000  →  net 0");
console.log(`  Stock on hand for SS-001: ${(await prisma.accountingProduct.findUnique({ where: { code: "SS-001" }, select: { stockOnHand: true } })).stockOnHand}  (expected 1: received 2, returned 1)`);

await prisma.$disconnect();
