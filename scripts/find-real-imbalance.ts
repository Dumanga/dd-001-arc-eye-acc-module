// Now that Dr/Cr is mapped via account category, find the documents
// that don't actually balance.

import { prisma } from "@/lib/db";

function isDebitNormal(code: string): boolean {
  return code === "ASSET" || code === "EXPENSES";
}

async function main() {
  const all = await prisma.accountingJournalEntry.findMany({
    select: {
      documentType: true,
      documentNumber: true,
      accountCode: true,
      accountName: true,
      value: true,
      narration: true,
      account: { select: { type: { select: { category: { select: { code: true } } } } } },
    },
  });

  type Doc = { type: string; num: string; dr: number; cr: number; rows: number };
  const byDoc = new Map<string, Doc>();
  for (const e of all) {
    const k = `${e.documentType}|${e.documentNumber}`;
    const ex = byDoc.get(k) ?? { type: e.documentType, num: e.documentNumber, dr: 0, cr: 0, rows: 0 };
    const v = Number(e.value);
    const cat = e.account.type.category.code;
    if (isDebitNormal(cat)) {
      if (v >= 0) ex.dr += v;
      else ex.cr += -v;
    } else {
      if (v >= 0) ex.cr += v;
      else ex.dr += -v;
    }
    ex.rows += 1;
    byDoc.set(k, ex);
  }

  let imbDocs = 0;
  let imbTotal = 0;
  console.log("\n=== UNBALANCED DOCUMENTS (Dr != Cr after category mapping) ===");
  for (const d of byDoc.values()) {
    const diff = d.dr - d.cr;
    if (Math.abs(diff) > 0.005) {
      imbDocs += 1;
      imbTotal += diff;
      console.log(`  ${d.type.padEnd(4)} ${d.num.padEnd(28)} Dr=${d.dr.toFixed(2).padStart(12)} Cr=${d.cr.toFixed(2).padStart(12)} diff=${diff.toFixed(2)}`);

      const rows = await prisma.accountingJournalEntry.findMany({
        where: { documentType: d.type as never, documentNumber: d.num },
        select: { accountCode: true, value: true, narration: true, account: { select: { type: { select: { category: { select: { code: true } } } } } } },
      });
      for (const r of rows) {
        const cat = r.account.type.category.code;
        console.log(`     ${r.accountCode.padEnd(12)} [${cat.padEnd(11)}] value=${Number(r.value).toFixed(2).padStart(12)} | ${r.narration}`);
      }
    }
  }
  console.log(`\nImbalanced documents: ${imbDocs} / ${byDoc.size}`);
  console.log(`Total imbalance      : ${imbTotal.toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
