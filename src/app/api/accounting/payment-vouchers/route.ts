import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { prisma } from "@/lib/db";
import type { AccountingPaymentMethod, Prisma } from "@prisma/client";

export type PaymentVoucherListItem = {
  id: string;
  voucherNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  voucherDate: string;
  method: AccountingPaymentMethod;
  methodLabel: string;
  preparedBy: string;
  reference: string;
  status: string;
  statusLabel: string;
  currency: string;
  paymentTotal: string;
  discountTotal: string;
  totalSettled: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type PaymentVoucherKpis = {
  totalVouchers: number;
  drafts: number;
  approved: number;
  approvedValueLkr: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const METHOD_LABELS: Record<AccountingPaymentMethod, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  CASH: "Cash",
  ONLINE_TRANSFER: "Online Transfer",
};

const VALID_METHODS: AccountingPaymentMethod[] = [
  "BANK_TRANSFER",
  "CHEQUE",
  "CASH",
  "ONLINE_TRANSFER",
];

function isMethod(value: unknown): value is AccountingPaymentMethod {
  return typeof value === "string" && VALID_METHODS.includes(value as AccountingPaymentMethod);
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

// ─── GET — list + KPIs ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedStoreId = searchParams.get("storeId");

    const storeScope = getListStoreFilter(currentUser, requestedStoreId);
    if (!storeScope.ok) {
      return NextResponse.json(
        fail(storeScope.message, storeScope.code),
        { status: storeScope.status }
      );
    }

    const where: Prisma.AccountingPaymentVoucherWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { voucherNumber: { contains: query } },
        { reference: { contains: query } },
        { chequeNo: { contains: query } },
        { preparedBy: { contains: query } },
        { supplier: { name: { contains: query } } },
        { supplier: { code: { contains: query } } },
      ];
    }

    const vouchers = await prisma.accountingPaymentVoucher.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { code: true, name: true } },
        store: { select: { id: true, code: true, name: true } },
      },
    });

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;

    const items: PaymentVoucherListItem[] = vouchers.map((v) => {
      const paymentTotal = Number(v.paymentTotal);
      const discountTotal = Number(v.discountTotal);
      const totalSettled = paymentTotal + discountTotal;

      if (v.status === "DRAFT") drafts += 1;
      if (v.status === "APPROVED") {
        approved += 1;
        if (v.currency === "LKR") approvedValueLkr += paymentTotal;
      }

      return {
        id: v.id,
        voucherNumber: v.voucherNumber,
        supplierId: v.supplierId,
        supplierCode: v.supplier.code,
        supplierName: v.supplier.name,
        voucherDate: formatDate(v.voucherDate),
        method: v.method,
        methodLabel: METHOD_LABELS[v.method] ?? v.method,
        preparedBy: v.preparedBy || "—",
        reference: v.reference || v.chequeNo || "—",
        status: v.status,
        statusLabel: STATUS_LABELS[v.status] ?? v.status,
        currency: v.currency,
        paymentTotal: formatNumber(paymentTotal),
        discountTotal: formatNumber(discountTotal),
        totalSettled: formatNumber(totalSettled),
        storeId: v.storeId,
        storeCode: v.store.code,
        storeName: v.store.name,
      };
    });

    const kpis: PaymentVoucherKpis = {
      totalVouchers: vouchers.length,
      drafts,
      approved,
      approvedValueLkr: formatNumber(approvedValueLkr),
    };

    return NextResponse.json(ok({ items, kpis }, "Payment vouchers fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[PAYMENT VOUCHER LIST]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}

// ─── POST — create draft voucher ─────────────────────────────────────────────

type CreateAllocation = {
  goodsReceiptId?: string | null;
  grnNumber?: string;
  grnDate?: string | null;
  dueDate?: string | null;
  totalAmount: string;
  payableAmount: string;
  payingAmount: string;
  discount: string;
  notes: string;
  lineOrder: number;
};

type CreateBody = {
  voucherNumber: string;
  supplierId: string;
  storeId?: string;
  payFromAccountId: string;
  voucherDate: string;
  method: string;
  currency: string;
  preparedBy: string;
  reference: string;
  chequeNo: string;
  notes: string;
  allocations: CreateAllocation[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateBody;

    // voucherNumber is server-assigned from the form-id sequence.
    if (!body.supplierId) {
      return NextResponse.json(
        fail("Supplier is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!body.payFromAccountId) {
      return NextResponse.json(
        fail("Pay-from account is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!isMethod(body.method)) {
      return NextResponse.json(
        fail("Invalid payment method.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    const method = body.method;
    if (!body.allocations?.length) {
      return NextResponse.json(
        fail("At least one allocation is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    let paymentTotal = 0;
    let discountTotal = 0;
    for (const line of body.allocations) {
      paymentTotal += Number(line.payingAmount || 0);
      discountTotal += Number(line.discount || 0);
    }

    if (paymentTotal <= 0 && discountTotal <= 0) {
      return NextResponse.json(
        fail(
          "Voucher total must be greater than zero (payment or discount).",
          "VALIDATION_ERROR"
        ),
        { status: 422 }
      );
    }


    // Validate supplier and pay-from account exist
    const [supplier, payFromAccount] = await Promise.all([
      prisma.accountingSupplier.findUnique({
        where: { id: body.supplierId },
        select: { id: true },
      }),
      prisma.chartOfAccount.findUnique({
        where: { id: body.payFromAccountId },
        select: { id: true },
      }),
    ]);

    if (!supplier) {
      return NextResponse.json(
        fail("Supplier not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (!payFromAccount) {
      return NextResponse.json(
        fail("Pay-from account not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    // Validate per-GRN cap: each allocation's payable cannot exceed the GRN's
    // remaining outstanding (= GRN total − approved goods returns − approved
    // PV allocations on prior vouchers). This prevents a user from accidentally
    // double-paying a GRN or paying past what the supplier has actually
    // delivered (after returns).
    const allocationGrnIds = Array.from(
      new Set(
        body.allocations
          .map((line) => line.goodsReceiptId)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );
    if (allocationGrnIds.length) {
      const grns = await prisma.accountingGoodsReceipt.findMany({
        where: { id: { in: allocationGrnIds } },
        include: {
          lines: { select: { receivedQty: true, unitPrice: true } },
          goodsReturns: {
            where: { status: "APPROVED" },
            select: { totalValue: true },
          },
          paymentAllocations: {
            where: { paymentVoucher: { status: "APPROVED" } },
            select: { payableAmount: true },
          },
        },
      });
      const remainingByGrnId = new Map<string, { remaining: number; grnNumber: string; status: string }>();
      for (const grn of grns) {
        const grnTotal = grn.lines.reduce(
          (sum, l) => sum + Number(l.receivedQty) * Number(l.unitPrice),
          0
        );
        const returnedTotal = grn.goodsReturns.reduce((sum, r) => sum + Number(r.totalValue), 0);
        const allocatedTotal = grn.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.payableAmount),
          0
        );
        remainingByGrnId.set(grn.id, {
          remaining: Math.max(0, grnTotal - returnedTotal - allocatedTotal),
          grnNumber: grn.grnNumber,
          status: grn.status,
        });
      }

      // Aggregate this voucher's payable per GRN (a user could in theory add
      // two allocation rows pointing at the same GRN — sum them so the cap
      // applies to the total, not each row in isolation).
      const requestedByGrnId = new Map<string, number>();
      for (const line of body.allocations) {
        if (!line.goodsReceiptId) continue;
        const v = Number(line.payableAmount || 0);
        requestedByGrnId.set(line.goodsReceiptId, (requestedByGrnId.get(line.goodsReceiptId) ?? 0) + v);
      }

      for (const [grnId, requested] of requestedByGrnId) {
        const info = remainingByGrnId.get(grnId);
        if (!info) {
          return NextResponse.json(
            fail("An allocation references a missing GRN.", "VALIDATION_ERROR"),
            { status: 422 }
          );
        }
        if (info.status !== "APPROVED") {
          return NextResponse.json(
            fail(
              `GRN ${info.grnNumber} is not approved and cannot be paid against.`,
              "VALIDATION_ERROR"
            ),
            { status: 422 }
          );
        }
        if (requested > info.remaining + 1e-9) {
          return NextResponse.json(
            fail(
              `Allocation against GRN ${info.grnNumber} exceeds remaining payable. Remaining: ${info.remaining.toFixed(2)}, requested: ${requested.toFixed(2)}.`,
              "VALIDATION_ERROR"
            ),
            { status: 422 }
          );
        }
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const { formId: voucherNumber } = await consumeFormIdInTx(tx, "PV");
      return tx.accountingPaymentVoucher.create({
      data: {
        voucherNumber,
        supplierId: body.supplierId,
        storeId: effectiveStoreId,
        payFromAccountId: body.payFromAccountId,
        voucherDate: isoToDate(body.voucherDate),
        method,
        currency: body.currency || "LKR",
        preparedBy: body.preparedBy?.trim() ?? "",
        reference: body.reference?.trim() ?? "",
        chequeNo: body.chequeNo?.trim() ?? "",
        paymentTotal,
        discountTotal,
        notes: body.notes ?? "",
        status: "DRAFT",
        createdById: currentUser.id,
        allocations: {
          create: body.allocations.map((line, idx) => ({
            goodsReceiptId: line.goodsReceiptId || null,
            grnNumber: line.grnNumber ?? "",
            grnDate: line.grnDate ? isoToDate(line.grnDate) : null,
            dueDate: line.dueDate ? isoToDate(line.dueDate) : null,
            totalAmount: Number(line.totalAmount || 0),
            payableAmount: Number(line.payableAmount || 0),
            payingAmount: Number(line.payingAmount || 0),
            discount: Number(line.discount || 0),
            notes: line.notes ?? "",
            lineOrder: line.lineOrder ?? idx,
          })),
        },
      },
      select: { id: true, voucherNumber: true },
    });
    });

    return NextResponse.json(
      ok(
        { id: created.id, voucherNumber: created.voucherNumber },
        "Payment voucher created."
      ),
      { status: 201 }
    );
  } catch (err) {
    console.error("[PAYMENT VOUCHER CREATE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
