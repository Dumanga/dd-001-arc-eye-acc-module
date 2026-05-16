// /api/accounting/expenses
//
// GET  — list expense vouchers + KPIs (filter by store, search by voucher #,
//        memo, reference, prepared-by, or pay-from account code/name).
// POST — create a DRAFT expense voucher per accounting-theories.md §8.
//        Burns the next EXP form-id number atomically inside the same tx.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

// Pay-from account must be a Cash & Cash Equivalents subtype (asset).
// Matches the canonical type name in the chart-of-accounts seed.
const CASH_TYPE_NAME = "CASH & CASH EQUIVALENTS";

export type ExpenseVoucherListItem = {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  payFromAccountCode: string;
  payFromAccountName: string;
  lineCount: number;
  total: string;
  status: string;
  statusLabel: string;
  currency: string;
  preparedBy: string;
  reference: string;
  notes: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  createdByName: string;
  approvedAt: string | null;
};

export type ExpenseVoucherKpis = {
  totalVouchers: number;
  draftCount: number;
  approvedCount: number;
  approvedValueLkr: string;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

// ─── GET — list + KPIs ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const storeScope = getListStoreFilter(currentUser, searchParams.get("storeId"));
    if (!storeScope.ok) {
      return NextResponse.json(fail(storeScope.message, storeScope.code), {
        status: storeScope.status,
      });
    }

    const where: Prisma.AccountingExpenseVoucherWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { voucherNumber: { contains: query } },
        { reference: { contains: query } },
        { preparedBy: { contains: query } },
        { notes: { contains: query } },
        { payFromAccount: { OR: [{ code: { contains: query } }, { name: { contains: query } }] } },
      ];
    }

    const rows = await prisma.accountingExpenseVoucher.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        payFromAccount: { select: { code: true, name: true } },
        store: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        _count: { select: { lines: true } },
      },
    });

    let approvedValueLkr = 0;
    let draftCount = 0;
    let approvedCount = 0;

    const items: ExpenseVoucherListItem[] = rows.map((r) => {
      if (r.status === "DRAFT") draftCount += 1;
      if (r.status === "APPROVED") {
        approvedCount += 1;
        if (r.currency === "LKR") approvedValueLkr += Number(r.total);
      }
      return {
        id: r.id,
        voucherNumber: r.voucherNumber,
        voucherDate: formatDate(r.voucherDate),
        payFromAccountCode: r.payFromAccount.code,
        payFromAccountName: r.payFromAccount.name,
        lineCount: r._count.lines,
        total: Number(r.total).toFixed(2),
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        preparedBy: r.preparedBy,
        reference: r.reference,
        notes: r.notes,
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
        createdByName: r.createdBy.displayName,
        approvedAt: r.approvedAt?.toISOString() ?? null,
      };
    });

    const kpis: ExpenseVoucherKpis = {
      totalVouchers: rows.length,
      draftCount,
      approvedCount,
      approvedValueLkr: approvedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Expense vouchers fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[EXPENSE LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POST — create draft voucher ─────────────────────────────────────────────

type CreateExpenseLineBody = {
  accountId: string;
  amount: string;
  paymentMethod?: string;
  memo: string;
};

type CreateExpenseBody = {
  storeId?: string;
  voucherDate: string; // ISO yyyy-mm-dd
  payFromAccountId: string;
  currency?: string;
  preparedBy?: string;
  reference?: string;
  notes?: string;
  lines: CreateExpenseLineBody[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateExpenseBody;

    // ── Header validations ───────────────────────────────────────────
    if (!body.voucherDate || typeof body.voucherDate !== "string") {
      return NextResponse.json(
        fail("Voucher date is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!body.payFromAccountId) {
      return NextResponse.json(
        fail("Pay-from account is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        fail("At least one expense line is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // ── Branch resolution (super-admin picks; branch users auto) ─────
    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    // ── Pay-from must be a Cash & Cash Equivalents asset (§8) ────────
    const payFrom = await prisma.chartOfAccount.findFirst({
      where: { id: body.payFromAccountId, isActive: true },
      select: { id: true, type: { select: { name: true, category: { select: { code: true } } } } },
    });
    if (!payFrom) {
      return NextResponse.json(
        fail("Pay-from account not found or inactive.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (payFrom.type.category.code !== "ASSET" || payFrom.type.name !== CASH_TYPE_NAME) {
      return NextResponse.json(
        fail(
          "Pay-from account must be a Cash & Cash Equivalents asset (per §8).",
          "VALIDATION_ERROR"
        ),
        { status: 422 }
      );
    }

    // ── Line-level validations ───────────────────────────────────────
    const normalizedLines: { accountId: string; amount: number; paymentMethod: string; memo: string }[] = [];
    let total = 0;
    for (const line of body.lines) {
      const amount = Number(line.amount);
      if (!line.accountId || !isFiniteNumber(amount) || amount <= 0) {
        return NextResponse.json(
          fail("Each line must have an account and a positive amount.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      const memo = (line.memo ?? "").trim();
      if (!memo) {
        return NextResponse.json(
          fail("Each line must have a memo.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      normalizedLines.push({
        accountId: line.accountId,
        amount,
        paymentMethod: (line.paymentMethod ?? "CASH").toUpperCase(),
        memo,
      });
      total += amount;
    }

    // Validate every line account exists & is active
    const lineAccountIds = Array.from(new Set(normalizedLines.map((l) => l.accountId)));
    const accountRows = await prisma.chartOfAccount.findMany({
      where: { id: { in: lineAccountIds }, isActive: true },
      select: { id: true },
    });
    if (accountRows.length !== lineAccountIds.length) {
      return NextResponse.json(
        fail("One or more line accounts are not found or inactive.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // ── Create draft inside a tx so the form-id burn is atomic ──────
    const created = await prisma.$transaction(async (tx) => {
      const { formId } = await consumeFormIdInTx(tx, "EXP");

      return tx.accountingExpenseVoucher.create({
        data: {
          voucherNumber: formId,
          storeId: effectiveStoreId,
          payFromAccountId: body.payFromAccountId,
          voucherDate: isoToDate(body.voucherDate),
          currency: (body.currency ?? "LKR").toUpperCase().slice(0, 10) || "LKR",
          preparedBy: (body.preparedBy ?? "").trim().slice(0, 100),
          reference: (body.reference ?? "").trim().slice(0, 150),
          total: new Prisma.Decimal(total.toFixed(4)),
          notes: (body.notes ?? "").trim(),
          status: "DRAFT",
          createdById: currentUser.id,
          lines: {
            create: normalizedLines.map((l, idx) => ({
              accountId: l.accountId,
              amount: new Prisma.Decimal(l.amount.toFixed(4)),
              paymentMethod: l.paymentMethod,
              memo: l.memo.slice(0, 500),
              lineOrder: idx,
            })),
          },
        },
        select: { id: true, voucherNumber: true },
      });
    });

    return NextResponse.json(
      ok({ id: created.id, voucherNumber: created.voucherNumber }, "Expense voucher created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[EXPENSE CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
