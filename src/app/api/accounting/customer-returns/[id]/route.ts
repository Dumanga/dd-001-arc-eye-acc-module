import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type CustomerReturnDetailLine = {
  id: string;
  lineOrder: number;
  // Source-line ref. Populated based on the parent return's sourceType:
  //   • INVOICE   → invoiceLineId set, sourcePosBillLineId empty
  //   • POS_BILL  → sourcePosBillLineId set, invoiceLineId empty
  invoiceLineId: string;
  sourcePosBillLineId: string;
  productCode: string;
  productName: string;
  description: string;
  uomName: string;
  uomBase: string;
  originalQty: string;
  unitPrice: string;
  returnQty: string;
  lineGross: string;
  lineDiscount: string;
  lineNet: string;
  reason: string;
  reasonLabel: string;
  notes: string;
};

export type CustomerReturnDetail = {
  id: string;
  returnNumber: string;
  sourceType: "INVOICE" | "POS_BILL";
  status: string;
  statusLabel: string;
  returnDate: string;
  reasonHeader: string;
  returnedBy: string;
  notes: string;
  currency: string;
  totalQty: string;
  totalGross: string;
  totalDiscount: string;
  totalNet: string;
  createdAt: string;
  approvedAt: string | null;
  // Populated when sourceType=INVOICE.
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    total: string;
  } | null;
  // Populated when sourceType=POS_BILL.
  posBill: {
    id: string;
    billNo: string;
    billDate: string;
    total: string;
  } | null;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    city: string;
    currency: string;
  };
  lines: CustomerReturnDetailLine[];
  createdByName: string;
  approvedByName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const REASON_LABELS: Record<string, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong Item",
  EXPIRED: "Expired",
  EXCESS: "Excess",
  OTHER: "Other",
};

function formatNumber(value: number): string {
  return value.toFixed(2);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const ret = await prisma.accountingCustomerReturn.findUnique({
      where: { id },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, total: true } },
        sourcePosBill: { select: { id: true, billNo: true, postedAt: true, total: true } },
        customer: true,
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: { orderBy: { lineOrder: "asc" } },
      },
    });

    if (!ret) {
      return NextResponse.json(fail("Customer return not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    const detail: CustomerReturnDetail = {
      id: ret.id,
      returnNumber: ret.returnNumber,
      sourceType: ret.sourceType,
      status: ret.status,
      statusLabel: STATUS_LABELS[ret.status] ?? ret.status,
      returnDate: ret.returnDate.toISOString().slice(0, 10),
      reasonHeader: ret.reasonHeader,
      returnedBy: ret.returnedBy,
      notes: ret.notes,
      currency: ret.currency,
      totalQty: Number(ret.totalQty).toString(),
      totalGross: formatNumber(Number(ret.totalGross)),
      totalDiscount: formatNumber(Number(ret.totalDiscount)),
      totalNet: formatNumber(Number(ret.totalNet)),
      createdAt: ret.createdAt.toISOString(),
      approvedAt: ret.approvedAt?.toISOString() ?? null,
      invoice: ret.invoice
        ? {
            id: ret.invoice.id,
            invoiceNumber: ret.invoice.invoiceNumber,
            invoiceDate: ret.invoice.invoiceDate.toISOString().slice(0, 10),
            total: formatNumber(Number(ret.invoice.total)),
          }
        : null,
      posBill: ret.sourcePosBill
        ? {
            id: ret.sourcePosBill.id,
            billNo: ret.sourcePosBill.billNo,
            billDate: ret.sourcePosBill.postedAt
              ? ret.sourcePosBill.postedAt.toISOString().slice(0, 10)
              : "",
            total: formatNumber(Number(ret.sourcePosBill.total)),
          }
        : null,
      customer: {
        id: ret.customer.id,
        name: ret.customer.name,
        mobile: ret.customer.mobile,
        email: ret.customer.email ?? "",
        address: ret.customer.address ?? "",
        city: ret.customer.address?.split(",")?.pop()?.trim() ?? "",
        currency: ret.customer.currency,
      },
      lines: ret.lines.map((line) => ({
        id: line.id,
        lineOrder: line.lineOrder,
        invoiceLineId: line.invoiceLineId ?? "",
        sourcePosBillLineId: line.sourcePosBillLineId ?? "",
        productCode: line.itemCode,
        productName: line.itemName,
        description: line.description,
        uomName: line.uomName,
        uomBase: line.uomBase,
        originalQty: Number(line.originalQty).toString(),
        unitPrice: formatNumber(Number(line.unitPrice)),
        returnQty: Number(line.returnQty).toString(),
        lineGross: formatNumber(Number(line.lineGross)),
        lineDiscount: formatNumber(Number(line.lineDiscount)),
        lineNet: formatNumber(Number(line.lineNet)),
        reason: line.reason,
        reasonLabel: REASON_LABELS[line.reason] ?? line.reason,
        notes: line.notes,
      })),
      createdByName: ret.createdBy.displayName,
      approvedByName: ret.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(
      ok({ customerReturn: detail }, "Customer return detail fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CR DETAIL]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
