import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import {
  authorizeAccountingAnyAccess,
  authorizeAccountingSuperAdmin,
} from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type QuotationDetailLine = {
  id: string;
  lineOrder: number;
  productId: string;
  productCode: string;
  productName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  uomName: string;
  uomBase: string;
  uomMinQty: string;
};

export type QuotationDetail = {
  id: string;
  quotationNumber: string;
  status: string;
  statusLabel: string;
  currency: string;
  quotationDate: string;
  validUntil: string;
  customerRef: string;
  preparedBy: string;
  notes: string;
  terms: string;
  discount: string;
  subtotal: string;
  total: string;
  createdAt: string;
  approvedAt: string | null;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    currency: string;
  };
  lines: QuotationDetailLine[];
  createdByName: string;
  approvedByName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const quotation = await prisma.accountingQuotation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, mobile: true, email: true, address: true, currency: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: { product: { select: { code: true, salesName: true, purchaseName: true } } },
        },
      },
    });

    if (!quotation) {
      return NextResponse.json(fail("Quotation not found.", "NOT_FOUND"), { status: 404 });
    }

    const lines: QuotationDetailLine[] = quotation.lines.map((line) => {
      const productName = line.itemName || line.product.salesName || line.product.purchaseName || line.product.code;
      return {
        id: line.id,
        lineOrder: line.lineOrder,
        productId: line.productId,
        productCode: line.itemCode || line.product.code,
        productName,
        description: line.description,
        quantity: Number(line.quantity).toString(),
        unitPrice: Number(line.unitPrice).toFixed(2),
        lineTotal: Number(line.lineTotal).toFixed(2),
        uomName: line.uomName,
        uomBase: line.uomBase,
        uomMinQty: Number(line.uomMinQty).toString(),
      };
    });

    const detail: QuotationDetail = {
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      status: quotation.status,
      statusLabel: STATUS_LABELS[quotation.status] ?? quotation.status,
      currency: quotation.currency,
      quotationDate: quotation.quotationDate.toISOString().slice(0, 10),
      validUntil: quotation.validUntil.toISOString().slice(0, 10),
      customerRef: quotation.customerRef,
      preparedBy: quotation.preparedBy,
      notes: quotation.notes,
      terms: quotation.terms,
      discount: Number(quotation.discount).toFixed(2),
      subtotal: Number(quotation.subtotal).toFixed(2),
      total: Number(quotation.total).toFixed(2),
      createdAt: quotation.createdAt.toISOString(),
      approvedAt: quotation.approvedAt?.toISOString() ?? null,
      customer: {
        id: quotation.customer.id,
        name: quotation.customer.name,
        mobile: quotation.customer.mobile,
        email: quotation.customer.email ?? "",
        address: quotation.customer.address ?? "",
        currency: quotation.customer.currency,
      },
      lines,
      createdByName: quotation.createdBy.displayName,
      approvedByName: quotation.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(ok({ quotation: detail }, "Quotation detail fetched."), { status: 200 });
  } catch (err) {
    console.error("[QT DETAIL]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

// ─── PATCH — edit a DRAFT quotation ─────────────────────────────────────
// Super-admin only. Allowed only while the quotation is still DRAFT — once
// it's APPROVED the user must Recall it first (which flips it back to
// DRAFT) before editing. quotationNumber is immutable.

type UpdateQuotationLine = {
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

type UpdateQuotationBody = {
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
  lines: UpdateQuotationLine[];
};

function decimal(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingSuperAdmin(["customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = (await request.json()) as UpdateQuotationBody;

    const existing = await prisma.accountingQuotation.findUnique({
      where: { id },
      select: { id: true, status: true, storeId: true },
    });
    if (!existing) {
      return NextResponse.json(fail("Quotation not found.", "NOT_FOUND"), { status: 404 });
    }
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        fail("Only DRAFT quotations can be edited. Recall it first.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    if (!body.customerId) {
      return NextResponse.json(fail("Customer is required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.quotationDate || !body.validUntil) {
      return NextResponse.json(
        fail("Quotation date and valid-until are required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!body.lines?.length) {
      return NextResponse.json(
        fail("At least one line item is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // Match the qty / UOM-multiple validation in POST.
    for (const line of body.lines) {
      const qty = decimal(line.quantity);
      const minQty = Math.max(decimal(line.uomMinQty), 0);
      if (qty <= 0) {
        return NextResponse.json(
          fail(
            `Line "${line.itemName || line.itemCode}" must have a positive quantity.`,
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
      if (minQty > 0) {
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

    const updated = await prisma.$transaction(async (tx) => {
      // Replace lines wholesale — simpler than diff-and-patch, and DRAFT
      // quotations don't have any dependent records pointing at line ids.
      await tx.accountingQuotationLine.deleteMany({ where: { quotationId: id } });
      await tx.accountingQuotation.update({
        where: { id },
        data: {
          customerId: body.customerId,
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
          lines: { create: linesData },
        },
      });

      return tx.accountingQuotation.findUniqueOrThrow({
        where: { id },
        select: { id: true, quotationNumber: true },
      });
    });

    return NextResponse.json(
      ok({ id: updated.id, quotationNumber: updated.quotationNumber }, "Quotation updated."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[QT UPDATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
