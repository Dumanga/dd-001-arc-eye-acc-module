import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("--- store rows ---");
  const stores = await prisma.store.findMany({
    select: { id: true, code: true, name: true, city: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  for (const s of stores) console.log(s);

  console.log("\n--- accounting users ---");
  const users = await prisma.accountingUser.findMany({
    select: { id: true, username: true, displayName: true, role: true, storeId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) console.log(u);

  console.log("\n--- operational users ---");
  const ops = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, role: true, storeId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of ops) console.log(u);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
