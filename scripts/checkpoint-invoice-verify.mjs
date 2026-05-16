// Verifies the new invoice posting flow against accounting-theories.md § 4 + § 4.1.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KOTTE = "cmlgui0hz0000tsd43qq78v8u";
const CUSTOMER = "cmovwuwnv000bwwitkgkb8cdc"; // PW Client Alpha 20260508
const INV1 = "cmoxco9dx0003wwgf2mfgj1eh";   // simple, 1 × SS-001 @ 200,000
const INV2 = "cmoxcorf2000fwwgfpaqzlwmh";   // discount, 1 × SS-001 @ 200,000 − 30,000
const INV3 = "cmoxcorg1000uwwgfsa0k66pw";   // multi-line, SS-001 + 2 × ABB

function n(d) { return Number(d); }

async function rowsFor(documentId) {
  const gl = await prisma.accountingJournalEntry.findMany({
    where: { documentType: "INV", documentId },
    select: { accountCode: true, value: true, storeId: true, customerId: true, productCode: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  const cl = await prisma.accountingCustomerLedgerEntry.findMany({
    where: { documentType: "INV", documentId },
    select: { value: true, storeId: true, customerId: true, narration: true },
    orderBy: { createdAt: "asc" },
  });
  return { gl, cl };
}

function check(label, ok) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) globalThis.__failed = true;
}

console.log("=== Test 1 — INV-2026-0001 (simple, no discount) ===");
console.log("  Expected: SS-001 cost 120,000; sales 200,000.");
console.log("  4 GL rows: INVE0001 -120,000, COGS0001 +120,000, AAR001 +200,000, PRIN0001 +200,000");
console.log("  1 customer ledger row: +200,000\n");
{
  const { gl, cl } = await rowsFor(INV1);
  console.log("  GL rows:");
  for (const r of gl) console.log(`    ${r.accountCode.padEnd(10)} ${String(r.value).padStart(12)}  store=${r.storeId === KOTTE ? "MAIN-001✅" : "❌"}  cust=${r.customerId === CUSTOMER ? "✅" : "❌"}  prod=${r.productCode || ""}  | ${r.narration}`);
  console.log("  Customer ledger rows:");
  for (const r of cl) console.log(`    ${String(r.value).padStart(12)}  store=${r.storeId === KOTTE ? "MAIN-001✅" : "❌"}  | ${r.narration}`);

  check("4 GL rows produced", gl.length === 4);
  check("1 customer ledger row produced", cl.length === 1);
  check("INVE0001 = -120,000", gl.find(r => r.accountCode === "INVE0001")?.value && n(gl.find(r => r.accountCode === "INVE0001").value) === -120000);
  check("COGS0001 = +120,000", n(gl.find(r => r.accountCode === "COGS0001")?.value || 0) === 120000);
  check("AAR001 = +200,000", n(gl.find(r => r.accountCode === "AAR001")?.value || 0) === 200000);
  check("PRIN0001 = +200,000", n(gl.find(r => r.accountCode === "PRIN0001")?.value || 0) === 200000);
  check("customer ledger = +200,000", cl[0] && n(cl[0].value) === 200000);
  check("every row stamped MAIN-001", [...gl, ...cl].every(r => r.storeId === KOTTE));
  check("every row stamped customer", gl.every(r => r.customerId === CUSTOMER) && cl.every(r => r.customerId === CUSTOMER));
}

console.log("\n=== Test 2 — INV-2026-0002 (with header discount) ===");
console.log("  Expected: same 4 base rows + 2 discount rows on GL + 2 customer ledger rows.");
console.log("  6 GL rows total, 2 customer ledger rows total. Net receivable 170,000.\n");
{
  const { gl, cl } = await rowsFor(INV2);
  console.log("  GL rows:");
  for (const r of gl) console.log(`    ${r.accountCode.padEnd(10)} ${String(r.value).padStart(12)}  | ${r.narration}`);
  console.log("  Customer ledger rows:");
  for (const r of cl) console.log(`    ${String(r.value).padStart(12)}  | ${r.narration}`);

  check("6 GL rows produced", gl.length === 6);
  check("2 customer ledger rows produced", cl.length === 2);
  // sum of all AAR001 GL rows for INV2 = +200000 - 30000 = 170000
  const aar = gl.filter(r => r.accountCode === "AAR001").reduce((s, r) => s + n(r.value), 0);
  check("AAR001 net (after discount) = +170,000", aar === 170000);
  // EES001 = sales discount expense
  check("EES001 = +30,000 (sales discount)", n(gl.find(r => r.accountCode === "EES001")?.value || 0) === 30000);
  const clSum = cl.reduce((s, r) => s + n(r.value), 0);
  check("customer ledger net = +170,000", clSum === 170000);
  check("PRIN0001 still posted at gross +200,000", n(gl.find(r => r.accountCode === "PRIN0001")?.value || 0) === 200000);
}

console.log("\n=== Test 3 — INV-2026-0003 (multi-line, no discount) ===");
console.log("  Line 1: SS-001 qty 1 @ 180,000 sales (cost 120,000)");
console.log("  Line 2: ABB/DD qty 2 @ 1,750 sales (cost 1,250)");
console.log("  Gross 183,500. COGS 122,500. Per-line inventory rows × 2.\n");
{
  const { gl, cl } = await rowsFor(INV3);
  console.log("  GL rows:");
  for (const r of gl) console.log(`    ${r.accountCode.padEnd(10)} ${String(r.value).padStart(12)}  prod=${r.productCode || "-"}  | ${r.narration}`);
  console.log("  Customer ledger rows:");
  for (const r of cl) console.log(`    ${String(r.value).padStart(12)}  | ${r.narration}`);

  // 2 inventory + 2 cogs + 1 receivable + 1 income = 6 GL rows
  check("6 GL rows produced (2 inv + 2 cogs + 1 receivable + 1 income)", gl.length === 6);
  check("1 customer ledger row produced", cl.length === 1);
  const inv = gl.filter(r => r.accountCode === "INVE0001").reduce((s, r) => s + n(r.value), 0);
  const cogs = gl.filter(r => r.accountCode === "COGS0001").reduce((s, r) => s + n(r.value), 0);
  check("inventory total = -122,500 (120,000 + 2,500)", inv === -122500);
  check("COGS total = +122,500", cogs === 122500);
  check("AAR001 = +183,500", n(gl.find(r => r.accountCode === "AAR001")?.value || 0) === 183500);
  check("PRIN0001 = +183,500", n(gl.find(r => r.accountCode === "PRIN0001")?.value || 0) === 183500);
  check("customer ledger = +183,500", n(cl[0]?.value || 0) === 183500);
}

console.log("\n=== Customer integrity invariant ===");
{
  const sumCl = await prisma.accountingCustomerLedgerEntry.aggregate({
    where: { customerId: CUSTOMER },
    _sum: { value: true },
  });
  const sumAar = await prisma.accountingJournalEntry.aggregate({
    where: { customerId: CUSTOMER, accountCode: "AAR001" },
    _sum: { value: true },
  });
  const cl = n(sumCl._sum.value || 0);
  const aar = n(sumAar._sum.value || 0);
  // Math: inv1=200000, inv2=170000 (200k-30k), inv3=183500 → total 553500
  console.log(`  Customer ledger sum: ${cl}`);
  console.log(`  AAR001 GL sum filtered to customer: ${aar}`);
  check("ledger sum = receivable GL sum", cl === aar);
  check("invariant value = expected (553,500)", cl === 553500);
}

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
  // SS-001: pre-test 3, INV-1 -1, INV-2 -1, INV-3 -1 = 0
  // ABB: pre-test 10 (seeded), INV-3 -2 = 8 (overdraw 15 was rejected before stock change)
  console.log(`  SS-001 @ MAIN-001: ${ss?.qtyOnHand} (expected 0)`);
  console.log(`  ABB/DD/234/123 @ MAIN-001: ${abb?.qtyOnHand} (expected 8)`);
  check("SS-001 stock = 0", n(ss?.qtyOnHand || -1) === 0);
  check("ABB stock = 8 (overdraw rejected)", n(abb?.qtyOnHand || -1) === 8);
}

console.log("\n=== Append-only check ===");
{
  // After re-approve attempt on INV1, no extra rows for INV1 should exist
  const { gl, cl } = await rowsFor(INV1);
  check("INV-2026-0001 still has exactly 4 GL rows (no double-post)", gl.length === 4);
  check("INV-2026-0001 still has exactly 1 customer ledger row", cl.length === 1);
}

if (globalThis.__failed) {
  console.log("\n❌ One or more checks FAILED");
  process.exit(1);
}
console.log("\n✅ All checks passed");
await prisma.$disconnect();
