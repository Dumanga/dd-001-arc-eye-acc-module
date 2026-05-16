// Verify the GL + supplier-ledger + stock effects of GRN-2026-0004 (the
// Opening Balance GRN we just approved via Playwright). Should show:
//   - Inventory account: +6,250 (DR, debit-normal positive)
//   - Opening Balance Equity: +6,250 (CR, credit-normal positive)
//   - No supplier-payable rows for this GRN
//   - No supplier-ledger rows for this GRN
//   - Stock for CHAMPIAN CARROM BOARD increases at MAIN-001 branch
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const grn = await prisma.accountingGoodsReceipt.findFirst({
    where: { grnNumber: "GRN-2026-0004" },
    include: {
      lines: { include: { product: { select: { code: true } } } },
      openingEquityAccount: { select: { code: true, name: true } },
    },
  });
  if (!grn) throw new Error("GRN-2026-0004 not found");

  console.log("=== GRN ===");
  console.log("number:", grn.grnNumber);
  console.log("status:", grn.status);
  console.log("supplierId:", grn.supplierId);
  console.log("openingBalanceMode:", grn.openingBalanceMode);
  console.log("openingEquityAccount:", grn.openingEquityAccount);
  console.log("lines:", grn.lines.length);

  // GL entries for this GRN
  const gl = await prisma.accountingJournalEntry.findMany({
    where: { documentType: "GRN", documentNumber: "GRN-2026-0004" },
    select: {
      value: true,
      narration: true,
      supplierId: true,
      account: { select: { code: true, name: true, type: { select: { category: { select: { code: true } } } } } },
    },
  });
  console.log("\n=== GL entries ===");
  for (const e of gl) {
    console.log(
      `  ${e.account.code} (${e.account.type.category.code}) value=${e.value} supplierId=${e.supplierId} | ${e.narration}`,
    );
  }
  const sumByAcct = gl.reduce((m, e) => {
    const key = e.account.code;
    m[key] = (m[key] ?? 0) + Number(e.value);
    return m;
  }, {} as Record<string, number>);
  console.log("\nGL sum per account:", sumByAcct);

  // Supplier-ledger entries (should be ZERO for this GRN)
  const supLedger = await prisma.accountingSupplierLedgerEntry.findMany({
    where: { documentType: "GRN", documentNumber: "GRN-2026-0004" },
  });
  console.log("\n=== Supplier-ledger entries ===");
  console.log("count:", supLedger.length, "(expected: 0)");
  if (supLedger.length) console.log(JSON.stringify(supLedger, null, 2));

  // Stock for the product post-GRN
  const product = await prisma.accountingProduct.findFirst({
    where: { code: "ABB/DD/234/123" },
    select: { id: true, code: true, purchaseName: true },
  });
  if (product) {
    const stock = await prisma.accountingProductStock.findMany({
      where: { productId: product.id },
      include: { store: { select: { code: true } } },
    });
    console.log("\n=== Stock ===");
    for (const s of stock) {
      console.log(`  ${s.store.code}: onHand=${s.qtyOnHand}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
