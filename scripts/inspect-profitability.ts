// Ground truth for the 3 Profitability reports — MAIN-001 scope.

import { prisma } from "@/lib/db";

const STORE_ID = "cmlgui0hz0000tsd43qq78v8u"; // MAIN-001

async function main() {
  // === Profit & Loss ===
  console.log("\n=== P&L (MAIN-001) ===");
  const jes = await prisma.accountingJournalEntry.findMany({
    where: {
      storeId: STORE_ID,
      account: { category: { code: { in: ["INCOME", "EXPENSES"] } } },
    },
    select: {
      accountCode: true,
      accountName: true,
      value: true,
      account: { select: { category: { select: { code: true } } } },
    },
  });
  type Acc = { code: string; name: string; cat: string; signed: number };
  const byAcc = new Map<string, Acc>();
  for (const e of jes) {
    const k = e.accountCode;
    const ex = byAcc.get(k) ?? { code: e.accountCode, name: e.accountName, cat: e.account.category.code, signed: 0 };
    ex.signed += Number(e.value);
    byAcc.set(k, ex);
  }
  let income = 0;
  let expenses = 0;
  console.log("INCOME:");
  for (const a of byAcc.values()) {
    if (a.cat !== "INCOME") continue;
    const amt = -a.signed;
    income += amt;
    console.log(`  ${a.code.padEnd(12)} ${a.name.padEnd(30)} ${amt.toFixed(2)}`);
  }
  console.log(`  Total Income: ${income.toFixed(2)}`);
  console.log("EXPENSES:");
  for (const a of byAcc.values()) {
    if (a.cat !== "EXPENSES") continue;
    const amt = a.signed;
    expenses += amt;
    console.log(`  ${a.code.padEnd(12)} ${a.name.padEnd(30)} ${amt.toFixed(2)}`);
  }
  console.log(`  Total Expenses: ${expenses.toFixed(2)}`);
  console.log(`Net Profit: ${(income - expenses).toFixed(2)}`);

  // === Sales by Product ===
  console.log("\n=== SALES BY PRODUCT (MAIN-001) ===");
  type Prod = { code: string; name: string; qty: number; rev: number; cogs: number };
  const byProd = new Map<string, Prod>();

  const invs = await prisma.accountingInvoice.findMany({
    where: { status: "APPROVED", storeId: STORE_ID },
    select: {
      lines: {
        select: { productId: true, itemCode: true, itemName: true, quantity: true, lineTotal: true, discount: true },
      },
    },
  });
  for (const inv of invs) {
    for (const l of inv.lines) {
      const ex = byProd.get(l.productId) ?? { code: l.itemCode, name: l.itemName, qty: 0, rev: 0, cogs: 0 };
      ex.qty += Number(l.quantity);
      ex.rev += Number(l.lineTotal) - Number(l.discount);
      byProd.set(l.productId, ex);
    }
  }
  const bills = await prisma.accountingPosBill.findMany({
    where: { status: "COMPLETED", storeId: STORE_ID },
    select: {
      lines: {
        select: { productId: true, itemCode: true, itemName: true, quantity: true, lineTotal: true, discount: true },
      },
    },
  });
  for (const b of bills) {
    for (const l of b.lines) {
      const ex = byProd.get(l.productId) ?? { code: l.itemCode, name: l.itemName, qty: 0, rev: 0, cogs: 0 };
      ex.qty += Number(l.quantity);
      ex.rev += Number(l.lineTotal) - Number(l.discount);
      byProd.set(l.productId, ex);
    }
  }
  const cogs = await prisma.accountingJournalEntry.findMany({
    where: {
      storeId: STORE_ID,
      productId: { not: null },
      documentType: { in: ["INV", "POS"] },
      account: { code: { startsWith: "COGS" } },
    },
    select: { productId: true, value: true },
  });
  for (const e of cogs) {
    if (!e.productId) continue;
    const ex = byProd.get(e.productId);
    if (!ex) continue;
    ex.cogs += Number(e.value);
  }
  let revTotal = 0;
  let cogsTotal = 0;
  for (const p of byProd.values()) {
    revTotal += p.rev;
    cogsTotal += p.cogs;
    console.log(`  ${p.code.padEnd(24)} | qty=${p.qty} | rev=${p.rev.toFixed(2)} | cogs=${p.cogs.toFixed(2)} | gp=${(p.rev - p.cogs).toFixed(2)}`);
  }
  console.log(`Products: ${byProd.size} | Revenue: ${revTotal.toFixed(2)} | Gross Profit: ${(revTotal - cogsTotal).toFixed(2)}`);

  // === Sales by Customer ===
  console.log("\n=== SALES BY CUSTOMER (MAIN-001) ===");
  type Cust = { name: string; docs: number; gross: number; returns: number };
  const byCust = new Map<string, Cust>();
  for (const inv of await prisma.accountingInvoice.findMany({
    where: { status: "APPROVED", storeId: STORE_ID },
    select: { customerId: true, total: true, customer: { select: { name: true } } },
  })) {
    const c = byCust.get(inv.customerId) ?? { name: inv.customer.name, docs: 0, gross: 0, returns: 0 };
    c.docs += 1;
    c.gross += Number(inv.total);
    byCust.set(inv.customerId, c);
  }
  for (const b of await prisma.accountingPosBill.findMany({
    where: { status: "COMPLETED", storeId: STORE_ID },
    select: { customerId: true, total: true, customer: { select: { name: true } } },
  })) {
    const c = byCust.get(b.customerId) ?? { name: b.customer.name, docs: 0, gross: 0, returns: 0 };
    c.docs += 1;
    c.gross += Number(b.total);
    byCust.set(b.customerId, c);
  }
  for (const r of await prisma.accountingCustomerReturn.findMany({
    where: { status: "APPROVED", storeId: STORE_ID },
    select: { customerId: true, totalNet: true, customer: { select: { name: true } } },
  })) {
    const c = byCust.get(r.customerId) ?? { name: r.customer.name, docs: 0, gross: 0, returns: 0 };
    c.returns += Number(r.totalNet);
    byCust.set(r.customerId, c);
  }
  let netSum = 0;
  for (const c of byCust.values()) {
    const net = c.gross - c.returns;
    netSum += net;
    console.log(`  ${c.name.padEnd(30)} | docs=${c.docs} | gross=${c.gross.toFixed(2)} | returns=${c.returns.toFixed(2)} | net=${net.toFixed(2)}`);
  }
  console.log(`Customers: ${byCust.size} | Net total: ${netSum.toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
