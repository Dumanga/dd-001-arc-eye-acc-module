import { prisma } from "@/lib/db";
async function main() {
  const today = new Date();
  console.log("now:", today.toISOString());
  const eod = new Date(today);
  eod.setUTCHours(23, 59, 59, 999);
  console.log("end of today UTC:", eod.toISOString());

  const future = await prisma.accountingJournalEntry.findMany({
    where: { documentDate: { gt: eod } },
    select: { documentDate: true, documentType: true, documentNumber: true, value: true },
    orderBy: { documentDate: "asc" },
  });
  console.log("Future-dated JE rows:", future.length);
  for (const r of future) {
    console.log(`  ${r.documentDate.toISOString()} | ${r.documentType} | ${r.documentNumber} | ${r.value}`);
  }

  const all = await prisma.accountingJournalEntry.findMany({
    select: { documentDate: true, value: true },
    orderBy: { documentDate: "desc" },
    take: 5,
  });
  console.log("Latest 5 JE rows by date:");
  for (const r of all) console.log(`  ${r.documentDate.toISOString()} | ${r.value}`);
}
main().finally(() => prisma.$disconnect());
