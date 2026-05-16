import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type QuotationDetailLine = {
  id: string;
  lineOrder: number;
  productCode: string;
  productName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  uomName: string;
  uomBase: string;
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
        productCode: line.itemCode || line.product.code,
        productName,
        description: line.description,
        quantity: Number(line.quantity).toString(),
        unitPrice: Number(line.unitPrice).toFixed(2),
        lineTotal: Number(line.lineTotal).toFixed(2),
        uomName: line.uomName,
        uomBase: line.uomBase,
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
