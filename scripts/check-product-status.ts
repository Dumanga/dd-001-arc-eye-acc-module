import { prisma } from "@/lib/db";
async function main() {
  const all = await prisma.accountingProduct.findMany({
    where: { itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] } },
    select: { code: true, status: true, itemType: true },
    orderBy: { code: "asc" },
  });
  for (const p of all) console.log(`${p.code.padEnd(28)} | ${p.itemType.padEnd(16)} | ${p.status}`);
}
main().finally(() => prisma.$disconnect());
