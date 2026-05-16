// POS bill helpers shared across the bill, hold, and pay endpoints.
//
// Theory anchor: accounting-theories.md § 7 POS Schema Implications.
// Operational rules: pos-integration-flow.md § 4.2 (schema), § 8.2
// (reservation example), § 8.3 (hold/burn example), § 8.4 (burn rule),
// § 8.5 (auto-expiry), § 8.6 (cash-account memory).

import { Prisma, type AccountingPosBillStatus, type AccountingPosBillSummaryMethod } from "@prisma/client";
import { prisma } from "@/lib/db";

// ─── DTOs returned to the POS UI ──────────────────────────────────

export type PosBillLineDto = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  description: string;
  qty: string;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  voucherSerialId: string | null;
  voucherSerialNumber: string | null;
  productSerialId: string | null;
  productSerialNumber: string | null;
  lineOrder: number;
};

export type PosBillPaymentDto = {
  id: string;
  method: "CASH" | "CARD" | "SPLIT" | "REDEEM_VOUCHER";
  cashAccountId: string | null;
  cashAccountLabel: string | null;
  merchantClientId: string | null;
  merchantName: string | null;
  voucherSerialId: string | null;
  voucherSerialNumber: string | null;
  amount: string;
  rowOrder: number;
};

export type PosBillDto = {
  id: string;
  billNo: string;
  status: AccountingPosBillStatus;
  isHeld: boolean;
  storeId: string;
  cashierId: string;
  cashierName: string;
  customerId: string;
  customerName: string;
  customerIsWalkIn: boolean;
  merchantClientId: string | null;
  merchantName: string | null;
  paymentMethod: AccountingPosBillSummaryMethod | null;
  primaryCashAccountId: string | null;
  subtotal: string;
  totalDiscount: string;
  total: string;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  heldAt: string | null;
  heldNote: string | null;
  lastActivityAt: string;
  notes: string;
  lines: PosBillLineDto[];
  payments: PosBillPaymentDto[];
  createdAt: string;
  updatedAt: string;
};

const billInclude = {
  cashier: { select: { displayName: true } },
  customer: { select: { name: true, isWalkIn: true } },
  merchantClient: { select: { name: true } },
  lines: {
    orderBy: { lineOrder: "asc" },
    include: {
      voucherSerial: { select: { serialNumber: true } },
      productSerial: { select: { serialNumber: true } },
    },
  },
  payments: {
    orderBy: { rowOrder: "asc" },
    include: {
      cashAccount: { select: { code: true, name: true } },
      merchantClient: { select: { name: true } },
      voucherSerial: { select: { serialNumber: true } },
    },
  },
} satisfies Prisma.AccountingPosBillInclude;

type LoadedBill = Prisma.AccountingPosBillGetPayload<{ include: typeof billInclude }>;

function fmt(value: Prisma.Decimal | number): string {
  const n = typeof value === "number" ? value : Number(value);
  return n.toFixed(2);
}

export function serializeBill(bill: LoadedBill): PosBillDto {
  return {
    id: bill.id,
    billNo: bill.billNo,
    status: bill.status,
    isHeld: bill.isHeld,
    storeId: bill.storeId,
    cashierId: bill.cashierId,
    cashierName: bill.cashier.displayName,
    customerId: bill.customerId,
    customerName: bill.customer.name,
    customerIsWalkIn: bill.customer.isWalkIn,
    merchantClientId: bill.merchantClientId,
    merchantName: bill.merchantClient?.name ?? null,
    paymentMethod: bill.paymentMethod,
    primaryCashAccountId: bill.primaryCashAccountId,
    subtotal: fmt(bill.subtotal),
    totalDiscount: fmt(bill.totalDiscount),
    total: fmt(bill.total),
    postedAt: bill.postedAt?.toISOString() ?? null,
    cancelledAt: bill.cancelledAt?.toISOString() ?? null,
    cancelReason: bill.cancelReason,
    heldAt: bill.heldAt?.toISOString() ?? null,
    heldNote: bill.heldNote,
    lastActivityAt: bill.lastActivityAt.toISOString(),
    notes: bill.notes,
    lines: bill.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productCode: line.itemCode,
      productName: line.itemName,
      description: line.description,
      qty: fmt(line.quantity),
      unitPrice: fmt(line.unitPrice),
      discount: fmt(line.discount),
      lineTotal: fmt(line.lineTotal),
      uomName: line.uomName,
      uomBase: line.uomBase,
      uomMinQty: fmt(line.uomMinQty),
      voucherSerialId: line.voucherSerialId,
      voucherSerialNumber: line.voucherSerial?.serialNumber ?? null,
      productSerialId: line.productSerialId,
      productSerialNumber: line.productSerial?.serialNumber ?? null,
      lineOrder: line.lineOrder,
    })),
    payments: bill.payments.map((p) => ({
      id: p.id,
      method: p.method,
      cashAccountId: p.cashAccountId,
      cashAccountLabel: p.cashAccount ? `${p.cashAccount.code} ${p.cashAccount.name}` : null,
      merchantClientId: p.merchantClientId,
      merchantName: p.merchantClient?.name ?? null,
      voucherSerialId: p.voucherSerialId,
      voucherSerialNumber: p.voucherSerial?.serialNumber ?? null,
      amount: fmt(p.amount),
      rowOrder: p.rowOrder,
    })),
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

export const billQueryInclude = billInclude;

// ─── Reservation math ─────────────────────────────────────────────

// Sum of qty on lines belonging to DRAFT bills at this store (live or
// held). This is what gets subtracted from qtyOnHand when computing
// availability for other cashiers. Per pos-integration-flow.md § 3.2.
export async function getDraftReservedQtyByProduct(
  tx: Pick<Prisma.TransactionClient, "accountingPosBillLine">,
  storeId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await tx.accountingPosBillLine.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      posBill: { storeId, status: "DRAFT" },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, Number(r._sum.quantity ?? 0)]));
}

// Voucher-serial soft-lock: a serial referenced by any DRAFT or
// COMPLETED bill line is unavailable. DRAFT = currently in someone's
// cart; COMPLETED = already issued. Used by the voucher serial picker.
export async function getReservedVoucherSerialIds(
  tx: Pick<Prisma.TransactionClient, "accountingPosBillLine">,
  storeId: string,
  serialIds: string[]
): Promise<Set<string>> {
  if (!serialIds.length) return new Set();
  const rows = await tx.accountingPosBillLine.findMany({
    where: {
      voucherSerialId: { in: serialIds },
      posBill: {
        storeId,
        status: { in: ["DRAFT", "COMPLETED"] },
      },
    },
    select: { voucherSerialId: true },
  });
  return new Set(rows.map((r) => r.voucherSerialId).filter((id): id is string => id !== null));
}

// Same soft-lock check as getReservedVoucherSerialIds but for the new
// productSerialId column used by serial-tracked inventory items.
export async function getReservedProductSerialIds(
  tx: Pick<Prisma.TransactionClient, "accountingPosBillLine">,
  storeId: string,
  serialIds: string[]
): Promise<Set<string>> {
  if (!serialIds.length) return new Set();
  const rows = await tx.accountingPosBillLine.findMany({
    where: {
      productSerialId: { in: serialIds },
      posBill: {
        storeId,
        status: { in: ["DRAFT", "COMPLETED"] },
      },
    },
    select: { productSerialId: true },
  });
  return new Set(rows.map((r) => r.productSerialId).filter((id): id is string => id !== null));
}

// ─── Active draft helper ──────────────────────────────────────────

// Returns the live (status=DRAFT, isHeld=false) bill for a cashier at
// a branch, or null if no such row exists. Used by the POS screen to
// "resume" the active session on page reload, and by the add-line
// endpoint to attach new lines to the existing bill rather than
// spawning a new one.
//
// Only one ACTIVE draft per (cashierId, storeId) is permitted. Held
// bills (isHeld=true) don't count — a cashier can have many held bills
// alongside their one live cart.
export async function findActiveDraft(
  cashierId: string,
  storeId: string
) {
  return prisma.accountingPosBill.findFirst({
    where: {
      cashierId,
      storeId,
      status: "DRAFT",
      isHeld: false,
    },
    include: billInclude,
  });
}

// ─── Recompute totals ─────────────────────────────────────────────

export async function recomputeBillTotals(
  tx: Pick<Prisma.TransactionClient, "accountingPosBill" | "accountingPosBillLine">,
  billId: string
): Promise<void> {
  const lines = await tx.accountingPosBillLine.findMany({
    where: { billId },
    select: { lineTotal: true, quantity: true, unitPrice: true, discount: true },
  });
  let subtotal = 0;
  let totalDiscount = 0;
  for (const line of lines) {
    const qty = Number(line.quantity);
    const unit = Number(line.unitPrice);
    const disc = Number(line.discount);
    subtotal += qty * unit;
    totalDiscount += disc;
  }
  const total = subtotal - totalDiscount;
  await tx.accountingPosBill.update({
    where: { id: billId },
    data: {
      subtotal: new Prisma.Decimal(subtotal.toFixed(4)),
      totalDiscount: new Prisma.Decimal(totalDiscount.toFixed(4)),
      total: new Prisma.Decimal(total.toFixed(4)),
      lastActivityAt: new Date(),
    },
  });
}

// ─── Walk-in customer id lookup ──────────────────────────────────

let walkInIdCache: string | null = null;
export async function getWalkInCustomerId(): Promise<string> {
  if (walkInIdCache) return walkInIdCache;
  const row = await prisma.accountingClient.findFirst({
    where: { isWalkIn: true },
    select: { id: true },
  });
  if (!row) {
    throw new Error(
      "WALK_IN_NOT_SEEDED: walk-in customer row missing. Run `prisma migrate deploy`."
    );
  }
  walkInIdCache = row.id;
  return row.id;
}

// ─── Auto-expiry sweep ───────────────────────────────────────────

// Lazy sweep called by every bill-modify endpoint. DRAFT bills with
// isHeld=false and lastActivityAt older than the threshold flip to
// CANCELLED. Held bills are exempt — they only transition via explicit
// user delete. See pos-integration-flow.md § 8.5.
//
// Threshold defaults to 2 hours but can be overridden via the
// `POS_DRAFT_TTL_SECONDS` env var — useful for tests that need to
// trigger expiry quickly (set it to e.g. 2 seconds).
//
// Timezone note: the comparison uses UTC instants on both sides
// (Date.now() and the UTC value Prisma reads back from MySQL), so
// "2 hours" means 2 hours of real elapsed time. From a Sri Lanka
// (Asia/Colombo, UTC+5:30) cashier's perspective, a draft created
// at 14:00 SLT auto-expires at 16:00 SLT — 2 wall-clock hours later.
// No TZ shift math is needed because the delta is timezone-free.
function getActiveDraftTtlMs(): number {
  const envValue = process.env.POS_DRAFT_TTL_SECONDS;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1000;
    }
  }
  return 2 * 60 * 60 * 1000; // 2 hours default
}

export async function sweepStaleActiveDrafts(
  tx: Pick<Prisma.TransactionClient, "accountingPosBill">
): Promise<void> {
  const cutoff = new Date(Date.now() - getActiveDraftTtlMs());
  await tx.accountingPosBill.updateMany({
    where: {
      status: "DRAFT",
      isHeld: false,
      lastActivityAt: { lt: cutoff },
    },
    data: {
      status: "CANCELLED",
      cancelReason: "auto-expired",
      cancelledAt: new Date(),
    },
  });
}
