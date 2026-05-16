import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";
import { prisma } from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PoListItem = {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierCity: string;
  poDate: string;
  expectedDate: string;
  status: string;
  statusLabel: string;
  currency: string;
  lineCount: number;
  total: string;
  totalTax: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type PoKpis = {
  totalOpen: number;
  awaitingAction: number;
  inboundThisWeek: number;
  totalValue: string;
  totalValueCurrency: string;
};

export type PoListLine = {
  id: string;
  productCode: string;
  productName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  lineTotal: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent to supplier",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Fully received",
  CANCELLED: "Cancelled",
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

    const orders = await prisma.accountingPurchaseOrder.findMany({
      where: {
        status: { not: "CANCELLED" },
        ...storeScope.where,
        ...(query
          ? {
              OR: [
                { poNumber: { contains: query } },
                { supplier: { name: { contains: query } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: {
          include: { contactInfo: true },
        },
        store: { select: { id: true, code: true, name: true } },
        lines: true,
      },
    });

    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let totalValueLkr = 0;

    const items: PoListItem[] = orders.map((po) => {
      const subtotal = po.lines.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
        0
      );
      const afterDiscount = Math.max(0, subtotal - Number(po.discount));
      const tax1Amount = Number(po.tax1Amount ?? 0);
      const tax2Amount = Number(po.tax2Amount ?? 0);
      const taxTotal = tax1Amount + tax2Amount;
      const total = afterDiscount + taxTotal;
      if (po.currency === "LKR") totalValueLkr += total;

      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        supplierCity: po.supplier.contactInfo?.city ?? "—",
        poDate: formatDate(po.poDate),
        expectedDate: formatDate(po.expectedDate),
        status: po.status,
        statusLabel: STATUS_LABELS[po.status] ?? po.status,
        currency: po.currency,
        lineCount: po.lines.length,
        total: total.toFixed(2),
        totalTax: taxTotal.toFixed(2),
        storeId: po.storeId,
        storeCode: po.store.code,
        storeName: po.store.name,
      };
    });

    const awaiting = orders.filter((o) =>
      ["DRAFT", "SENT"].includes(o.status)
    ).length;

    const inbound = orders.filter((o) => {
      const exp = o.expectedDate;
      return o.status === "SENT" && exp >= now && exp <= weekEnd;
    }).length;

    const kpis: PoKpis = {
      totalOpen: orders.length,
      awaitingAction: awaiting,
      inboundThisWeek: inbound,
      totalValue: totalValueLkr.toFixed(2),
      totalValueCurrency: "LKR",
    };

    return NextResponse.json(ok({ items, kpis }, "Purchase orders fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[PO LIST]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}

// ─── POST — create PO ────────────────────────────────────────────────────────

type CreatePoBody = {
  poNumber: string;
  supplierId: string;
  storeId?: string; // Required for SUPER_ADMIN; ignored for branch users.
  supplierRef: string;
  buyerCode: string;
  poDate: string; // YYYY-MM-DD
  expectedDate: string; // YYYY-MM-DD
  currency: string;
  discount: string;
  notes: string;
  terms: string;
  lines: Array<{
    productId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    uomName: string;
    uomBase: string;
    lineOrder: number;
  }>;
};

type SupplierTaxSnapshot = {
  code: string;
  name: string;
  rate: number;
  method: string;
};

function snapshotSupplierTaxes(
  supplierTaxLinks: Array<{
    taxCode: {
      code: string;
      name: string;
      rate: { toString(): string };
      calculation: string;
      taxType: string;
      isActive: boolean;
    };
  }>
): SupplierTaxSnapshot[] {
  return supplierTaxLinks
    .filter(
      (link) =>
        link.taxCode.isActive &&
        (link.taxCode.taxType === "PURCHASE" || link.taxCode.taxType === "BOTH")
    )
    .slice(0, 2)
    .map((link) => ({
      code: link.taxCode.code,
      name: link.taxCode.name,
      rate: Number(link.taxCode.rate),
      method: link.taxCode.calculation,
    }));
}

function applyTax(base: number, tax: SupplierTaxSnapshot | null) {
  if (!tax) return 0;
  if (tax.method === "PERCENTAGE") return (base * tax.rate) / 100;
  return tax.rate;
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body: CreatePoBody = await request.json();

    if (!body.supplierId) {
      return NextResponse.json(
        fail("Supplier is required.", "VALIDATION_ERROR"),
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

    if (!body.lines?.length) {
      return NextResponse.json(
        fail("At least one line item is required.", "VALIDATION_ERROR"),
        { status: 422 }
      );
    }

    // PO number is server-assigned from the form-id sequence inside the
    // create transaction (see below). User input is ignored to keep the
    // sequence authoritative.

    // Fetch supplier with their tax codes (for snapshot on PO header)
    const supplier = await prisma.accountingSupplier.findUnique({
      where: { id: body.supplierId },
      include: {
        taxCodes: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          include: {
            taxCode: {
              select: {
                code: true,
                name: true,
                rate: true,
                calculation: true,
                taxType: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!supplier) {
      return NextResponse.json(
        fail("Selected supplier was not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    const supplierTaxes = snapshotSupplierTaxes(supplier.taxCodes);
    const tax1 = supplierTaxes[0] ?? null;
    const tax2 = supplierTaxes[1] ?? null;

    // Compute line subtotal at save time so we can snapshot tax amounts.
    const lineSubtotal = body.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0
    );
    const discountValue = Number(body.discount ?? 0);
    const afterDiscount = Math.max(0, lineSubtotal - discountValue);
    const tax1Amount = applyTax(afterDiscount, tax1);
    const tax2Amount = applyTax(afterDiscount + tax1Amount, tax2);

    const po = await prisma.$transaction(async (tx) => {
      const { formId: poNumber } = await consumeFormIdInTx(tx, "PO");
      return tx.accountingPurchaseOrder.create({
      data: {
        poNumber,
        supplierId: body.supplierId,
        storeId: effectiveStoreId,
        supplierRef: body.supplierRef ?? "",
        buyerCode: body.buyerCode ?? "",
        poDate: isoToDate(body.poDate),
        expectedDate: isoToDate(body.expectedDate),
        currency: body.currency ?? "LKR",
        discount: discountValue,
        tax1Code: tax1?.code ?? null,
        tax1Name: tax1?.name ?? null,
        tax1Rate: tax1 ? tax1.rate : null,
        tax1Method: tax1?.method ?? null,
        tax1Amount: tax1Amount,
        tax2Code: tax2?.code ?? null,
        tax2Name: tax2?.name ?? null,
        tax2Rate: tax2 ? tax2.rate : null,
        tax2Method: tax2?.method ?? null,
        tax2Amount: tax2Amount,
        notes: body.notes ?? "",
        terms: body.terms ?? "",
        status: "DRAFT",
        createdById: currentUser.id,
        lines: {
          create: body.lines.map((l, idx) => ({
            productId: l.productId,
            description: l.description ?? "",
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            uomName: l.uomName ?? "",
            uomBase: l.uomBase ?? "",
            lineOrder: l.lineOrder ?? idx,
          })),
        },
      },
      select: { id: true, poNumber: true },
    });
    });

    return NextResponse.json(
      ok({ id: po.id, poNumber: po.poNumber }, "Purchase order created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[PO CREATE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
