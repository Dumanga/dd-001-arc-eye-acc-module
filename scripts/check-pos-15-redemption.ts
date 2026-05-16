import { prisma } from "@/lib/db";
async function main() {
  const rows = await prisma.accountingJournalEntry.findMany({
    where: {
      documentType: "POS",
      documentNumber: "POS-2026-00015",
      accountCode: "LFGV001",
    },
    select: { id: true, accountCode: true, value: true, narration: true },
  });
  for (const r of rows) {
    console.log(r);
  }
}
main().finally(() => prisma.$disconnect());
