// /api/accounting/material-issues
//
// GET  — list material issue notes + KPIs.
// POST — create a DRAFT material issue note per accounting-theories.md §10.
//        Burns the next MIN form-id atomically. Validates: ≥1 line, qty > 0
//        per line, expense account is in EXPENSES category, every line is an
//        active INVENTORY_ITEM with stock available at the branch.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { getDraftReservedQtyByProduct } from "@/lib/accounting/pos-bill";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export type MaterialIssueListItem = {
  id: string;
  issueNumber: string;
  issueDate: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  lineCount: number;
  total: string;
  status: string;
  statusLabel: string;
  currency: string;
  requestedBy: string;
  purpose: string;
  notes: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  createdByName: string;
  approvedAt: string | null;
};

export type MaterialIssueKpis = {
  totalIssues: number;
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
    const auth = await authorizeAccountingAnyAccess(["inventory", "accounts"]);
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

    const where: Prisma.AccountingMaterialIssueWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { issueNumber: { contains: query } },
        { requestedBy: { contains: query } },
        { purpose: { contains: query } },
        { notes: { contains: query } },
        { expenseAccount: { OR: [{ code: { contains: query } }, { name: { contains: query } }] } },
      ];
    }

    const rows = await prisma.accountingMaterialIssue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        expenseAccount: { select: { code: true, name: true } },
        store: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        _count: { select: { lines: true } },
      },
    });

    let approvedValueLkr = 0;
    let draftCount = 0;
    let approvedCount = 0;

    const items: MaterialIssueListItem[] = rows.map((r) => {
      if (r.status === "DRAFT") draftCount += 1;
      if (r.status === "APPROVED") {
        approvedCount += 1;
        if (r.currency === "LKR") approvedValueLkr += Number(r.total);
      }
      return {
        id: r.id,
        issueNumber: r.issueNumber,
        issueDate: formatDate(r.issueDate),
        expenseAccountCode: r.expenseAccount.code,
        expenseAccountName: r.expenseAccount.name,
        lineCount: r._count.lines,
        total: Number(r.total).toFixed(2),
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        requestedBy: r.requestedBy,
        purpose: r.purpose,
        notes: r.notes,
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
        createdByName: r.createdBy.displayName,
        approvedAt: r.approvedAt?.toISOString() ?? null,
      };
    });

    const kpis: MaterialIssueKpis = {
      totalIssues: rows.length,
      draftCount,
      approvedCount,
      approvedValueLkr: approvedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Material issues fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[MATERIAL ISSUE LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POST — create draft material issue ──────────────────────────────────────

type CreateMaterialIssueLineBody = {
  productId: string;
  quantity: string;
  notes?: string;
};

type CreateMaterialIssueBody = {
  storeId?: string;
  issueDate: string;
  expenseAccountId: string;
  currency?: string;
  requestedBy: string;
  purpose: string;
  notes?: string;
  lines: CreateMaterialIssueLineBody[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "accounts"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateMaterialIssueBody;

    // ── Header validations ───────────────────────────────────────────
    if (!body.issueDate || typeof body.issueDate !== "string") {
      return NextResponse.json(
        fail("Issue date is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!body.expenseAccountId) {
      return NextResponse.json(
        fail("Expense account is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    const requestedBy = (body.requestedBy ?? "").trim();
    if (!requestedBy) {
      return NextResponse.json(
        fail("Requested by is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    const purpose = (body.purpose ?? "").trim();
    if (!purpose) {
      return NextResponse.json(
        fail("Purpose is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        fail("At least one line is required.", "VALIDATION_ERROR"),
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

    // ── Expense account must be under EXPENSES category ──────────────
    const expenseAcc = await prisma.chartOfAccount.findFirst({
      where: { id: body.expenseAccountId, isActive: true },
      select: {
        id: true,
        type: { select: { category: { select: { code: true } } } },
      },
    });
    if (!expenseAcc) {
      return NextResponse.json(
        fail("Expense account not found or inactive.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (expenseAcc.type.category.code !== "EXPENSES") {
      return NextResponse.json(
        fail("Selected account must be an Expense account.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // ── Line-level validations (each line: positive qty + valid product) ──
    const normalizedLines: { productId: string; quantity: number; notes: string }[] = [];
    for (let i = 0; i < body.lines.length; i++) {
      const line = body.lines[i];
      const qty = Number(line.quantity);
      if (!line.productId) {
        return NextResponse.json(
          fail(`Line ${i + 1}: product is required.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          fail(`Line ${i + 1}: quantity must be greater than 0.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      normalizedLines.push({
        productId: line.productId,
        quantity: qty,
        notes: (line.notes ?? "").trim().slice(0, 500),
      });
    }

    // Sum requested qty per product (handles repeated lines for the same product).
    const requestedByProduct = new Map<string, number>();
    for (const l of normalizedLines) {
      requestedByProduct.set(
        l.productId,
        (requestedByProduct.get(l.productId) ?? 0) + l.quantity
      );
    }
    const productIds = Array.from(requestedByProduct.keys());

    // ── Load products + branch stock + already-reserved-in-DRAFT-POS ──
    const products = await prisma.accountingProduct.findMany({
      where: { id: { in: productIds }, status: "ACTIVE" },
      select: {
        id: true,
        code: true,
        purchaseName: true,
        salesName: true,
        itemType: true,
        uomCategory: { select: { baseUnitName: true } },
        branchStock: { where: { storeId: effectiveStoreId }, select: { qtyOnHand: true } },
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    if (productById.size !== productIds.length) {
      return NextResponse.json(
        fail("One or more products are not found or inactive.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // Each product must be an INVENTORY_ITEM (services/vouchers have no stock).
    for (const p of products) {
      if (p.itemType !== "INVENTORY_ITEM") {
        return NextResponse.json(
          fail(
            `Product "${p.code}" is not an inventory item — only inventory items can be issued.`,
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
    }

    // ── Stock availability check (subtract POS DRAFT reservations) ──
    const posReserved = await getDraftReservedQtyByProduct(prisma, effectiveStoreId, productIds);
    for (const [pid, requestedQty] of requestedByProduct) {
      const p = productById.get(pid)!;
      const onHand = Number(p.branchStock[0]?.qtyOnHand ?? 0);
      const reserved = posReserved.get(pid) ?? 0;
      const available = onHand - reserved;
      if (requestedQty > available + 1e-9) {
        return NextResponse.json(
          fail(
            `Insufficient stock for "${p.code}" at this branch: requested ${requestedQty}, available ${available.toFixed(2)}.`,
            "INSUFFICIENT_STOCK"
          ),
          { status: 409 }
        );
      }
    }

    // ── Create draft inside a tx so the form-id burn is atomic ──────
    const created = await prisma.$transaction(async (tx) => {
      const { formId } = await consumeFormIdInTx(tx, "MIN");

      return tx.accountingMaterialIssue.create({
        data: {
          issueNumber: formId,
          storeId: effectiveStoreId,
          expenseAccountId: body.expenseAccountId,
          issueDate: isoToDate(body.issueDate),
          currency: (body.currency ?? "LKR").toUpperCase().slice(0, 10) || "LKR",
          requestedBy: requestedBy.slice(0, 150),
          purpose: purpose.slice(0, 500),
          // Total is set at posting time once we know the WAC for every line.
          total: new Prisma.Decimal(0),
          notes: (body.notes ?? "").trim(),
          status: "DRAFT",
          createdById: currentUser.id,
          lines: {
            create: normalizedLines.map((l, idx) => {
              const p = productById.get(l.productId)!;
              return {
                productId: l.productId,
                itemCode: p.code,
                itemName: p.salesName ?? p.purchaseName ?? p.code,
                description: p.purchaseName ?? p.salesName ?? "",
                quantity: new Prisma.Decimal(l.quantity.toFixed(4)),
                // unitCost + lineValue snapshots filled at approve time.
                unitCost: new Prisma.Decimal(0),
                lineValue: new Prisma.Decimal(0),
                uomName: p.uomCategory?.baseUnitName ?? "",
                uomBase: p.uomCategory?.baseUnitName ?? "",
                notes: l.notes,
                lineOrder: idx,
              };
            }),
          },
        },
        select: { id: true, issueNumber: true },
      });
    });

    return NextResponse.json(
      ok({ id: created.id, issueNumber: created.issueNumber }, "Material issue created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[MATERIAL ISSUE CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
