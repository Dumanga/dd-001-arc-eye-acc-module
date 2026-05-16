// /api/accounting/journal-vouchers
//
// GET  — list journal entry vouchers + KPIs.
// POST — create a DRAFT journal entry voucher per accounting-theories.md §9.
//        Burns the next JEV form-id number atomically inside the same tx.

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
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

export type JournalVoucherListItem = {
  id: string;
  voucherNumber: string;
  entryDate: string;
  description: string;
  lineCount: number;
  total: string;
  status: string;
  statusLabel: string;
  currency: string;
  notes: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  createdByName: string;
  postedAt: string | null;
};

export type JournalVoucherKpis = {
  totalVouchers: number;
  draftCount: number;
  postedCount: number;
  postedValueLkr: string;
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

    const where: Prisma.AccountingJournalVoucherWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { voucherNumber: { contains: query } },
        { description: { contains: query } },
        { notes: { contains: query } },
      ];
    }

    const rows = await prisma.accountingJournalVoucher.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        store: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        _count: { select: { lines: true } },
      },
    });

    let postedValueLkr = 0;
    let draftCount = 0;
    let postedCount = 0;

    const items: JournalVoucherListItem[] = rows.map((r) => {
      if (r.status === "DRAFT") draftCount += 1;
      if (r.status === "POSTED") {
        postedCount += 1;
        if (r.currency === "LKR") postedValueLkr += Number(r.total);
      }
      return {
        id: r.id,
        voucherNumber: r.voucherNumber,
        entryDate: formatDate(r.entryDate),
        description: r.description,
        lineCount: r._count.lines,
        total: Number(r.total).toFixed(2),
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        notes: r.notes,
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
        createdByName: r.createdBy.displayName,
        postedAt: r.postedAt?.toISOString() ?? null,
      };
    });

    const kpis: JournalVoucherKpis = {
      totalVouchers: rows.length,
      draftCount,
      postedCount,
      postedValueLkr: postedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Journal vouchers fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[JOURNAL VOUCHER LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POST — create draft voucher ─────────────────────────────────────────────

type CreateJournalLineBody = {
  accountId: string;
  // Each line carries either a debit or a credit (>0). The other side is 0 or
  // omitted. See accounting-theories.md §9 "Form Shape".
  debitAmount?: string;
  creditAmount?: string;
  memo: string;
};

type CreateJournalVoucherBody = {
  storeId?: string;
  entryDate: string; // ISO yyyy-mm-dd
  description: string;
  currency?: string;
  notes?: string;
  lines: CreateJournalLineBody[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateJournalVoucherBody;

    // ── Header validations ───────────────────────────────────────────
    if (!body.entryDate || typeof body.entryDate !== "string") {
      return NextResponse.json(
        fail("Entry date is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    const description = (body.description ?? "").trim();
    if (!description) {
      return NextResponse.json(
        fail("Description is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!Array.isArray(body.lines) || body.lines.length < 2) {
      return NextResponse.json(
        fail("At least two journal entry lines are required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // ── Branch resolution ────────────────────────────────────────────
    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    // ── Per-line validations + balance check ─────────────────────────
    const normalizedLines: {
      accountId: string;
      debitAmount: number;
      creditAmount: number;
      memo: string;
    }[] = [];
    let totalDr = 0;
    let totalCr = 0;

    for (let i = 0; i < body.lines.length; i++) {
      const line = body.lines[i];
      const dr = Number(line.debitAmount ?? 0);
      const cr = Number(line.creditAmount ?? 0);
      if (!line.accountId) {
        return NextResponse.json(
          fail(`Line ${i + 1}: account is required.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (!Number.isFinite(dr) || !Number.isFinite(cr) || dr < 0 || cr < 0) {
        return NextResponse.json(
          fail(`Line ${i + 1}: amounts must be non-negative numbers.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      // §9: "Either a debit amount or a credit amount — not both."
      if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
        return NextResponse.json(
          fail(
            `Line ${i + 1}: each line must have either a debit OR a credit amount (not both, not neither).`,
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
      const memo = (line.memo ?? "").trim();
      if (!memo) {
        return NextResponse.json(
          fail(`Line ${i + 1}: memo is required.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      normalizedLines.push({
        accountId: line.accountId,
        debitAmount: dr,
        creditAmount: cr,
        memo,
      });
      totalDr += dr;
      totalCr += cr;
    }

    // §9: "Create Journal Entry button is disabled until the entry balances".
    if (Math.abs(totalDr - totalCr) > 0.005) {
      return NextResponse.json(
        fail(
          `Voucher is unbalanced: Dr ${totalDr.toFixed(2)} ≠ Cr ${totalCr.toFixed(2)}.`,
          "VALIDATION_ERROR"
        ),
        { status: 422 }
      );
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
      const { formId } = await consumeFormIdInTx(tx, "JEV");

      return tx.accountingJournalVoucher.create({
        data: {
          voucherNumber: formId,
          storeId: effectiveStoreId,
          entryDate: isoToDate(body.entryDate),
          currency: (body.currency ?? "LKR").toUpperCase().slice(0, 10) || "LKR",
          description: description.slice(0, 500),
          total: new Prisma.Decimal(totalDr.toFixed(4)), // = totalCr (balanced)
          notes: (body.notes ?? "").trim(),
          status: "DRAFT",
          createdById: currentUser.id,
          lines: {
            create: normalizedLines.map((l, idx) => ({
              accountId: l.accountId,
              debitAmount: new Prisma.Decimal(l.debitAmount.toFixed(4)),
              creditAmount: new Prisma.Decimal(l.creditAmount.toFixed(4)),
              memo: l.memo.slice(0, 500),
              lineOrder: idx,
            })),
          },
        },
        select: { id: true, voucherNumber: true },
      });
    });

    return NextResponse.json(
      ok({ id: created.id, voucherNumber: created.voucherNumber }, "Journal voucher created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[JOURNAL VOUCHER CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
