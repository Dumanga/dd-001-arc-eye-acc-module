// For each (documentType, documentNumber), sum the values. In
// proper double-entry every document should sum to zero.
// Anything that doesn't sum to zero is the bug.

import { prisma } from "@/lib/db";

async function main() {
  const all = await prisma.accountingJournalEntry.findMany({
    select: {
      documentType: true,
      documentNumber: true,
      accountCode: true,
      accountName: true,
      value: true,
    },
    orderBy: [{ documentType: "asc" }, { documentNumber: "asc" }],
  });

  // Group by document
  const byDoc = new Map<string, { type: string; num: string; sum: number; rows: number }>();
  for (const e of all) {
    const k = `${e.documentType}|${e.documentNumber}`;
    const ex = byDoc.get(k) ?? { type: e.documentType, num: e.documentNumber, sum: 0, rows: 0 };
    ex.sum += Number(e.value);
    ex.rows += 1;
    byDoc.set(k, ex);
  }

  console.log("\n=== UNBALANCED DOCUMENTS (sum != 0) ===");
  let imbalancedDocs = 0;
  let totalImbalance = 0;
  for (const d of byDoc.values()) {
    if (Math.abs(d.sum) > 0.005) {
      imbalancedDocs += 1;
      totalImbalance += d.sum;
      console.log(`  ${d.type.padEnd(4)} ${d.num.padEnd(28)} rows=${d.rows.toString().padStart(2)} sum=${d.sum.toFixed(2).padStart(14)}`);
    }
  }
  console.log(`\nImbalanced documents: ${imbalancedDocs} / ${byDoc.size}`);
  console.log(`Total imbalance      : ${totalImbalance.toFixed(2)}`);

  // Per-document-type imbalance breakdown
  console.log("\n=== BY DOC TYPE ===");
  const byType = new Map<string, number>();
  for (const e of all) byType.set(e.documentType, (byType.get(e.documentType) ?? 0) + Number(e.value));
  for (const [t, v] of byType) console.log(`  ${t.padEnd(4)} sum=${v.toFixed(2)}`);

  // Dig into one imbalanced doc
  console.log("\n=== SAMPLE: rows for first imbalanced document ===");
  let shown = false;
  for (const d of byDoc.values()) {
    if (Math.abs(d.sum) > 0.005 && !shown) {
      const rows = await prisma.accountingJournalEntry.findMany({
        where: { documentType: d.type as never, documentNumber: d.num },
        select: { accountCode: true, accountName: true, value: true, narration: true },
      });
      console.log(`${d.type} ${d.num}:`);
      for (const r of rows) {
        console.log(`  ${r.accountCode.padEnd(12)} ${r.accountName.padEnd(30)} value=${Number(r.value).toFixed(2).padStart(14)} | ${r.narration}`);
      }
      shown = true;
    }
  }
}

main().finally(() => prisma.$disconnect());
