import { prisma } from "@/lib/db";

async function main() {
  // List all categories
  const cats = await prisma.accountingAccountCategory.findMany({
    select: { code: true, name: true },
    orderBy: { displayOrder: "asc" },
  });
  console.log("Categories:");
  for (const c of cats) console.log(`  ${c.code} | ${c.name}`);
}
main().finally(() => prisma.$disconnect());
