// Server-side data loader for the accounting dashboard
// (/accounting/admin). One round trip via Promise.all that returns
// the four summary cards, the active-branch snapshot, and the four
// pulse counters. Everything else on the dashboard is static.
//
// Day boundaries use Asia/Colombo (UTC+5:30, no DST). Outstanding
// receivable / payable are taken from the customer + supplier
// ledger tables — those are the authoritative balances and already
// net invoices, payments, and returns per the integrity invariant
// in accounting-theories.md § 4.

import { prisma } from "@/lib/db";

// SLT is UTC+5:30, no DST. Returns the UTC Date that corresponds
// to "today 00:00 SLT" — used to bracket `postedAt` / `approvedAt`
// columns which are stored in UTC.
function startOfTodaySlt(): Date {
  const sltOffsetMs = 5.5 * 60 * 60 * 1000;
  const sltNow = new Date(Date.now() + sltOffsetMs);
  sltNow.setUTCHours(0, 0, 0, 0);
  return new Date(sltNow.getTime() - sltOffsetMs);
}

export type DashboardBranch = {
  id: string;
  name: string;
  city: string;
  todayRevenue: number;
};

export type DashboardData = {
  todayRevenue: number;
  receivables: number;
  payables: number;
  activeBranchCount: number;
  branches: DashboardBranch[];
  // Pulse counters
  todayBillCount: number;
  todayInvoiceCount: number;
  openPoCount: number;
  pendingGrnCount: number;
  pendingCustomerReturnCount: number;
  inventoryItemCount: number;
  outOfStockCount: number;
  activeSupplierCount: number;
};

export async function loadDashboardData(): Promise<DashboardData> {
  const todayStart = startOfTodaySlt();

  const [
    posToday,
    invoicesToday,
    customerLedgerSum,
    supplierLedgerSum,
    branches,
    posByStore,
    invoiceByStore,
    todayBillCount,
    todayInvoiceCount,
    openPoCount,
    pendingGrnCount,
    pendingCustomerReturnCount,
    inventoryItemCount,
    outOfStockCount,
    activeSupplierCount,
  ] = await Promise.all([
    // Today's POS revenue (across all branches)
    prisma.accountingPosBill.aggregate({
      _sum: { total: true },
      where: { status: "COMPLETED", postedAt: { gte: todayStart } },
    }),
    // Today's invoice revenue (approved today)
    prisma.accountingInvoice.aggregate({
      _sum: { total: true },
      where: { status: "APPROVED", approvedAt: { gte: todayStart } },
    }),
    // Net receivables — signed ledger sum is debit-positive per
    // AccountingCustomerLedgerEntry's integrity invariant.
    prisma.accountingCustomerLedgerEntry.aggregate({ _sum: { value: true } }),
    // Net payables — signed ledger sum is credit-positive per
    // AccountingSupplierLedgerEntry.
    prisma.accountingSupplierLedgerEntry.aggregate({ _sum: { value: true } }),

    // Active branches for the snapshot grid
    prisma.store.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
    // Today's POS revenue grouped by store — drives per-branch tiles
    prisma.accountingPosBill.groupBy({
      by: ["storeId"],
      _sum: { total: true },
      where: { status: "COMPLETED", postedAt: { gte: todayStart } },
    }),
    // Today's approved invoices grouped by store — added to per-branch tiles
    prisma.accountingInvoice.groupBy({
      by: ["storeId"],
      _sum: { total: true },
      where: { status: "APPROVED", approvedAt: { gte: todayStart } },
    }),

    // Pulse counters
    prisma.accountingPosBill.count({
      where: { status: "COMPLETED", postedAt: { gte: todayStart } },
    }),
    prisma.accountingInvoice.count({
      where: { status: "APPROVED", approvedAt: { gte: todayStart } },
    }),
    prisma.accountingPurchaseOrder.count({
      where: { status: { in: ["DRAFT", "SENT"] } },
    }),
    prisma.accountingGoodsReceipt.count({ where: { status: "DRAFT" } }),
    prisma.accountingCustomerReturn.count({ where: { status: "DRAFT" } }),
    prisma.accountingProduct.count({
      where: { status: "ACTIVE", itemType: "INVENTORY_ITEM" },
    }),
    // Out-of-stock = active inventory items whose global stockOnHand
    // is zero or below. (Per-branch granularity is in the stock
    // report; the dashboard just flags overall depletion.)
    prisma.accountingProduct.count({
      where: {
        status: "ACTIVE",
        itemType: "INVENTORY_ITEM",
        stockOnHand: { lte: 0 },
      },
    }),
    prisma.accountingSupplier.count(),
  ]);

  const posSum = Number(posToday._sum.total ?? 0);
  const invSum = Number(invoicesToday._sum.total ?? 0);
  const todayRevenue = posSum + invSum;

  // Customer / supplier ledger sums can dip negative if there are
  // open credits — clamp to zero for the headline card.
  const receivables = Math.max(0, Number(customerLedgerSum._sum.value ?? 0));
  const payables = Math.max(0, Number(supplierLedgerSum._sum.value ?? 0));

  // Stitch per-store POS + invoice totals into a single map keyed
  // by storeId, then render in branch.name order.
  const storeRevenue = new Map<string, number>();
  for (const row of posByStore) {
    storeRevenue.set(row.storeId, Number(row._sum.total ?? 0));
  }
  for (const row of invoiceByStore) {
    storeRevenue.set(
      row.storeId,
      (storeRevenue.get(row.storeId) ?? 0) + Number(row._sum.total ?? 0),
    );
  }

  const branchData: DashboardBranch[] = branches.map((b) => ({
    id: b.id,
    name: b.name,
    city: b.city,
    todayRevenue: storeRevenue.get(b.id) ?? 0,
  }));

  return {
    todayRevenue,
    receivables,
    payables,
    activeBranchCount: branches.length,
    branches: branchData,
    todayBillCount,
    todayInvoiceCount,
    openPoCount,
    pendingGrnCount,
    pendingCustomerReturnCount,
    inventoryItemCount,
    outOfStockCount,
    activeSupplierCount,
  };
}
