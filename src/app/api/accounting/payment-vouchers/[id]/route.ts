import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import type { AccountingPaymentMethod } from "@prisma/client";

export type PaymentVoucherAllocationDetail = {
  id: string;
  lineOrder: number;
  goodsReceiptId: string | null;
  grnNumber: string;
  grnDate: string | null;
  dueDate: string | null;
  totalAmount: string;
  payableAmount: string;
  payingAmount: string;
  discount: string;
  notes: string;
};

export type PaymentVoucherDetail = {
  id: string;
  voucherNumber: string;
  status: string;
  statusLabel: string;
  voucherDate: string;
  method: AccountingPaymentMethod;
  methodLabel: string;
  currency: string;
  preparedBy: string;
  reference: string;
  chequeNo: string;
  notes: string;
  paymentTotal: string;
  discountTotal: string;
  totalSettled: string;
  createdAt: string;
  approvedAt: string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
    currency: string;
  };
  payFromAccount: {
    id: string;
    code: string;
    name: string;
  };
  allocations: PaymentVoucherAllocationDetail[];
  createdByName: string;
  approvedByName: string | null;
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

function formatDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "suppliers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const voucher = await prisma.accountingPaymentVoucher.findUnique({
      where: { id },
      include: {
        supplier: {
          include: { contactInfo: true, salesInfo: true },
        },
        payFromAccount: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        allocations: { orderBy: { lineOrder: "asc" } },
      },
    });

    if (!voucher) {
      return NextResponse.json(fail("Payment voucher not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    const paymentTotal = Number(voucher.paymentTotal);
    const discountTotal = Number(voucher.discountTotal);

    const detail: PaymentVoucherDetail = {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      status: voucher.status,
      statusLabel: STATUS_LABELS[voucher.status] ?? voucher.status,
      voucherDate: voucher.voucherDate.toISOString().slice(0, 10),
      method: voucher.method,
      methodLabel: METHOD_LABELS[voucher.method] ?? voucher.method,
      currency: voucher.currency,
      preparedBy: voucher.preparedBy,
      reference: voucher.reference,
      chequeNo: voucher.chequeNo,
      notes: voucher.notes,
      paymentTotal: formatNumber(paymentTotal),
      discountTotal: formatNumber(discountTotal),
      totalSettled: formatNumber(paymentTotal + discountTotal),
      createdAt: voucher.createdAt.toISOString(),
      approvedAt: voucher.approvedAt?.toISOString() ?? null,
      supplier: {
        id: voucher.supplier.id,
        code: voucher.supplier.code,
        name: voucher.supplier.name,
        email: voucher.supplier.email,
        phone: [
          voucher.supplier.primaryPhoneDialCode,
          voucher.supplier.primaryPhoneLocalNumber,
        ]
          .filter(Boolean)
          .join(" "),
        city: voucher.supplier.contactInfo?.city ?? "",
        country: voucher.supplier.contactInfo?.country ?? "",
        addressLine1: voucher.supplier.contactInfo?.addressLine1 ?? "",
        addressLine2: voucher.supplier.contactInfo?.addressLine2 ?? "",
        currency: voucher.supplier.salesInfo?.currencyCode ?? voucher.currency,
      },
      payFromAccount: {
        id: voucher.payFromAccount.id,
        code: voucher.payFromAccount.code,
        name: voucher.payFromAccount.name,
      },
      allocations: voucher.allocations.map((line) => ({
        id: line.id,
        lineOrder: line.lineOrder,
        goodsReceiptId: line.goodsReceiptId,
        grnNumber: line.grnNumber,
        grnDate: formatDate(line.grnDate),
        dueDate: formatDate(line.dueDate),
        totalAmount: formatNumber(Number(line.totalAmount)),
        payableAmount: formatNumber(Number(line.payableAmount)),
        payingAmount: formatNumber(Number(line.payingAmount)),
        discount: formatNumber(Number(line.discount)),
        notes: line.notes,
      })),
      createdByName: voucher.createdBy.displayName,
      approvedByName: voucher.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(
      ok({ voucher: detail }, "Payment voucher detail fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[PAYMENT VOUCHER DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
