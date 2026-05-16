// GET /api/accounting/journal-vouchers/[id]
//
// Returns a single journal-voucher detail payload for the preview screen.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

export type JournalVoucherDetailLine = {
  id: string;
  lineOrder: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategoryCode: string;
  accountCategoryName: string;
  debitAmount: string;
  creditAmount: string;
  memo: string;
};

export type JournalVoucherDetail = {
  id: string;
  voucherNumber: string;
  entryDate: string;
  status: string;
  statusLabel: string;
  currency: string;
  description: string;
  notes: string;
  total: string;
  createdAt: string;
  postedAt: string | null;
  createdByName: string;
  postedByName: string | null;
  store: { id: string; code: string; name: string };
  lines: JournalVoucherDetailLine[];
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

    const voucher = await prisma.accountingJournalVoucher.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        postedBy: { select: { displayName: true } },
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
        fail("Journal voucher not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    const detail: JournalVoucherDetail = {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      entryDate: formatDate(voucher.entryDate),
      status: voucher.status,
      statusLabel: STATUS_LABELS[voucher.status] ?? voucher.status,
      currency: voucher.currency,
      description: voucher.description,
      notes: voucher.notes,
      total: Number(voucher.total).toFixed(2),
      createdAt: voucher.createdAt.toISOString(),
      postedAt: voucher.postedAt?.toISOString() ?? null,
      createdByName: voucher.createdBy.displayName,
      postedByName: voucher.postedBy?.displayName ?? null,
      store: voucher.store,
      lines: voucher.lines.map((l) => ({
        id: l.id,
        lineOrder: l.lineOrder,
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountCategoryCode: l.account.type.category.code,
        accountCategoryName: l.account.type.category.name,
        debitAmount: Number(l.debitAmount).toFixed(2),
        creditAmount: Number(l.creditAmount).toFixed(2),
        memo: l.memo,
      })),
    };

    return NextResponse.json(
      ok({ voucher: detail }, "Journal voucher detail fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[JOURNAL VOUCHER DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
