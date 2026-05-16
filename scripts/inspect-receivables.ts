// Ground truth for the 3 Receivables reports.

import { prisma } from "@/lib/db";

async function main() {
  // === Customer Payment Receipts ===
  console.log("\n=== APPROVED CUSTOMER PAYMENT RECEIPTS ===");
  const cprs = await prisma.accountingCustomerPaymentReceipt.findMany({
    where: { status: "APPROVED" },
    orderBy: { receiptDate: "asc" },
    select: {
      receiptNumber: true,
      receiptDate: true,
      receivingTotal: true,
      discountTotal: true,
      customer: { select: { name: true } },
      receiveToAccount: { select: { code: true, name: true } },
    },
  });
  let cprAlloc = 0;
  let cprDisc = 0;
  for (const r of cprs) {
    cprAlloc += Number(r.receivingTotal);
    cprDisc += Number(r.discountTotal);
    console.log(
      `${r.receiptNumber} | ${r.receiptDate.toISOString().slice(0, 10)} | ${r.customer.name} | ${r.receiveToAccount.code} ${r.receiveToAccount.name} | rec=${r.receivingTotal} disc=${r.discountTotal} total=${Number(r.receivingTotal) + Number(r.discountTotal)}`,
    );
  }
  console.log(
    `Receipts: ${cprs.length} | Allocated: ${cprAlloc} | Discount: ${cprDisc} | Total: ${cprAlloc + cprDisc}`,
  );

  // === Customer Aging ===
  console.log("\n=== CUSTOMER AGING (asOf=today) ===");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const invoices = await prisma.accountingInvoice.findMany({
    where: { status: "APPROVED" },
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      total: true,
      customerId: true,
      customer: { select: { name: true } },
      paymentAllocations: {
        where: { receipt: { status: "APPROVED" } },
        select: { receivingAmount: true, discount: true },
      },
      customerReturns: {
        where: { status: "APPROVED" },
        select: { totalNet: true },
      },
    },
  });

  type Bucket = "current" | "b1to30" | "b31to60" | "b61to90" | "over90";
  const byCust = new Map<string, { name: string; b: Record<Bucket, number>; t: number }>();
  for (const inv of invoices) {
    const paid = inv.paymentAllocations.reduce(
      (s, a) => s + Number(a.receivingAmount) + Number(a.discount),
      0,
    );
    const ret = inv.customerReturns.reduce((s, r) => s + Number(r.totalNet), 0);
    const out = Number(inv.total) - paid - ret;
    if (out <= 0.005) continue;
    const dueMs = inv.dueDate.getTime();
    const days = Math.max(0, Math.floor((today.getTime() - dueMs) / 86400000));
    let bucket: Bucket;
    if (today.getTime() < dueMs) bucket = "current";
    else if (days <= 30) bucket = "b1to30";
    else if (days <= 60) bucket = "b31to60";
    else if (days <= 90) bucket = "b61to90";
    else bucket = "over90";
    const e = byCust.get(inv.customerId) ?? {
      name: inv.customer.name,
      b: { current: 0, b1to30: 0, b31to60: 0, b61to90: 0, over90: 0 },
      t: 0,
    };
    e.b[bucket] += out;
    e.t += out;
    byCust.set(inv.customerId, e);
    console.log(
      `${inv.invoiceNumber} | ${inv.invoiceDate.toISOString().slice(0, 10)} due=${inv.dueDate.toISOString().slice(0, 10)} | ${inv.customer.name} | total=${inv.total} paid=${paid} ret=${ret} out=${out} | bucket=${bucket} (days past due=${days})`,
    );
  }
  console.log("\nAggregated by customer:");
  let agingGrand = 0;
  for (const e of byCust.values()) {
    agingGrand += e.t;
    console.log(
      `  ${e.name} | current=${e.b.current} 1-30=${e.b.b1to30} 31-60=${e.b.b31to60} 61-90=${e.b.b61to90} over90=${e.b.over90} | total=${e.t}`,
    );
  }
  console.log(`Aging customers: ${byCust.size} | Grand outstanding: ${agingGrand}`);

  // === Customer Statement (PW Client Alpha) ===
  console.log("\n=== CUSTOMER LEDGER ENTRIES — PW Client Alpha 20260508 ===");
  const cust = await prisma.accountingClient.findFirst({
    where: { name: { contains: "PW Client Alpha" } },
    select: { id: true, name: true, mobile: true },
  });
  if (cust) {
    console.log("Customer:", cust);
    const entries = await prisma.accountingCustomerLedgerEntry.findMany({
      where: { customerId: cust.id },
      orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
      select: {
        documentDate: true,
        documentType: true,
        documentNumber: true,
        value: true,
        narration: true,
      },
    });
    let bal = 0;
    let totalDr = 0;
    let totalCr = 0;
    for (const e of entries) {
      const v = Number(e.value);
      bal += v;
      if (v > 0) totalDr += v;
      if (v < 0) totalCr += -v;
      console.log(
        `${e.documentDate.toISOString().slice(0, 10)} | ${e.documentType} | ${e.documentNumber || e.narration} | value=${v} | balance=${bal}`,
      );
    }
    console.log(`\nEntries: ${entries.length} | Total Dr: ${totalDr} | Total Cr: ${totalCr} | Closing: ${bal}`);
  }
}

main().finally(() => prisma.$disconnect());
