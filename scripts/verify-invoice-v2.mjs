// Verifies the corrected invoice posting flow against accounting-theories.md
// § 4 + § 4.1 (revised: per-product accounts + weighted-avg cost from GRN).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const CUSTOMER = "cmovwuwnv000bwwitkgkb8cdc";

function n(d) { return Number(d); }

async function rowsFor(invoiceNumber) {
  const inv = await prisma.accountingInvoice.findUnique({
    where: { invoiceNumber },
    select: { id: true, status: true },
  });
  if (!inv) return null;
  const gl = await prisma.accountingJournalEntry.findMany({
    where: { documentType: "INV", documentId: inv.id },
    select: { accountCode: true, accountName: true, value: true, productCode: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  const cl = await prisma.accountingCustomerLedgerEntry.findMany({
    where: { documentType: "INV", documentId: inv.id },
    select: { value: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  return { id: inv.id, status: inv.status, gl, cl };
}

let failed = false;
function check(label, ok) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failed = true;
}

// ─── Test 1 ────────────────────────────────────────────────────────────────
console.log("=== Test 1 — INV-2026-0001 (1 × SS-001 @ 200,000, no discount) ===");
console.log("  SS-001 weighted avg cost = 1,300 (5 GRN units, value 6,500)");
console.log("  Expected: 4 GL rows: AAR001 +200k, PRIN0001 +200k, COGS0001 +1,300, INVE0001 -1,300");
console.log("  Expected: 1 customer ledger row: +200,000\n");
{
  const r = await rowsFor("INV-2026-0001");
  for (const row of r.gl) console.log(`    ${row.accountCode.padEnd(10)} ${String(row.value).padStart(12)}  prod=${row.productCode || "-"}  | ${row.narration}`);
  console.log("  Customer ledger:");
  for (const row of r.cl) console.log(`    ${String(row.value).padStart(12)}  | ${row.narration}`);

  check("4 GL rows", r.gl.length === 4);
  check("1 customer ledger row", r.cl.length === 1);
  check("AAR001 = +200,000", n(r.gl.find((x) => x.accountCode === "AAR001")?.value || 0) === 200000);
  check("PRIN0001 = +200,000 (income, line gross)", n(r.gl.find((x) => x.accountCode === "PRIN0001")?.value || 0) === 200000);
  check("COGS0001 = +1,300 (qty 1 × weighted avg 1,300)", n(r.gl.find((x) => x.accountCode === "COGS0001")?.value || 0) === 1300);
  check("INVE0001 = -1,300", n(r.gl.find((x) => x.accountCode === "INVE0001")?.value || 0) === -1300);
  check("customer ledger = +200,000", n(r.cl[0]?.value || 0) === 200000);
}

// ─── Test 2 ────────────────────────────────────────────────────────────────
console.log("\n=== Test 2 — INV-2026-0002 (SS-001 @ 200,000 with 30,000 discount) ===");
console.log("  Expected: 6 GL rows: 4 base + EES001 +30,000 + AAR001 -30,000");
console.log("  Expected: 2 customer ledger rows: +200,000, -30,000\n");
{
  const r = await rowsFor("INV-2026-0002");
  for (const row of r.gl) console.log(`    ${row.accountCode.padEnd(10)} ${String(row.value).padStart(12)}  | ${row.narration}`);
  console.log("  Customer ledger:");
  for (const row of r.cl) console.log(`    ${String(row.value).padStart(12)}  | ${row.narration}`);

  check("6 GL rows", r.gl.length === 6);
  check("2 customer ledger rows", r.cl.length === 2);
  const aarSum = r.gl.filter((x) => x.accountCode === "AAR001").reduce((s, x) => s + n(x.value), 0);
  check("AAR001 net = +170,000 (200k − 30k)", aarSum === 170000);
  check("EES001 = +30,000 (sales discount)", n(r.gl.find((x) => x.accountCode === "EES001")?.value || 0) === 30000);
  check("PRIN0001 = +200,000 (income still at gross, not net)", n(r.gl.find((x) => x.accountCode === "PRIN0001")?.value || 0) === 200000);
  check("COGS0001 = +1,300 (cost not affected by discount)", n(r.gl.find((x) => x.accountCode === "COGS0001")?.value || 0) === 1300);
  check("INVE0001 = -1,300", n(r.gl.find((x) => x.accountCode === "INVE0001")?.value || 0) === -1300);
  const clSum = r.cl.reduce((s, x) => s + n(x.value), 0);
  check("customer ledger net = +170,000", clSum === 170000);
}

// ─── Test 3 (negative) ─────────────────────────────────────────────────────
console.log("\n=== Test 3 — INV-2026-0003 (ABB no GRN history) — REJECTED ===");
{
  const r = await rowsFor("INV-2026-0003");
  check("INV-2026-0003 stays DRAFT", r.status === "DRAFT");
  check("no GL rows produced", r.gl.length === 0);
  check("no customer ledger rows produced", r.cl.length === 0);
}

// ─── Test 4 ────────────────────────────────────────────────────────────────
console.log("\n=== Test 4 — INV-2026-0004 (multi-line: 1 × SS-001 + 2 × ABB) ===");
console.log("  After GRN-2026-0050, ABB weighted avg = 1,250 (5 units × 1,250)");
console.log("  Note: SS-001 weighted avg might shift if we re-checked with newer GRNs; test data doesn't add new SS-001 GRNs in this test.");
console.log("  Expected: 7 GL rows: AAR +183.5k; PRIN0001 +180k (SS) + +3.5k (ABB); COGS +1,300 (SS) + +2,500 (ABB); INVE0001 -1,300 (SS) + -2,500 (ABB)\n");
{
  const r = await rowsFor("INV-2026-0004");
  for (const row of r.gl) console.log(`    ${row.accountCode.padEnd(10)} ${String(row.value).padStart(12)}  prod=${row.productCode || "-"}  | ${row.narration}`);
  console.log("  Customer ledger:");
  for (const row of r.cl) console.log(`    ${String(row.value).padStart(12)}  | ${row.narration}`);

  check("7 GL rows", r.gl.length === 7);
  check("1 customer ledger row", r.cl.length === 1);
  check("AAR001 = +183,500 (180k + 3.5k)", n(r.gl.find((x) => x.accountCode === "AAR001")?.value || 0) === 183500);

  // Per-product income rows
  const incomeSS = r.gl.find((x) => x.accountCode === "PRIN0001" && x.productCode === "SS-001");
  const incomeABB = r.gl.find((x) => x.accountCode === "PRIN0001" && x.productCode === "ABB/DD/234/123");
  check("PRIN0001 SS-001 line = +180,000", n(incomeSS?.value || 0) === 180000);
  check("PRIN0001 ABB line = +3,500 (2 × 1,750)", n(incomeABB?.value || 0) === 3500);

  // Per-product cost rows
  const cogsSS = r.gl.find((x) => x.accountCode === "COGS0001" && x.productCode === "SS-001");
  const cogsABB = r.gl.find((x) => x.accountCode === "COGS0001" && x.productCode === "ABB/DD/234/123");
  check("COGS0001 SS-001 = +1,300 (qty 1 × weighted-avg 1,300)", n(cogsSS?.value || 0) === 1300);
  check("COGS0001 ABB = +2,500 (qty 2 × weighted-avg 1,250)", n(cogsABB?.value || 0) === 2500);

  const invSS = r.gl.find((x) => x.accountCode === "INVE0001" && x.productCode === "SS-001");
  const invABB = r.gl.find((x) => x.accountCode === "INVE0001" && x.productCode === "ABB/DD/234/123");
  check("INVE0001 SS-001 = -1,300", n(invSS?.value || 0) === -1300);
  check("INVE0001 ABB = -2,500", n(invABB?.value || 0) === -2500);

  check("customer ledger = +183,500", n(r.cl[0]?.value || 0) === 183500);
}

// ─── Customer integrity invariant ──────────────────────────────────────────
console.log("\n=== Customer integrity invariant (customer ledger sum = AAR001 GL sum) ===");
{
  const cl = await prisma.accountingCustomerLedgerEntry.aggregate({
    where: { customerId: CUSTOMER },
    _sum: { value: true },
  });
  const aar = await prisma.accountingJournalEntry.aggregate({
    where: { customerId: CUSTOMER, accountCode: "AAR001" },
    _sum: { value: true },
  });
  const clSum = n(cl._sum.value || 0);
  const aarSum = n(aar._sum.value || 0);
  // INV1 +200k, INV2 net +170k, INV4 +183.5k → 553.5k
  console.log(`  Customer ledger sum: ${clSum}`);
  console.log(`  AAR001 GL sum:       ${aarSum}`);
  check("ledger sum = AAR001 GL sum", clSum === aarSum);
  check("invariant value = 553,500", clSum === 553500);
}

// ─── Stock checks ──────────────────────────────────────────────────────────
console.log("\n=== Stock checks ===");
{
  const ss = await prisma.accountingProductStock.findUnique({
    where: { productId_storeId: { productId: "cmnarg5ft0002tsskhpol5mns", storeId: KOTTE } },
    select: { qtyOnHand: true },
  });
  const abb = await prisma.accountingProductStock.findUnique({
    where: { productId_storeId: { productId: "cmng93cvt0005tskw745tt6vt", storeId: KOTTE } },
    select: { qtyOnHand: true },
  });
  // SS-001: started at 3, INV1 -1, INV2 -1, INV4 -1 = 0
  // ABB: started at 10, GRN-2026-0050 +5 = 15, INV4 -2 = 13
  console.log(`  SS-001 @ MAIN-001: ${ss?.qtyOnHand} (expected 0)`);
  console.log(`  ABB @ MAIN-001: ${abb?.qtyOnHand} (expected 13)`);
  check("SS-001 = 0 (3 - 3 sold)", n(ss?.qtyOnHand || -1) === 0);
  check("ABB = 13 (10 + 5 GRN - 2 sold)", n(abb?.qtyOnHand || -1) === 13);
}

if (failed) {
  console.log("\n❌ One or more checks FAILED");
  process.exit(1);
}
console.log("\n✅ All checks passed");
await prisma.$disconnect();
