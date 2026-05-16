import { prisma } from "@/lib/db";
async function main() {
  const all = await prisma.accountingProduct.findMany({
    where: {
      itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
      status: "ACTIVE",
    },
    select: { code: true, status: true, itemType: true },
    orderBy: { code: "asc" },
  });
  console.log("All matching:", all.length);
  for (const p of all) console.log(`  ${p.code} | ${p.itemType} | ${p.status}`);

  // POs by status
  const pos = await prisma.accountingPurchaseOrder.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("POs by status:", pos);
}
main().finally(() => prisma.$disconnect());
