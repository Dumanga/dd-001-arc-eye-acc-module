// Snapshot the state we expect an Opening Balance GRN to mutate, so we can
// diff before/after when testing. Run with `npx tsx scripts/check-ob-baseline.ts`.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.accountingProduct.findFirst({
    where: { code: "ABB/DD/234/123" },
    select: { id: true, code: true, purchaseName: true, inventoryAccountId: true },
  });
  if (!product) throw new Error("Product ABB/DD/234/123 not found");

  const stocks = await prisma.accountingProductStock.findMany({
    where: { productId: product.id },
    include: { store: { select: { code: true, name: true } } },
  });

  const equity = await prisma.chartOfAccount.findFirst({
    where: { code: "EOOBE 0001" },
    select: { id: true, code: true, name: true },
  });
  if (!equity) throw new Error("Opening Balance Equity account not found");

  const inv = await prisma.chartOfAccount.findFirst({
    where: { code: "INVE0001" },
    select: { id: true, code: true, name: true },
  });
  if (!inv) throw new Error("Production Inventory account not found");

  const sumOf = async (accountId: string) =>
    (
      await prisma.accountingJournalEntry.aggregate({
        where: { accountId },
        _sum: { value: true },
      })
    )._sum.value ?? 0;

  console.log("=== BASELINE ===");
  console.log("Product:", product.code, "—", product.purchaseName);
  console.log("Inventory Account on Product:", product.inventoryAccountId);
  console.log("Stocks per branch:");
  for (const s of stocks) {
    console.log(`  ${s.store.code}: qty=${s.qtyOnHand}`);
  }
  console.log("---");
  console.log(`Equity account (${equity.code} ${equity.name}): GL sum = ${await sumOf(equity.id)}`);
  console.log(`Inventory account (${inv.code} ${inv.name}): GL sum = ${await sumOf(inv.id)}`);
  console.log("---");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
