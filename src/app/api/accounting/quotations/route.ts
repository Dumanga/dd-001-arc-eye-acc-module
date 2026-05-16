import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { prisma } from "@/lib/db";

export type QuotationListItem = {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  preparedBy: string;
  quotationDate: string;
  validUntil: string;
  status: string;
  statusLabel: string;
  itemsCount: number;
  total: string;
  currency: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type QuotationKpis = {
  totalQuotations: number;
  drafts: number;
  approved: number;
  expiringSoon: number;
  approvedValueLkr: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
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

    const where: Prisma.AccountingQuotationWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { quotationNumber: { contains: query } },
        { preparedBy: { contains: query } },
        { customerRef: { contains: query } },
        { customer: { name: { contains: query } } },
        { customer: { mobile: { contains: query } } },
      ];
    }

    const quotations = await prisma.accountingQuotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, address: true } },
        store: { select: { id: true, code: true, name: true } },
        lines: { select: { id: true } },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inSevenDays = new Date(today);
    inSevenDays.setDate(today.getDate() + 7);

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;
    let expiringSoon = 0;

    const items: QuotationListItem[] = quotations.map((q) => {
      if (q.status === "DRAFT") drafts += 1;
      if (q.status === "APPROVED") {
        approved += 1;
        if (q.currency === "LKR") approvedValueLkr += Number(q.total);
        const validUntilDate = new Date(q.validUntil);
        if (validUntilDate >= today && validUntilDate <= inSevenDays) {
          expiringSoon += 1;
        }
      }
      const cityLine = (q.customer.address ?? "").split(/\r?\n|,/)[0]?.trim() ?? "";
      return {
        id: q.id,
        quotationNumber: q.quotationNumber,
        customerId: q.customerId,
        customerName: q.customer.name,
        customerCity: cityLine || "—",
        preparedBy: q.preparedBy || "—",
        quotationDate: formatDate(q.quotationDate),
        validUntil: formatDate(q.validUntil),
        status: q.status,
        statusLabel: STATUS_LABELS[q.status] ?? q.status,
        itemsCount: q.lines.length,
        total: Number(q.total).toFixed(2),
        currency: q.currency,
        storeId: q.storeId,
        storeCode: q.store.code,
        storeName: q.store.name,
      };
    });

    const kpis: QuotationKpis = {
      totalQuotations: quotations.length,
      drafts,
      approved,
      expiringSoon,
      approvedValueLkr: approvedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Quotations fetched."), { status: 200 });
  } catch (err) {
    console.error("[QT LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

type CreateQuotationLine = {
  productId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  lineOrder: number;
};

type CreateQuotationBody = {
  quotationNumber: string;
  customerId: string;
  storeId?: string;
  quotationDate: string;
  validUntil: string;
  customerRef: string;
  preparedBy: string;
  currency: string;
  notes: string;
  terms: string;
  discount: string;
  lines: CreateQuotationLine[];
};

function decimal(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateQuotationBody;

    // quotationNumber is server-assigned from the form-id sequence.
    if (!body.customerId) {
      return NextResponse.json(fail("Customer is required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.quotationDate || !body.validUntil) {
      return NextResponse.json(fail("Quotation date and valid-until are required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.lines?.length) {
      return NextResponse.json(fail("At least one line item is required.", "VALIDATION_ERROR"), { status: 422 });
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    // Validate quantities are positive multiples of uomMinQty.
    for (const line of body.lines) {
      const qty = decimal(line.quantity);
      const minQty = Math.max(decimal(line.uomMinQty), 0);
      if (qty <= 0) {
        return NextResponse.json(
          fail(`Line "${line.itemName || line.itemCode}" must have a positive quantity.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (minQty > 0) {
        // Allow small floating tolerance.
        const ratio = qty / minQty;
        const rounded = Math.round(ratio);
        if (Math.abs(ratio - rounded) > 1e-6 || rounded === 0) {
          return NextResponse.json(
            fail(
              `Line "${line.itemName || line.itemCode}" quantity must be a positive multiple of ${minQty} (UOM minimum).`,
              "VALIDATION_ERROR"
            ),
            { status: 422 }
          );
        }
      }
    }

    const customer = await prisma.accountingClient.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json(fail("Customer not found.", "NOT_FOUND"), { status: 404 });
    }

    let subtotal = 0;
    const linesData = body.lines.map((line, idx) => {
      const quantity = decimal(line.quantity);
      const unitPrice = decimal(line.unitPrice);
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;
      return {
        productId: line.productId,
        itemCode: line.itemCode?.slice(0, 60) ?? "",
        itemName: line.itemName?.slice(0, 200) ?? "",
        description: line.description?.slice(0, 500) ?? "",
        quantity,
        unitPrice,
        lineTotal,
        uomName: line.uomName ?? "",
        uomBase: line.uomBase ?? "",
        uomMinQty: decimal(line.uomMinQty) || 1,
        lineOrder: line.lineOrder ?? idx,
      };
    });

    const discount = Math.max(0, decimal(body.discount));
    const total = Math.max(0, subtotal - discount);

    const created = await prisma.$transaction(async (tx) => {
      const { formId: quotationNumber } = await consumeFormIdInTx(tx, "QT");
      return tx.accountingQuotation.create({
      data: {
        quotationNumber,
        customerId: body.customerId,
        storeId: effectiveStoreId,
        status: "DRAFT",
        currency: body.currency || "LKR",
        quotationDate: isoToDate(body.quotationDate),
        validUntil: isoToDate(body.validUntil),
        customerRef: body.customerRef ?? "",
        preparedBy: body.preparedBy ?? "",
        notes: body.notes ?? "",
        terms: body.terms ?? "",
        discount,
        subtotal,
        total,
        createdById: currentUser.id,
        lines: { create: linesData },
      },
      select: { id: true, quotationNumber: true },
    });
    });

    return NextResponse.json(
      ok({ id: created.id, quotationNumber: created.quotationNumber }, "Quotation created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[QT CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
