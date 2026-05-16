import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import type { AccountingPaymentMethod } from "@prisma/client";

export type CustomerPaymentAllocationDetail = {
  id: string;
  lineOrder: number;
  invoiceId: string | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  isOnAccount: boolean;
  description: string;
  totalAmount: string;
  receivableAmount: string;
  receivingAmount: string;
  discount: string;
  notes: string;
};

export type CustomerPaymentDetail = {
  id: string;
  receiptNumber: string;
  status: string;
  statusLabel: string;
  receiptDate: string;
  method: AccountingPaymentMethod;
  methodLabel: string;
  currency: string;
  collectedBy: string;
  reference: string;
  chequeNo: string;
  notes: string;
  receivingTotal: string;
  discountTotal: string;
  totalSettled: string;
  createdAt: string;
  approvedAt: string | null;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    address: string;
    city: string;
    currency: string;
  };
  receiveToAccount: {
    id: string;
    code: string;
    name: string;
  };
  allocations: CustomerPaymentAllocationDetail[];
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const receipt = await prisma.accountingCustomerPaymentReceipt.findUnique({
      where: { id },
      include: {
        customer: true,
        receiveToAccount: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        allocations: { orderBy: { lineOrder: "asc" } },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        fail("Customer payment receipt not found.", "NOT_FOUND"),
        { status: 404 },
      );
    }

    const receivingTotal = Number(receipt.receivingTotal);
    const discountTotal = Number(receipt.discountTotal);

    const detail: CustomerPaymentDetail = {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      status: receipt.status,
      statusLabel: STATUS_LABELS[receipt.status] ?? receipt.status,
      receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
      method: receipt.method,
      methodLabel: METHOD_LABELS[receipt.method] ?? receipt.method,
      currency: receipt.currency,
      collectedBy: receipt.collectedBy,
      reference: receipt.reference,
      chequeNo: receipt.chequeNo,
      notes: receipt.notes,
      receivingTotal: formatNumber(receivingTotal),
      discountTotal: formatNumber(discountTotal),
      totalSettled: formatNumber(receivingTotal + discountTotal),
      createdAt: receipt.createdAt.toISOString(),
      approvedAt: receipt.approvedAt?.toISOString() ?? null,
      customer: {
        id: receipt.customer.id,
        name: receipt.customer.name,
        mobile: receipt.customer.mobile,
        email: receipt.customer.email ?? "",
        address: receipt.customer.address ?? "",
        city: receipt.customer.address?.split(",")?.pop()?.trim() ?? "",
        currency: receipt.customer.currency,
      },
      receiveToAccount: {
        id: receipt.receiveToAccount.id,
        code: receipt.receiveToAccount.code,
        name: receipt.receiveToAccount.name,
      },
      allocations: receipt.allocations.map((line) => ({
        id: line.id,
        lineOrder: line.lineOrder,
        invoiceId: line.invoiceId,
        invoiceNumber: line.invoiceNumber,
        invoiceDate: formatDate(line.invoiceDate),
        isOnAccount: line.isOnAccount,
        description: line.description,
        totalAmount: formatNumber(Number(line.totalAmount)),
        receivableAmount: formatNumber(Number(line.receivableAmount)),
        receivingAmount: formatNumber(Number(line.receivingAmount)),
        discount: formatNumber(Number(line.discount)),
        notes: line.notes,
      })),
      createdByName: receipt.createdBy.displayName,
      approvedByName: receipt.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(
      ok({ receipt: detail }, "Customer payment receipt detail fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[CUSTOMER PAYMENT DETAIL]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
