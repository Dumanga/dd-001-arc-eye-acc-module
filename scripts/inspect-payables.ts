// Ground truth for the 3 Payables reports.

import { prisma } from "@/lib/db";

async function main() {
  // === Supplier Payment Vouchers ===
  console.log("\n=== APPROVED PAYMENT VOUCHERS ===");
  const pvs = await prisma.accountingPaymentVoucher.findMany({
    where: { status: "APPROVED" },
    orderBy: { voucherDate: "asc" },
    select: {
      voucherNumber: true,
      voucherDate: true,
      paymentTotal: true,
      discountTotal: true,
      supplier: { select: { code: true, name: true } },
      payFromAccount: { select: { code: true, name: true } },
    },
  });
  let pvAlloc = 0;
  let pvDisc = 0;
  for (const v of pvs) {
    pvAlloc += Number(v.paymentTotal);
    pvDisc += Number(v.discountTotal);
    console.log(
      `${v.voucherNumber} | ${v.voucherDate.toISOString().slice(0, 10)} | ${v.supplier.name} | ${v.payFromAccount.code} ${v.payFromAccount.name} | pay=${v.paymentTotal} disc=${v.discountTotal}`,
    );
  }
  console.log(
    `Vouchers: ${pvs.length} | Total Paid: ${pvAlloc} | Total Discount: ${pvDisc} | Total: ${pvAlloc + pvDisc}`,
  );

  // === Supplier Aging ===
  console.log("\n=== SUPPLIER AGING (asOf=today) ===");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const grns = await prisma.accountingGoodsReceipt.findMany({
    // Opening-balance GRNs (§1.2) have no supplier and don't post to AP, so
    // they can never appear in payables / aging.
    where: { status: "APPROVED", receiptDate: { lte: today }, openingBalanceMode: false },
    select: {
      grnNumber: true,
      receiptDate: true,
      supplierId: true,
      supplier: { select: { code: true, name: true } },
      lines: { select: { receivedQty: true, unitPrice: true, discount: true } },
      paymentAllocations: {
        where: { paymentVoucher: { status: "APPROVED" } },
        select: { payingAmount: true, discount: true },
      },
      goodsReturns: { where: { status: "APPROVED" }, select: { totalValue: true } },
    },
  });
  type Bucket = "current" | "b1to30" | "b31to60" | "b61to90" | "over90";
  const bySup = new Map<string, { name: string; code: string; b: Record<Bucket, number>; t: number }>();
  for (const g of grns) {
    const gross = g.lines.reduce((s, l) => s + Number(l.receivedQty) * Number(l.unitPrice), 0);
    const lineDisc = g.lines.reduce((s, l) => s + Number(l.discount), 0);
    const net = gross - lineDisc;
    const paid = g.paymentAllocations.reduce((s, a) => s + Number(a.payingAmount) + Number(a.discount), 0);
    const ret = g.goodsReturns.reduce((s, r) => s + Number(r.totalValue), 0);
    const out = net - paid - ret;
    if (out <= 0.005) continue;
    const days = Math.max(
      0,
      Math.floor((today.getTime() - g.receiptDate.getTime()) / 86400000),
    );
    let bucket: Bucket;
    if (days <= 30) bucket = "current";
    else if (days <= 60) bucket = "b1to30";
    else if (days <= 90) bucket = "b31to60";
    else if (days <= 120) bucket = "b61to90";
    else bucket = "over90";
    // Filtered to openingBalanceMode=false above, so supplier/supplierId are always present.
    if (!g.supplierId || !g.supplier) continue;
    const e = bySup.get(g.supplierId) ?? {
      name: g.supplier.name,
      code: g.supplier.code,
      b: { current: 0, b1to30: 0, b31to60: 0, b61to90: 0, over90: 0 },
      t: 0,
    };
    e.b[bucket] += out;
    e.t += out;
    bySup.set(g.supplierId, e);
    console.log(
      `${g.grnNumber} | ${g.receiptDate.toISOString().slice(0, 10)} | ${g.supplier.name} | gross=${gross} disc=${lineDisc} net=${net} paid=${paid} ret=${ret} out=${out} | bucket=${bucket} (days=${days})`,
    );
  }
  console.log("\nAggregated by supplier:");
  let agingGrand = 0;
  for (const e of bySup.values()) {
    agingGrand += e.t;
    console.log(
      `  ${e.code} ${e.name} | current=${e.b.current} 1-30=${e.b.b1to30} 31-60=${e.b.b31to60} 61-90=${e.b.b61to90} over90=${e.b.over90} | total=${e.t}`,
    );
  }
  console.log(`Aging suppliers: ${bySup.size} | Grand payable: ${agingGrand}`);

  // === Supplier Statement (first supplier with ledger entries) ===
  console.log("\n=== SUPPLIER LEDGER — sample ===");
  const sup = await prisma.accountingSupplier.findFirst({
    select: { id: true, code: true, name: true },
    where: { ledgerEntries: { some: {} } },
  });
  if (sup) {
    console.log("Supplier:", sup);
    const entries = await prisma.accountingSupplierLedgerEntry.findMany({
      where: { supplierId: sup.id },
      orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
      select: {
        documentDate: true,
        documentType: true,
        documentNumber: true,
        value: true,
      },
    });
    let bal = 0;
    let totalDr = 0;
    let totalCr = 0;
    for (const e of entries) {
      const v = Number(e.value);
      bal += v;
      if (v > 0) totalCr += v;
      if (v < 0) totalDr += -v;
      console.log(
        `${e.documentDate.toISOString().slice(0, 10)} | ${e.documentType} | ${e.documentNumber} | value=${v} | balance=${bal}`,
      );
    }
    console.log(
      `\nEntries: ${entries.length} | Total Dr: ${totalDr} | Total Cr: ${totalCr} | Closing Payable: ${bal}`,
    );
  } else {
    console.log("No supplier ledger entries.");
  }
}

main().finally(() => prisma.$disconnect());
