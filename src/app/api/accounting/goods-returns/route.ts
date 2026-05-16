import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { prisma } from "@/lib/db";
import type { AccountingGoodsReturnReason, Prisma } from "@prisma/client";

export type GoodsReturnListItem = {
  id: string;
  returnNumber: string;
  goodsReceiptId: string;
  linkedGrnNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  returnDate: string;
  itemsCount: number;
  status: string;
  statusLabel: string;
  currency: string;
  totalQty: string;
  totalValue: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type GoodsReturnKpis = {
  totalReturns: number;
  drafts: number;
  approved: number;
  approvedValueLkr: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const VALID_REASONS: AccountingGoodsReturnReason[] = [
  "DAMAGED",
  "WRONG_ITEM",
  "EXPIRED",
  "EXCESS",
  "OTHER",
];

function isReason(value: unknown): value is AccountingGoodsReturnReason {
  return (
    typeof value === "string" &&
    (VALID_REASONS as string[]).includes(value)
  );
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

// ─── GET — list + KPIs ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedStoreId = searchParams.get("storeId");

    const storeScope = getListStoreFilter(currentUser, requestedStoreId);
    if (!storeScope.ok) {
      return NextResponse.json(
        fail(storeScope.message, storeScope.code),
        { status: storeScope.status }
      );
    }

    const where: Prisma.AccountingGoodsReturnWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { returnNumber: { contains: query } },
        { reasonHeader: { contains: query } },
        { supplier: { name: { contains: query } } },
        { supplier: { code: { contains: query } } },
        { goodsReceipt: { grnNumber: { contains: query } } },
      ];
    }

    const returns = await prisma.accountingGoodsReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { code: true, name: true } },
        store: { select: { id: true, code: true, name: true } },
        goodsReceipt: { select: { grnNumber: true } },
        _count: { select: { lines: true } },
      },
    });

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;

    const items: GoodsReturnListItem[] = returns.map((r) => {
      const totalValue = Number(r.totalValue);
      if (r.status === "DRAFT") drafts += 1;
      if (r.status === "APPROVED") {
        approved += 1;
        if (r.currency === "LKR") approvedValueLkr += totalValue;
      }
      return {
        id: r.id,
        returnNumber: r.returnNumber,
        goodsReceiptId: r.goodsReceiptId,
        linkedGrnNumber: r.goodsReceipt.grnNumber,
        supplierId: r.supplierId,
        supplierCode: r.supplier.code,
        supplierName: r.supplier.name,
        returnDate: formatDate(r.returnDate),
        itemsCount: r._count.lines,
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        totalQty: Number(r.totalQty).toString(),
        totalValue: formatNumber(totalValue),
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
      };
    });

    const kpis: GoodsReturnKpis = {
      totalReturns: returns.length,
      drafts,
      approved,
      approvedValueLkr: formatNumber(approvedValueLkr),
    };

    return NextResponse.json(ok({ items, kpis }, "Goods returns fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GOODS RETURN LIST]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}

// ─── POST — create draft goods return ────────────────────────────────────────

type CreateLine = {
  goodsReceiptLineId: string;
  productId: string;
  description: string;
  receivedQty: string;
  returnQty: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  reason: string;
  lineOrder: number;
};

type CreateBody = {
  returnNumber: string;
  goodsReceiptId: string;
  storeId?: string;
  returnDate: string;
  returnedBy: string;
  reasonHeader: string;
  notes: string;
  lines: CreateLine[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateBody;

    // returnNumber is server-assigned from the form-id sequence.
    if (!body.goodsReceiptId) {
      return NextResponse.json(
        fail("Linked GRN is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }
    if (!body.lines?.length) {
      return NextResponse.json(
        fail("At least one return line is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    // The linked GRN must exist and be APPROVED. Drafts and cancelled GRNs
    // have no accounting impact and therefore can't be returned against.
    const grn = await prisma.accountingGoodsReceipt.findUnique({
      where: { id: body.goodsReceiptId },
      select: {
        id: true,
        status: true,
        currency: true,
        supplierId: true,
        openingBalanceMode: true,
        lines: {
          select: {
            id: true,
            productId: true,
            receivedQty: true,
            returnLines: {
              where: { goodsReturn: { status: "APPROVED" } },
              select: { returnQty: true },
            },
          },
        },
      },
    });
    if (!grn) {
      return NextResponse.json(fail("Linked GRN was not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (grn.status !== "APPROVED") {
      return NextResponse.json(
        fail("Returns can only be issued against approved GRNs.", "INVALID_STATE"),
        { status: 422 }
      );
    }
    if (grn.openingBalanceMode || !grn.supplierId) {
      // Opening Balance GRNs (§1.2) have no supplier — there is nowhere to
      // return the goods to. Guard against the picker being bypassed.
      return NextResponse.json(
        fail(
          "Goods returns cannot be issued against an Opening Balance GRN.",
          "INVALID_STATE"
        ),
        { status: 422 }
      );
    }

    // Build a per-line lookup so we can validate qty caps + take snapshot fields
    // safely from the source GRN line.
    const grnLineById = new Map(grn.lines.map((line) => [line.id, line]));

    let totalQty = 0;
    let totalValue = 0;
    for (const line of body.lines) {
      const grnLine = grnLineById.get(line.goodsReceiptLineId);
      if (!grnLine) {
        return NextResponse.json(
          fail("A return line references a GRN line that does not belong to the linked GRN.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (grnLine.productId !== line.productId) {
        return NextResponse.json(
          fail("Return line product does not match the source GRN line.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      const received = Number(grnLine.receivedQty);
      const alreadyReturned = grnLine.returnLines.reduce(
        (sum, rl) => sum + Number(rl.returnQty),
        0
      );
      const remaining = Math.max(0, received - alreadyReturned);
      const requested = Number(line.returnQty || 0);
      if (!Number.isFinite(requested) || requested < 0) {
        return NextResponse.json(
          fail("Return qty must be a non-negative number.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (requested > remaining + 1e-9) {
        return NextResponse.json(
          fail(
            `Return qty (${requested}) exceeds remaining returnable qty (${remaining}) on a line.`,
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
      if (!isReason(line.reason)) {
        return NextResponse.json(
          fail("Invalid reason on a return line.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      const unitPrice = Number(line.unitPrice || 0);
      totalQty += requested;
      totalValue += requested * unitPrice;
    }

    if (totalQty <= 0) {
      return NextResponse.json(
        fail("Total return qty must be greater than zero.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    const grnSupplierId = grn.supplierId!;
    const created = await prisma.$transaction(async (tx) => {
      const { formId: returnNumber } = await consumeFormIdInTx(tx, "GRR");
      return tx.accountingGoodsReturn.create({
      data: {
        returnNumber,
        goodsReceiptId: grn.id,
        supplierId: grnSupplierId,
        storeId: effectiveStoreId,
        returnDate: isoToDate(body.returnDate),
        returnedBy: body.returnedBy?.trim() ?? "",
        reasonHeader: body.reasonHeader?.trim() ?? "",
        currency: grn.currency,
        notes: body.notes ?? "",
        totalQty,
        totalValue,
        status: "DRAFT",
        createdById: currentUser.id,
        lines: {
          create: body.lines.map((line, idx) => {
            const grnLine = grnLineById.get(line.goodsReceiptLineId)!;
            return {
              goodsReceiptLineId: line.goodsReceiptLineId,
              productId: line.productId,
              description: line.description ?? "",
              receivedQty: Number(grnLine.receivedQty),
              returnQty: Number(line.returnQty || 0),
              unitPrice: Number(line.unitPrice || 0),
              uomName: line.uomName ?? "",
              uomBase: line.uomBase ?? "",
              reason: line.reason as AccountingGoodsReturnReason,
              lineOrder: line.lineOrder ?? idx,
            };
          }),
        },
      },
      select: { id: true, returnNumber: true },
    });
    });

    return NextResponse.json(
      ok(
        { id: created.id, returnNumber: created.returnNumber },
        "Goods return created."
      ),
      { status: 201 }
    );
  } catch (err) {
    console.error("[GOODS RETURN CREATE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
