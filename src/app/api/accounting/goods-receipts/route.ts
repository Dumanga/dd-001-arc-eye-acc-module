import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GrnListItem = {
  id: string;
  grnNumber: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string;
  openingBalanceMode: boolean;
  openingEquityAccountCode: string | null;
  openingEquityAccountName: string | null;
  receiptDate: string;
  dueDate: string;
  receivedBy: string;
  itemsCount: number;
  status: string;
  statusLabel: string;
  variance: string;
  receiptValue: string;
  currency: string;
  notes: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type GrnKpis = {
  totalGrns: number;
  awaitingApproval: number;
  approved: number;
  varianceFlagged: number;
  approvedValueLkr: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const VALID_CONDITIONS = ["GOOD", "DAMAGED", "SHORT", "EXCESS"] as const;
type ConditionValue = (typeof VALID_CONDITIONS)[number];
function isCondition(value: unknown): value is ConditionValue {
  return typeof value === "string" && (VALID_CONDITIONS as readonly string[]).includes(value);
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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

    const where: Prisma.AccountingGoodsReceiptWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { grnNumber: { contains: query } },
        { receivedBy: { contains: query } },
        { deliveryNoteRef: { contains: query } },
        { supplier: { name: { contains: query } } },
        { purchaseOrder: { poNumber: { contains: query } } },
      ];
    }

    const grns = await prisma.accountingGoodsReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true } },
        store: { select: { id: true, code: true, name: true } },
        purchaseOrder: { select: { poNumber: true, expectedDate: true } },
        openingEquityAccount: { select: { code: true, name: true } },
        lines: {
          select: { receivedQty: true, orderedQty: true, unitPrice: true, discount: true },
        },
      },
    });

    let approvedValueLkr = 0;
    let awaitingApproval = 0;
    let approved = 0;
    let varianceFlagged = 0;

    const items: GrnListItem[] = grns.map((g) => {
      const lineTotal = g.lines.reduce(
        (sum, l) =>
          sum +
          Math.max(
            0,
            Number(l.receivedQty) * Number(l.unitPrice) - Number(l.discount ?? 0)
          ),
        0
      );
      const totalOrdered = g.lines.reduce((sum, l) => sum + Number(l.orderedQty), 0);
      const totalReceived = g.lines.reduce((sum, l) => sum + Number(l.receivedQty), 0);
      const variance = totalOrdered ? totalReceived - totalOrdered : 0;
      const hasVariance = totalOrdered > 0 && variance !== 0;

      if (g.status === "DRAFT") awaitingApproval += 1;
      if (g.status === "APPROVED") {
        approved += 1;
        if (g.currency === "LKR") approvedValueLkr += lineTotal;
      }
      if (hasVariance) varianceFlagged += 1;

      return {
        id: g.id,
        grnNumber: g.grnNumber,
        poNumber: g.purchaseOrder?.poNumber ?? "—",
        supplierId: g.supplierId,
        supplierName: g.supplier?.name ?? (g.openingBalanceMode ? "Opening Balance" : "—"),
        openingBalanceMode: g.openingBalanceMode,
        openingEquityAccountCode: g.openingEquityAccount?.code ?? null,
        openingEquityAccountName: g.openingEquityAccount?.name ?? null,
        receiptDate: formatDate(g.receiptDate),
        dueDate: g.purchaseOrder?.expectedDate ? formatDate(g.purchaseOrder.expectedDate) : formatDate(g.receiptDate),
        receivedBy: g.receivedBy || "—",
        itemsCount: g.lines.length,
        status: g.status,
        statusLabel: STATUS_LABELS[g.status] ?? g.status,
        variance: variance.toString(),
        receiptValue: lineTotal.toFixed(2),
        currency: g.currency,
        notes: g.notes,
        storeId: g.storeId,
        storeCode: g.store.code,
        storeName: g.store.name,
      };
    });

    const kpis: GrnKpis = {
      totalGrns: grns.length,
      awaitingApproval,
      approved,
      varianceFlagged,
      approvedValueLkr: approvedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Goods receipts fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GRN LIST]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}

// ─── POST — create draft GRN ─────────────────────────────────────────────────

type CreateGrnLine = {
  productId: string;
  purchaseOrderLineId?: string | null;
  description: string;
  orderedQty: string;
  receivedQty: string;
  unitPrice: string;
  discount?: string;
  uomName: string;
  uomBase: string;
  condition: string;
  requiresSerial: boolean;
  serials: string[];
  lineOrder: number;
};

type CreateGrnBody = {
  grnNumber: string;
  mode: "withPo" | "withoutPo";
  purchaseOrderId?: string | null;
  supplierId: string | null;
  storeId?: string;

  // Opening Balance GRN (per accounting-theories.md §1.2) — when true the GRN
  // posts inventory DR per line and a single CR to the selected equity account
  // instead of Accounts Payable. supplierId must be null in this mode.
  openingBalanceMode?: boolean;
  openingEquityAccountId?: string | null;

  receiptDate: string;
  receivedBy: string;
  deliveryNoteRef: string;
  vehicleRef: string;
  currency: string;
  notes: string;
  lines: CreateGrnLine[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateGrnBody;

    if (!body.grnNumber?.trim()) {
      return NextResponse.json(
        fail("GRN number is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    const isOpeningBalance = Boolean(body.openingBalanceMode);

    // Opening balance and Linked-PO are mutually exclusive — a PO link implies
    // a real supplier purchase, which is the opposite of an opening balance.
    if (isOpeningBalance && body.mode === "withPo") {
      return NextResponse.json(
        fail("Opening Balance GRNs cannot be linked to a Purchase Order.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    if (isOpeningBalance) {
      if (!body.openingEquityAccountId) {
        return NextResponse.json(
          fail("Equity account is required for an Opening Balance GRN.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
    } else {
      if (!body.supplierId) {
        return NextResponse.json(
          fail("Supplier is required.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    if (!body.lines?.length) {
      return NextResponse.json(
        fail("At least one line item is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    if (body.mode === "withPo" && !body.purchaseOrderId) {
      return NextResponse.json(
        fail("Purchase order is required for linked GRNs.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // Validate every serial-tracked line has serials matching received qty.
    // Lines that received 0 units are exempt — nothing to serialize.
    for (const line of body.lines) {
      if (!line.requiresSerial) continue;
      const target = Math.max(0, Math.floor(Number(line.receivedQty || 0)));
      if (target === 0) continue;
      if ((line.serials?.length ?? 0) !== target) {
        return NextResponse.json(
          fail(
            `Serial-tracked line "${line.description}" must have ${target} serial number${target === 1 ? "" : "s"}.`,
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
    }

    // Opening Balance lines must carry a real cost (per §1.2). Zero-rate lines
    // are rejected here as a backend guard — the form blocks them earlier.
    if (isOpeningBalance) {
      for (const line of body.lines) {
        if (Number(line.unitPrice || 0) <= 0) {
          return NextResponse.json(
            fail(
              `Opening Balance line "${line.description || line.productId}" must have a rate greater than 0.`,
              "VALIDATION_ERROR"
            ),
            { status: 422 }
          );
        }
      }

      // Validate the equity account exists, is active, and is under the EQUITY
      // category. Keeping this server-side ensures the rule holds even if the
      // form is bypassed.
      const equityAcct = await prisma.chartOfAccount.findFirst({
        where: { id: body.openingEquityAccountId!, isActive: true },
        select: { id: true, type: { select: { category: { select: { code: true } } } } },
      });
      if (!equityAcct) {
        return NextResponse.json(
          fail("Selected equity account was not found or is inactive.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (equityAcct.type.category.code !== "EQUITY") {
        return NextResponse.json(
          fail("Selected account must be an Equity account.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
    }

    const existing = await prisma.accountingGoodsReceipt.findUnique({
      where: { grnNumber: body.grnNumber.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        fail(`GRN number "${body.grnNumber}" already exists.`, "DUPLICATE_GRN"),
        { status: 409 }
      );
    }

    // Validate PO ↔ supplier consistency when in withPo mode
    if (body.mode === "withPo" && body.purchaseOrderId) {
      const po = await prisma.accountingPurchaseOrder.findUnique({
        where: { id: body.purchaseOrderId },
        select: { id: true, supplierId: true, status: true },
      });
      if (!po) {
        return NextResponse.json(
          fail("Linked purchase order was not found.", "NOT_FOUND"),
          { status: 404 }
        );
      }
      if (po.supplierId !== body.supplierId) {
        return NextResponse.json(
          fail("Supplier does not match the linked purchase order.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (po.status === "RECEIVED" || po.status === "CANCELLED") {
        return NextResponse.json(
          fail("Linked purchase order is closed and cannot accept further receipts.", "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
    }

    const created = await prisma.accountingGoodsReceipt.create({
      data: {
        grnNumber: body.grnNumber.trim(),
        purchaseOrderId: body.mode === "withPo" ? body.purchaseOrderId ?? null : null,
        supplierId: isOpeningBalance ? null : body.supplierId,
        openingBalanceMode: isOpeningBalance,
        openingEquityAccountId: isOpeningBalance ? body.openingEquityAccountId ?? null : null,
        storeId: effectiveStoreId,
        receiptDate: isoToDate(body.receiptDate),
        receivedBy: body.receivedBy ?? "",
        deliveryNoteRef: body.deliveryNoteRef ?? "",
        vehicleRef: body.vehicleRef ?? "",
        currency: body.currency ?? "LKR",
        notes: body.notes ?? "",
        status: "DRAFT",
        createdById: currentUser.id,
        lines: {
          create: body.lines.map((line, idx) => ({
            productId: line.productId,
            purchaseOrderLineId:
              body.mode === "withPo" ? line.purchaseOrderLineId ?? null : null,
            description: line.description ?? "",
            orderedQty: Number(line.orderedQty || 0),
            receivedQty: Number(line.receivedQty || 0),
            unitPrice: Number(line.unitPrice || 0),
            // Opening Balance lines never carry a discount (§1.2).
            discount: isOpeningBalance ? 0 : Math.max(0, Number(line.discount || 0)),
            uomName: line.uomName ?? "",
            uomBase: line.uomBase ?? "",
            condition: isOpeningBalance
              ? "GOOD"
              : isCondition(line.condition)
                ? line.condition
                : "GOOD",
            requiresSerial: Boolean(line.requiresSerial),
            lineOrder: line.lineOrder ?? idx,
            serials: line.requiresSerial && line.serials?.length
              ? {
                  create: line.serials.map((serial, sIdx) => ({
                    serialNumber: serial.trim(),
                    position: sIdx,
                  })),
                }
              : undefined,
          })),
        },
      },
      select: { id: true, grnNumber: true },
    });

    // Increment GRN form-id next number. The config row may not exist yet
    // for a fresh install — upsert seeds it from defaults on first save.
    const current = await prisma.accountingFormIdConfig.findUnique({
      where: { formType: "GRN" },
      select: { nextNumber: true },
    });
    const baseNext = current?.nextNumber ?? "0001";
    const nextValue = String(Number(baseNext) + 1).padStart(
      Math.max(4, baseNext.length),
      "0"
    );
    await prisma.accountingFormIdConfig.upsert({
      where: { formType: "GRN" },
      update: { nextNumber: nextValue },
      create: {
        formType: "GRN",
        code: "GRN",
        yearToken: "2026",
        rangeFrom: "0001",
        rangeTo: "9999",
        nextNumber: nextValue,
      },
    });

    return NextResponse.json(
      ok(
        { id: created.id, grnNumber: created.grnNumber },
        "Goods receipt created."
      ),
      { status: 201 }
    );
  } catch (err) {
    console.error("[GRN CREATE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
