import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { prisma } from "@/lib/db";
import type { AccountingPaymentMethod, Prisma } from "@prisma/client";

export type CustomerPaymentListItem = {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  receiptDate: string;
  method: AccountingPaymentMethod;
  methodLabel: string;
  collectedBy: string;
  reference: string;
  status: string;
  statusLabel: string;
  currency: string;
  receivingTotal: string;
  discountTotal: string;
  totalSettled: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type CustomerPaymentKpis = {
  totalReceipts: number;
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
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedStoreId = searchParams.get("storeId");

    const storeScope = getListStoreFilter(currentUser, requestedStoreId);
    if (!storeScope.ok) {
      return NextResponse.json(fail(storeScope.message, storeScope.code), {
        status: storeScope.status,
      });
    }

    const where: Prisma.AccountingCustomerPaymentReceiptWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { receiptNumber: { contains: query } },
        { reference: { contains: query } },
        { chequeNo: { contains: query } },
        { collectedBy: { contains: query } },
        { customer: { name: { contains: query } } },
        { customer: { mobile: { contains: query } } },
      ];
    }

    const receipts = await prisma.accountingCustomerPaymentReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, address: true } },
        store: { select: { id: true, code: true, name: true } },
      },
    });

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;

    const items: CustomerPaymentListItem[] = receipts.map((r) => {
      const receivingTotal = Number(r.receivingTotal);
      const discountTotal = Number(r.discountTotal);
      const totalSettled = receivingTotal + discountTotal;

      if (r.status === "DRAFT") drafts += 1;
      if (r.status === "APPROVED") {
        approved += 1;
        if (r.currency === "LKR") approvedValueLkr += receivingTotal;
      }

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        customerId: r.customerId,
        customerName: r.customer.name,
        customerCity: r.customer.address?.split(",")?.pop()?.trim() || "",
        receiptDate: formatDate(r.receiptDate),
        method: r.method,
        methodLabel: METHOD_LABELS[r.method] ?? r.method,
        collectedBy: r.collectedBy || "—",
        reference: r.reference || r.chequeNo || "—",
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        receivingTotal: formatNumber(receivingTotal),
        discountTotal: formatNumber(discountTotal),
        totalSettled: formatNumber(totalSettled),
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
      };
    });

    const kpis: CustomerPaymentKpis = {
      totalReceipts: receipts.length,
      drafts,
      approved,
      approvedValueLkr: formatNumber(approvedValueLkr),
    };

    return NextResponse.json(ok({ items, kpis }, "Customer payment receipts fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[CUSTOMER PAYMENT LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POST — create draft receipt ─────────────────────────────────────────────

type CreateAllocation = {
  // Exactly one of invoiceId / posBillId set per row (or neither, when
  // isOnAccount=true).
  invoiceId?: string | null;
  posBillId?: string | null;
  invoiceNumber?: string; // doubles as billNo for POS-bill allocations (UI label)
  invoiceDate?: string | null; // doubles as billDate for POS-bill allocations
  totalAmount: string;
  receivableAmount: string;
  receivingAmount: string;
  discount: string;
  description?: string;
  notes: string;
  isOnAccount: boolean;
  lineOrder: number;
};

type CreateBody = {
  receiptNumber: string;
  customerId: string;
  storeId?: string;
  receiveToAccountId: string;
  receiptDate: string;
  method: string;
  currency: string;
  collectedBy: string;
  reference: string;
  chequeNo: string;
  notes: string;
  allocations: CreateAllocation[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateBody;

    // receiptNumber is server-assigned from the form-id sequence.
    if (!body.customerId) {
      return NextResponse.json(fail("Customer is required.", "VALIDATION_ERROR"), {
        status: 422,
      });
    }
    if (!body.receiveToAccountId) {
      return NextResponse.json(
        fail("Receive-to (cash) account is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    if (!isMethod(body.method)) {
      return NextResponse.json(fail("Invalid payment method.", "VALIDATION_ERROR"), {
        status: 422,
      });
    }
    const method = body.method;
    if (!body.allocations?.length) {
      return NextResponse.json(
        fail("At least one allocation is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(fail(storeResolution.message, storeResolution.code), {
        status: storeResolution.status,
      });
    }
    const effectiveStoreId = storeResolution.storeId;

    let receivingTotal = 0;
    let discountTotal = 0;
    for (const line of body.allocations) {
      receivingTotal += Number(line.receivingAmount || 0);
      discountTotal += Number(line.discount || 0);
    }

    if (receivingTotal <= 0 && discountTotal <= 0) {
      return NextResponse.json(
        fail(
          "Receipt total must be greater than zero (receiving or discount).",
          "VALIDATION_ERROR",
        ),
        { status: 422 },
      );
    }

    const [customer, receiveToAccount] = await Promise.all([
      prisma.accountingClient.findUnique({
        where: { id: body.customerId },
        select: { id: true },
      }),
      prisma.chartOfAccount.findUnique({
        where: { id: body.receiveToAccountId },
        select: { id: true },
      }),
    ]);

    if (!customer) {
      return NextResponse.json(fail("Customer not found.", "NOT_FOUND"), { status: 404 });
    }
    if (!receiveToAccount) {
      return NextResponse.json(fail("Receive-to account not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    // Per-invoice cap validation: each invoice-linked allocation's
    // receivableAmount (= receiving + discount on that line, the amount being
    // cleared from AAR) cannot exceed the invoice's remaining receivable.
    // Remaining = invoice.total − sum(approved CPR allocations on prior
    // receipts). Customer Returns will join this calc when they land.
    const invoiceAllocations = body.allocations.filter(
      (line) => !line.isOnAccount && line.invoiceId,
    );
    if (invoiceAllocations.length) {
      const invoiceIds = Array.from(
        new Set(invoiceAllocations.map((line) => line.invoiceId).filter((v): v is string => !!v)),
      );
      const invoices = await prisma.accountingInvoice.findMany({
        where: { id: { in: invoiceIds } },
        include: {
          paymentAllocations: {
            where: { receipt: { status: "APPROVED" } },
            select: { receivableAmount: true },
          },
        },
      });

      const remainingByInvoiceId = new Map<
        string,
        { remaining: number; invoiceNumber: string; status: string }
      >();
      for (const inv of invoices) {
        const total = Number(inv.total);
        const allocated = inv.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        remainingByInvoiceId.set(inv.id, {
          remaining: Math.max(0, total - allocated),
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
        });
      }

      // Aggregate this receipt's receivable per invoice (handle two rows on
      // the same invoice).
      const requestedByInvoiceId = new Map<string, number>();
      for (const line of invoiceAllocations) {
        if (!line.invoiceId) continue;
        const cleared = Number(line.receivingAmount || 0) + Number(line.discount || 0);
        requestedByInvoiceId.set(
          line.invoiceId,
          (requestedByInvoiceId.get(line.invoiceId) ?? 0) + cleared,
        );
      }

      for (const [invoiceId, requested] of requestedByInvoiceId) {
        const info = remainingByInvoiceId.get(invoiceId);
        if (!info) {
          return NextResponse.json(
            fail("An allocation references a missing invoice.", "VALIDATION_ERROR"),
            { status: 422 },
          );
        }
        if (info.status !== "APPROVED") {
          return NextResponse.json(
            fail(
              `Invoice ${info.invoiceNumber} is not approved and cannot be paid against.`,
              "VALIDATION_ERROR",
            ),
            { status: 422 },
          );
        }
        if (requested > info.remaining + 1e-9) {
          return NextResponse.json(
            fail(
              `Allocation against invoice ${info.invoiceNumber} exceeds remaining receivable. Remaining: ${info.remaining.toFixed(2)}, requested: ${requested.toFixed(2)}.`,
              "VALIDATION_ERROR",
            ),
            { status: 422 },
          );
        }
      }
    }

    // POS-bill allocation cap validation (parallel to the invoice cap).
    // Per accounting-theories.md § 7.2 — a CPR allocates against open
    // SPLIT POS bills the merchant owes us. Cap: bill.total minus
    // approved CPR allocations + approved CR net.
    const posBillAllocations = body.allocations.filter(
      (line) => !line.isOnAccount && line.posBillId,
    );
    if (posBillAllocations.length) {
      const posBillIds = Array.from(
        new Set(posBillAllocations.map((line) => line.posBillId).filter((v): v is string => !!v)),
      );
      const posBills = await prisma.accountingPosBill.findMany({
        where: { id: { in: posBillIds } },
        include: {
          paymentAllocations: {
            where: { receipt: { status: "APPROVED" } },
            select: { receivableAmount: true },
          },
          customerReturns: {
            where: { status: "APPROVED" },
            select: { totalNet: true },
          },
        },
      });
      const remainingByPosBillId = new Map<
        string,
        { remaining: number; billNo: string; status: string; paymentMethod: string | null }
      >();
      for (const bill of posBills) {
        const total = Number(bill.total);
        const allocated = bill.paymentAllocations.reduce(
          (sum, a) => sum + Number(a.receivableAmount),
          0,
        );
        const returnedNet = bill.customerReturns.reduce(
          (sum, r) => sum + Number(r.totalNet),
          0,
        );
        remainingByPosBillId.set(bill.id, {
          remaining: Math.max(0, total - allocated - returnedNet),
          billNo: bill.billNo,
          status: bill.status,
          paymentMethod: bill.paymentMethod,
        });
      }
      const requestedByPosBillId = new Map<string, number>();
      for (const line of posBillAllocations) {
        if (!line.posBillId) continue;
        const cleared = Number(line.receivingAmount || 0) + Number(line.discount || 0);
        requestedByPosBillId.set(
          line.posBillId,
          (requestedByPosBillId.get(line.posBillId) ?? 0) + cleared,
        );
      }
      for (const [posBillId, requested] of requestedByPosBillId) {
        const info = remainingByPosBillId.get(posBillId);
        if (!info) {
          return NextResponse.json(
            fail("An allocation references a missing POS bill.", "VALIDATION_ERROR"),
            { status: 422 },
          );
        }
        if (info.status !== "COMPLETED" || info.paymentMethod !== "SPLIT") {
          return NextResponse.json(
            fail(
              `POS bill ${info.billNo} is not a settled SPLIT bill and cannot be paid against.`,
              "VALIDATION_ERROR",
            ),
            { status: 422 },
          );
        }
        if (requested > info.remaining + 1e-9) {
          return NextResponse.json(
            fail(
              `Allocation against POS bill ${info.billNo} exceeds remaining receivable. Remaining: ${info.remaining.toFixed(2)}, requested: ${requested.toFixed(2)}.`,
              "VALIDATION_ERROR",
            ),
            { status: 422 },
          );
        }
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const { formId: receiptNumber } = await consumeFormIdInTx(tx, "RC");
      return tx.accountingCustomerPaymentReceipt.create({
      data: {
        receiptNumber,
        customerId: body.customerId,
        storeId: effectiveStoreId,
        receiveToAccountId: body.receiveToAccountId,
        receiptDate: isoToDate(body.receiptDate),
        method,
        currency: body.currency || "LKR",
        collectedBy: body.collectedBy?.trim() ?? "",
        reference: body.reference?.trim() ?? "",
        chequeNo: body.chequeNo?.trim() ?? "",
        receivingTotal,
        discountTotal,
        notes: body.notes ?? "",
        status: "DRAFT",
        createdById: currentUser.id,
        allocations: {
          create: body.allocations.map((line, idx) => ({
            invoiceId: line.isOnAccount ? null : line.invoiceId || null,
            posBillId: line.isOnAccount ? null : line.posBillId || null,
            invoiceNumber: line.invoiceNumber ?? "",
            invoiceDate: line.invoiceDate ? isoToDate(line.invoiceDate) : null,
            totalAmount: Number(line.totalAmount || 0),
            receivableAmount: Number(line.receivableAmount || 0),
            receivingAmount: Number(line.receivingAmount || 0),
            discount: Number(line.discount || 0),
            description: line.description ?? "",
            notes: line.notes ?? "",
            isOnAccount: !!line.isOnAccount,
            lineOrder: line.lineOrder ?? idx,
          })),
        },
      },
      select: { id: true, receiptNumber: true },
    });
    });

    return NextResponse.json(
      ok({ id: created.id, receiptNumber: created.receiptNumber }, "Customer payment receipt created."),
      { status: 201 },
    );
  } catch (err) {
    console.error("[CUSTOMER PAYMENT CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
