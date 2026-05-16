// Ground truth for the 4 Inventory reports.

import { prisma } from "@/lib/db";

async function main() {
  // === Stock Report ===
  console.log("\n=== STOCK REPORT ===");
  const products = await prisma.accountingProduct.findMany({
    where: {
      itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
      status: "ACTIVE",
    },
    select: {
      code: true,
      salesName: true,
      itemType: true,
      costPrice: true,
      branchStock: { select: { qtyOnHand: true, store: { select: { code: true } } } },
    },
    orderBy: { code: "asc" },
  });
  let totalProducts = 0;
  let totalUnits = 0;
  let totalValue = 0;
  for (const p of products) {
    const qty = p.branchStock.reduce((s, b) => s + Number(b.qtyOnHand), 0);
    const cost = Number(p.costPrice ?? 0);
    const value = qty * cost;
    totalProducts += 1;
    totalUnits += qty;
    totalValue += value;
    console.log(`${p.code.padEnd(24)} | ${p.salesName?.padEnd(30) ?? ""} | ${p.itemType} | qty=${qty} cost=${cost} value=${value.toFixed(2)}`);
  }
  console.log(`\nProducts: ${totalProducts} | Total units: ${totalUnits} | Total value: ${totalValue.toFixed(2)}`);

  // === GRN Register ===
  console.log("\n=== GRN REGISTER (APPROVED) ===");
  const grns = await prisma.accountingGoodsReceipt.findMany({
    where: { status: "APPROVED" },
    orderBy: { receiptDate: "asc" },
    select: {
      grnNumber: true,
      receiptDate: true,
      supplier: { select: { name: true } },
      store: { select: { code: true } },
      purchaseOrder: { select: { poNumber: true } },
      lines: { select: { receivedQty: true, unitPrice: true, discount: true } },
      _count: { select: { lines: true } },
    },
  });
  let grnTotal = 0;
  for (const g of grns) {
    const net = g.lines.reduce((s, l) => s + Number(l.receivedQty) * Number(l.unitPrice) - Number(l.discount), 0);
    grnTotal += net;
    // Opening-balance GRNs (per accounting-theories.md §1.2) have no supplier.
    const supplierLabel = g.supplier?.name ?? "Opening Balance";
    console.log(`${g.grnNumber} | ${g.receiptDate.toISOString().slice(0, 10)} | PO=${g.purchaseOrder?.poNumber ?? "—"} | ${supplierLabel} | ${g.store.code} | lines=${g._count.lines} | net=${net.toFixed(2)}`);
  }
  console.log(`GRNs: ${grns.length} | Total value: ${grnTotal.toFixed(2)}`);

  // === PO Register ===
  console.log("\n=== PO REGISTER ===");
  const pos = await prisma.accountingPurchaseOrder.findMany({
    orderBy: { poDate: "asc" },
    select: {
      poNumber: true,
      poDate: true,
      status: true,
      supplier: { select: { name: true } },
      store: { select: { code: true } },
      lines: { select: { quantity: true, unitPrice: true } },
      goodsReceipts: {
        where: { status: "APPROVED" },
        select: { lines: { select: { receivedQty: true, unitPrice: true, discount: true } } },
      },
    },
  });
  let posOrdered = 0;
  let posReceived = 0;
  for (const po of pos) {
    const ordered = po.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);
    const received = po.goodsReceipts.reduce(
      (s, g) => s + g.lines.reduce((s2, l) => s2 + Number(l.receivedQty) * Number(l.unitPrice) - Number(l.discount), 0),
      0,
    );
    posOrdered += ordered;
    posReceived += received;
    console.log(`${po.poNumber} | ${po.poDate.toISOString().slice(0, 10)} | ${po.supplier.name} | ${po.store.code} | ${po.status} | ordered=${ordered.toFixed(2)} received=${received.toFixed(2)}`);
  }
  console.log(`POs: ${pos.length} | Total ordered: ${posOrdered.toFixed(2)} | Total received: ${posReceived.toFixed(2)}`);

  // === Stock Movements ===
  console.log("\n=== STOCK MOVEMENTS (synthesized) ===");
  let grnIn = 0;
  let grrOut = 0;
  let invOut = 0;
  let posOut = 0;
  let crIn = 0;

  for (const g of grns) for (const l of g.lines) grnIn += Number(l.receivedQty);

  const grrs = await prisma.accountingGoodsReturn.findMany({
    where: { status: "APPROVED" },
    select: { lines: { select: { returnQty: true } } },
  });
  for (const r of grrs) for (const l of r.lines) grrOut += Number(l.returnQty);

  const invs = await prisma.accountingInvoice.findMany({
    where: { status: "APPROVED" },
    select: { lines: { select: { quantity: true } } },
  });
  for (const i of invs) for (const l of i.lines) invOut += Number(l.quantity);

  const bills = await prisma.accountingPosBill.findMany({
    where: { status: "COMPLETED" },
    select: { lines: { select: { quantity: true } } },
  });
  for (const b of bills) for (const l of b.lines) posOut += Number(l.quantity);

  const crs = await prisma.accountingCustomerReturn.findMany({
    where: { status: "APPROVED" },
    select: { lines: { select: { returnQty: true } } },
  });
  for (const r of crs) for (const l of r.lines) crIn += Number(l.returnQty);

  const totalIn = grnIn + crIn;
  const totalOut = grrOut + invOut + posOut;
  console.log(`GRN IN: ${grnIn} | GRR OUT: ${grrOut} | INV OUT: ${invOut} | POS OUT: ${posOut} | CR IN: ${crIn}`);
  console.log(`Total IN: ${totalIn} | Total OUT: ${totalOut} | Net: ${(totalIn - totalOut).toFixed(2)}`);

  // Movements row count (sum of lines from all source feeds)
  let movementCount = 0;
  for (const g of grns) movementCount += g.lines.length;
  for (const r of grrs) movementCount += r.lines.length;
  for (const i of invs) movementCount += i.lines.length;
  for (const b of bills) movementCount += b.lines.length;
  for (const r of crs) movementCount += r.lines.length;
  console.log(`Total movement rows: ${movementCount}`);
}

main().finally(() => prisma.$disconnect());
