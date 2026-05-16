import { prisma } from "@/lib/db";
async function main() {
  const products = await prisma.accountingProduct.findMany({
    where: {
      itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
      status: "ACTIVE",
    },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      salesName: true,
      purchaseName: true,
      itemType: true,
      costPrice: true,
      uomCategory: { select: { baseUnitName: true } },
      branchStock: {
        select: { qtyOnHand: true, store: { select: { code: true } } },
      },
    },
  });
  console.log("Count:", products.length);
  for (const p of products) console.log(`  ${p.code} | ${p.itemType} | uomBase=${p.uomCategory?.baseUnitName}`);
}
main().finally(() => prisma.$disconnect());
