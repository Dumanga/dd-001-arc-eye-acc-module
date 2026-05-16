// Phase 1 cleanups for branch-aware operations rollout.
//   1. Fix the typo "Colomboo" → "Colombo" on the Kotte Store - Main row.
//   2. Drop the obsolete TTT/tt test store row (only if nothing FK's to it).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KOTTE_ID = "cmlgui0hz0000tsd43qq78v8u";
const TTT_ID = "cmn32unhg0002ts40hcv0h028";

async function main() {
  console.log("--- before ---");
  const before = await prisma.store.findMany({ select: { id: true, code: true, name: true, city: true } });
  for (const s of before) console.log(s);

  // 1. Typo fix
  const cityUpdate = await prisma.store.updateMany({
    where: { id: KOTTE_ID, city: "Colomboo" },
    data: { city: "Colombo" },
  });
  console.log(`\nKotte city typo fix: ${cityUpdate.count} row(s) updated`);

  // 2. Drop TTT test row — first verify nothing references it
  const refs = {
    users: await prisma.user.count({ where: { storeId: TTT_ID } }),
    accountingUsers: await prisma.accountingUser.count({ where: { storeId: TTT_ID } }),
    repairs: await prisma.repair.count({ where: { storeId: TTT_ID } }),
  };
  console.log(`\nTTT references: ${JSON.stringify(refs)}`);

  if (refs.users === 0 && refs.accountingUsers === 0 && refs.repairs === 0) {
    const del = await prisma.store.deleteMany({ where: { id: TTT_ID } });
    console.log(`TTT row deleted: ${del.count}`);
  } else {
    console.log("TTT row NOT deleted — references exist. Resolve manually.");
  }

  console.log("\n--- after ---");
  const after = await prisma.store.findMany({ select: { id: true, code: true, name: true, city: true } });
  for (const s of after) console.log(s);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
