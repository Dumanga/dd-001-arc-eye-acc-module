// Snapshot the current DB state so we can hand-validate each
// report's output. Prints counts + per-row drill-downs the
// Playwright tests cross-check against.

import { prisma } from "@/lib/db";

async function main() {
  // POS Bill History
  const completedPosBills = await prisma.accountingPosBill.findMany({
    where: { status: "COMPLETED" },
    orderBy: { postedAt: "asc" },
    select: {
      billNo: true,
      postedAt: true,
      paymentMethod: true,
      total: true,
      cashier: { select: { displayName: true } },
      customer: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });
  console.log("\n=== COMPLETED POS BILLS ===");
  console.log("Count:", completedPosBills.length);
  let posTotalSum = 0;
  const byMethod: Record<string, number> = {};
  for (const b of completedPosBills) {
    const t = Number(b.total);
    posTotalSum += t;
    byMethod[b.paymentMethod ?? "OTHER"] =
      (byMethod[b.paymentMethod ?? "OTHER"] ?? 0) + t;
    console.log(
      `${b.billNo} | ${b.postedAt?.toISOString()} | ${b.paymentMethod} | ${b.cashier.displayName} | ${b.customer.name} | items=${b._count.lines} | total=${t}`,
    );
  }
  console.log("Per-method:", byMethod);
  console.log("Grand total:", posTotalSum);

  // Invoice Sales
  console.log("\n=== APPROVED INVOICES ===");
  const invoices = await prisma.accountingInvoice.findMany({
    where: { status: "APPROVED" },
    orderBy: { invoiceDate: "asc" },
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      total: true,
      customer: { select: { name: true } },
      store: { select: { code: true } },
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
  let invTotal = 0;
  let invOutstanding = 0;
  for (const inv of invoices) {
    const paid = inv.paymentAllocations.reduce(
      (s, a) => s + Number(a.receivingAmount) + Number(a.discount),
      0,
    );
    const ret = inv.customerReturns.reduce((s, r) => s + Number(r.totalNet), 0);
    const t = Number(inv.total);
    const outstanding = Math.max(0, t - paid - ret);
    invTotal += t;
    invOutstanding += outstanding;
    console.log(
      `${inv.invoiceNumber} | ${inv.invoiceDate.toISOString().slice(0, 10)} | ${inv.customer.name} | ${inv.store.code} | total=${t} | paid=${paid} | returned=${ret} | outstanding=${outstanding}`,
    );
  }
  console.log("Total invoices:", invoices.length, "invTotal:", invTotal, "outstanding:", invOutstanding);

  // Customer Returns
  console.log("\n=== APPROVED CUSTOMER RETURNS ===");
  const returns = await prisma.accountingCustomerReturn.findMany({
    where: { status: "APPROVED" },
    orderBy: { returnDate: "asc" },
    select: {
      returnNumber: true,
      returnDate: true,
      sourceType: true,
      reasonHeader: true,
      totalNet: true,
      customer: { select: { name: true } },
      invoice: { select: { invoiceNumber: true } },
      sourcePosBill: { select: { billNo: true } },
    },
  });
  let retTotal = 0;
  for (const r of returns) {
    const t = Number(r.totalNet);
    retTotal += t;
    const sourceNo =
      r.sourceType === "INVOICE"
        ? r.invoice?.invoiceNumber
        : r.sourcePosBill?.billNo;
    console.log(
      `${r.returnNumber} | ${r.returnDate.toISOString().slice(0, 10)} | ${r.customer.name} | ${r.sourceType} | ${sourceNo} | ${r.reasonHeader} | net=${t}`,
    );
  }
  console.log("Total returns:", returns.length, "retNet:", retTotal);
}

main().finally(() => prisma.$disconnect());
