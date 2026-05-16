import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const r = await prisma.$queryRawUnsafe(`SHOW INDEX FROM accountingsupplierledgerentry`);
console.log("Indexes on accountingsupplierledgerentry:");
const seen = new Set();
for (const row of r) {
  if (!seen.has(row.Key_name)) {
    seen.add(row.Key_name);
    console.log("  ", row.Key_name);
  }
}
await prisma.$disconnect();
