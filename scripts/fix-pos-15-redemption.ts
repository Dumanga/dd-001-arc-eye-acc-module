import { prisma } from "@/lib/db";
async function main() {
  // Forward-fix is already in place (pos-bill-posting.ts line 342).
  // Flip the historical POS-2026-00015 LFGV row from +5000 to -5000
  // so the trial balance reconciles for past data too.
  const result = await prisma.accountingJournalEntry.update({
    where: { id: "cmp05errl000lwwxdfd41ebi9" },
    data: { value: -5000 },
  });
  console.log("Updated:", result.id, "new value =", result.value.toString());

  // Verify total balance
  const all = await prisma.accountingJournalEntry.findMany({
    select: { value: true, account: { select: { type: { select: { category: { select: { code: true } } } } } } },
  });
  let dr = 0, cr = 0;
  function isDebitNormal(code: string) { return code === "ASSET" || code === "EXPENSES"; }
  for (const e of all) {
    const v = Number(e.value);
    const cat = e.account.type.category.code;
    if (isDebitNormal(cat)) {
      if (v >= 0) dr += v; else cr += -v;
    } else {
      if (v >= 0) cr += v; else dr += -v;
    }
  }
  console.log("\nPost-fix totals:");
  console.log(`  Total Debit:  ${dr.toFixed(2)}`);
  console.log(`  Total Credit: ${cr.toFixed(2)}`);
  console.log(`  Difference:   ${(dr - cr).toFixed(2)}  (should be 0)`);
}
main().finally(() => prisma.$disconnect());
