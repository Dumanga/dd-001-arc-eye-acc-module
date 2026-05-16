// Ground truth for the 3 General Ledger reports.

import { prisma } from "@/lib/db";

async function main() {
  // === Trial Balance: aggregate all JE rows by account ===
  console.log("\n=== TRIAL BALANCE (asOf=now, ACCOUNT rollup) ===");
  const all = await prisma.accountingJournalEntry.findMany({
    select: {
      accountId: true,
      accountCode: true,
      accountName: true,
      value: true,
    },
  });
  console.log("Total JE rows:", all.length);
  const byAcc = new Map<string, { code: string; name: string; dr: number; cr: number }>();
  let allDr = 0;
  let allCr = 0;
  for (const e of all) {
    const v = Number(e.value);
    const ex = byAcc.get(e.accountId) ?? { code: e.accountCode, name: e.accountName, dr: 0, cr: 0 };
    if (v > 0) { ex.dr += v; allDr += v; }
    if (v < 0) { ex.cr += -v; allCr += -v; }
    byAcc.set(e.accountId, ex);
  }
  for (const [, e] of byAcc) {
    console.log(`${e.code.padEnd(12)} ${e.name.padEnd(40)} Dr=${e.dr.toFixed(2).padStart(14)} Cr=${e.cr.toFixed(2).padStart(14)}`);
  }
  console.log(`\nGRAND DEBIT  : ${allDr.toFixed(2)}`);
  console.log(`GRAND CREDIT : ${allCr.toFixed(2)}`);
  console.log(`DIFFERENCE   : ${(allDr - allCr).toFixed(2)}  (should be 0 if books balance)`);

  // === Account Ledger: pick AAR ===
  console.log("\n=== ACCOUNT LEDGER — AAR ===");
  const aar = await prisma.chartOfAccount.findFirst({
    where: { code: { startsWith: "AAR" } },
    select: { id: true, code: true, name: true },
  });
  if (aar) {
    console.log("Account:", aar);
    const entries = await prisma.accountingJournalEntry.findMany({
      where: { accountId: aar.id },
      orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
      select: { documentDate: true, documentType: true, documentNumber: true, value: true },
    });
    let bal = 0, totalDr = 0, totalCr = 0;
    for (const e of entries) {
      const v = Number(e.value);
      bal += v;
      if (v > 0) totalDr += v;
      if (v < 0) totalCr += -v;
      console.log(`${e.documentDate.toISOString().slice(0, 10)} | ${e.documentType.padEnd(4)} | ${e.documentNumber.padEnd(28)} | v=${v.toFixed(2).padStart(14)} | bal=${bal.toFixed(2)}`);
    }
    console.log(`\nEntries: ${entries.length} | Total Dr: ${totalDr.toFixed(2)} | Total Cr: ${totalCr.toFixed(2)} | Closing: ${bal.toFixed(2)}`);
  }

  // === Journal Entries Report — POS doc type only ===
  console.log("\n=== JOURNAL ENTRIES — POS doc type ===");
  const posJe = await prisma.accountingJournalEntry.findMany({
    where: { documentType: "POS" },
    select: { documentNumber: true, value: true },
  });
  let posDr = 0, posCr = 0;
  for (const e of posJe) {
    const v = Number(e.value);
    if (v > 0) posDr += v;
    if (v < 0) posCr += -v;
  }
  console.log(`Rows: ${posJe.length} | Total Dr: ${posDr.toFixed(2)} | Total Cr: ${posCr.toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
