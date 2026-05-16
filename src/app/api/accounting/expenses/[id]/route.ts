// GET /api/accounting/expenses/[id]
//
// Returns a single expense-voucher detail payload for the preview screen.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export type ExpenseVoucherDetailLine = {
  id: string;
  lineOrder: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategoryCode: string;
  accountCategoryName: string;
  amount: string;
  paymentMethod: string;
  memo: string;
};

export type ExpenseVoucherDetail = {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  status: string;
  statusLabel: string;
  currency: string;
  preparedBy: string;
  reference: string;
  notes: string;
  total: string;
  createdAt: string;
  approvedAt: string | null;
  createdByName: string;
  approvedByName: string | null;
  store: { id: string; code: string; name: string };
  payFromAccount: {
    id: string;
    code: string;
    name: string;
    typeName: string;
    categoryCode: string;
  };
  lines: ExpenseVoucherDetailLine[];
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const voucher = await prisma.accountingExpenseVoucher.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, code: true, name: true } },
        payFromAccount: {
          select: {
            id: true,
            code: true,
            name: true,
            type: { select: { name: true, category: { select: { code: true } } } },
          },
        },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                type: {
                  select: { category: { select: { code: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json(
        fail("Expense voucher not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    const detail: ExpenseVoucherDetail = {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      voucherDate: formatDate(voucher.voucherDate),
      status: voucher.status,
      statusLabel: STATUS_LABELS[voucher.status] ?? voucher.status,
      currency: voucher.currency,
      preparedBy: voucher.preparedBy,
      reference: voucher.reference,
      notes: voucher.notes,
      total: Number(voucher.total).toFixed(2),
      createdAt: voucher.createdAt.toISOString(),
      approvedAt: voucher.approvedAt?.toISOString() ?? null,
      createdByName: voucher.createdBy.displayName,
      approvedByName: voucher.approvedBy?.displayName ?? null,
      store: voucher.store,
      payFromAccount: {
        id: voucher.payFromAccount.id,
        code: voucher.payFromAccount.code,
        name: voucher.payFromAccount.name,
        typeName: voucher.payFromAccount.type.name,
        categoryCode: voucher.payFromAccount.type.category.code,
      },
      lines: voucher.lines.map((l) => ({
        id: l.id,
        lineOrder: l.lineOrder,
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountCategoryCode: l.account.type.category.code,
        accountCategoryName: l.account.type.category.name,
        amount: Number(l.amount).toFixed(2),
        paymentMethod: l.paymentMethod,
        memo: l.memo,
      })),
    };

    return NextResponse.json(
      ok({ voucher: detail }, "Expense voucher detail fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[EXPENSE DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
