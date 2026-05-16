import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  billedBy: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  statusLabel: string;
  itemsCount: number;
  total: string;
  currency: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type InvoiceKpis = {
  totalInvoices: number;
  drafts: number;
  approved: number;
  overdueCount: number;
  approvedValueLkr: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
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

    const where: Prisma.AccountingInvoiceWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { invoiceNumber: { contains: query } },
        { billedBy: { contains: query } },
        { customerRef: { contains: query } },
        { customer: { name: { contains: query } } },
        { customer: { mobile: { contains: query } } },
      ];
    }

    const invoices = await prisma.accountingInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, address: true } },
        store: { select: { id: true, code: true, name: true } },
        lines: { select: { id: true } },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;
    let overdueCount = 0;

    const items: InvoiceListItem[] = invoices.map((inv) => {
      if (inv.status === "DRAFT") drafts += 1;
      if (inv.status === "APPROVED") {
        approved += 1;
        if (inv.currency === "LKR") approvedValueLkr += Number(inv.total);
        const dueDateVal = new Date(inv.dueDate);
        if (dueDateVal < today) overdueCount += 1;
      }
      const cityLine = (inv.customer.address ?? "").split(/\r?\n|,/)[0]?.trim() ?? "";
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        customerCity: cityLine || "—",
        billedBy: inv.billedBy || "—",
        invoiceDate: formatDate(inv.invoiceDate),
        dueDate: formatDate(inv.dueDate),
        status: inv.status,
        statusLabel: STATUS_LABELS[inv.status] ?? inv.status,
        itemsCount: inv.lines.length,
        total: Number(inv.total).toFixed(2),
        currency: inv.currency,
        storeId: inv.storeId,
        storeCode: inv.store.code,
        storeName: inv.store.name,
      };
    });

    const kpis: InvoiceKpis = {
      totalInvoices: invoices.length,
      drafts,
      approved,
      overdueCount,
      approvedValueLkr: approvedValueLkr.toFixed(2),
    };

    return NextResponse.json(ok({ items, kpis }, "Invoices fetched."), { status: 200 });
  } catch (err) {
    console.error("[INV LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

type CreateInvoiceLine = {
  productId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount?: string; // per-line discount; sums to header discount
  uomName: string;
  uomBase: string;
  uomMinQty: string;
  lineOrder: number;
  // Optional. Set only for serial-tracked inventory items — references
  // the specific serial being sold. When present, qty is forced to 1
  // (one serial = one unit). Soft-locks the serial until invoice is
  // CANCELLED or the line is removed (FK is SET NULL on delete).
  productSerialId?: string | null;
};

type CreateInvoiceBody = {
  invoiceNumber: string;
  customerId: string;
  storeId?: string;
  invoiceDate: string;
  dueDate: string;
  customerRef: string;
  billedBy: string;
  currency: string;
  notes: string;
  terms: string;
  discount?: string; // legacy header discount — ignored when any line.discount is set
  lines: CreateInvoiceLine[];
};

function decimal(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateInvoiceBody;

    if (!body.invoiceNumber?.trim()) {
      return NextResponse.json(fail("Invoice number is required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.customerId) {
      return NextResponse.json(fail("Customer is required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.invoiceDate || !body.dueDate) {
      return NextResponse.json(fail("Invoice date and due date are required.", "VALIDATION_ERROR"), { status: 422 });
    }
    if (!body.lines?.length) {
      return NextResponse.json(fail("At least one line item is required.", "VALIDATION_ERROR"), { status: 422 });
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(
        fail(storeResolution.message, storeResolution.code),
        { status: storeResolution.status }
      );
    }
    const effectiveStoreId = storeResolution.storeId;

    for (const line of body.lines) {
      const qty = decimal(line.quantity);
      const minQty = Math.max(decimal(line.uomMinQty), 0);
      if (qty <= 0) {
        return NextResponse.json(
          fail(`Line "${line.itemName || line.itemCode}" must have a positive quantity.`, "VALIDATION_ERROR"),
          { status: 422 }
        );
      }
      if (minQty > 0) {
        const ratio = qty / minQty;
        const rounded = Math.round(ratio);
        if (Math.abs(ratio - rounded) > 1e-6 || rounded === 0) {
          return NextResponse.json(
            fail(
              `Line "${line.itemName || line.itemCode}" quantity must be a positive multiple of ${minQty} (UOM minimum).`,
              "VALIDATION_ERROR"
            ),
            { status: 422 }
          );
        }
      }
      // Serial-tracked safety: if a serial is attached, quantity must
      // be exactly 1 (one serial = one unit). If the product is
      // serial-tracked, a serial id is mandatory — the front-end picker
      // enforces this but we double-check server-side.
      if (line.productSerialId && qty !== 1) {
        return NextResponse.json(
          fail(
            `Line "${line.itemName || line.itemCode}" is serial-tracked — quantity must be exactly 1.`,
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
    }

    // Validate every supplied productSerialId actually exists, belongs
    // to the line's product, sits at this branch, and isn't already
    // locked by another invoice / POS bill. Cheap to batch.
    const suppliedSerialIds = body.lines
      .map((l) => l.productSerialId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (suppliedSerialIds.length > 0) {
      const serials = await prisma.accountingGoodsReceiptLineSerial.findMany({
        where: { id: { in: suppliedSerialIds } },
        include: {
          line: {
            select: { productId: true, goodsReceipt: { select: { storeId: true } } },
          },
          posBillProductLines: {
            where: { posBill: { status: { in: ["DRAFT", "COMPLETED"] } } },
            select: { id: true },
          },
          invoiceLines: {
            where: { invoice: { status: { in: ["DRAFT", "APPROVED"] } } },
            select: { id: true },
          },
        },
      });
      const serialById = new Map(serials.map((s) => [s.id, s]));
      for (const line of body.lines) {
        if (!line.productSerialId) continue;
        const s = serialById.get(line.productSerialId);
        if (!s) {
          return NextResponse.json(
            fail(
              `Serial for line "${line.itemName || line.itemCode}" no longer exists.`,
              "SERIAL_NOT_FOUND",
            ),
            { status: 422 },
          );
        }
        if (s.line.productId !== line.productId) {
          return NextResponse.json(
            fail(
              `Serial for line "${line.itemName || line.itemCode}" does not match the product.`,
              "SERIAL_PRODUCT_MISMATCH",
            ),
            { status: 422 },
          );
        }
        if (s.line.goodsReceipt.storeId !== effectiveStoreId) {
          return NextResponse.json(
            fail(
              `Serial for line "${line.itemName || line.itemCode}" is at a different branch.`,
              "SERIAL_WRONG_BRANCH",
            ),
            { status: 422 },
          );
        }
        if (
          s.posBillProductLines.length > 0 ||
          s.invoiceLines.length > 0
        ) {
          return NextResponse.json(
            fail(
              `Serial for line "${line.itemName || line.itemCode}" is already locked by another bill or invoice.`,
              "SERIAL_LOCKED",
            ),
            { status: 409 },
          );
        }
      }
    }

    const existing = await prisma.accountingInvoice.findUnique({
      where: { invoiceNumber: body.invoiceNumber.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        fail(`Invoice number "${body.invoiceNumber}" already exists.`, "DUPLICATE_INV"),
        { status: 409 }
      );
    }

    const customer = await prisma.accountingClient.findUnique({
      where: { id: body.customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json(fail("Customer not found.", "NOT_FOUND"), { status: 404 });
    }

    let subtotal = 0;
    let lineDiscountSum = 0;
    const linesData = body.lines.map((line, idx) => {
      const quantity = decimal(line.quantity);
      const unitPrice = decimal(line.unitPrice);
      const lineDiscount = Math.max(0, decimal(line.discount));
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;
      lineDiscountSum += lineDiscount;
      return {
        productId: line.productId,
        itemCode: line.itemCode?.slice(0, 60) ?? "",
        itemName: line.itemName?.slice(0, 200) ?? "",
        description: line.description?.slice(0, 500) ?? "",
        quantity,
        unitPrice,
        discount: lineDiscount,
        lineTotal,
        uomName: line.uomName ?? "",
        uomBase: line.uomBase ?? "",
        uomMinQty: decimal(line.uomMinQty) || 1,
        lineOrder: line.lineOrder ?? idx,
        productSerialId: line.productSerialId || null,
      };
    });

    // Header discount = sum of line discounts. The legacy body.discount field
    // is honoured only as a fallback when no line carries a discount, so older
    // clients that haven't migrated to per-line entry still post correctly.
    const headerDiscountFallback = Math.max(0, decimal(body.discount));
    const discount =
      lineDiscountSum > 0 ? lineDiscountSum : headerDiscountFallback;
    const total = Math.max(0, subtotal - discount);

    const created = await prisma.accountingInvoice.create({
      data: {
        invoiceNumber: body.invoiceNumber.trim(),
        customerId: body.customerId,
        storeId: effectiveStoreId,
        status: "DRAFT",
        currency: body.currency || "LKR",
        invoiceDate: isoToDate(body.invoiceDate),
        dueDate: isoToDate(body.dueDate),
        customerRef: body.customerRef ?? "",
        billedBy: body.billedBy ?? "",
        notes: body.notes ?? "",
        terms: body.terms ?? "",
        discount,
        subtotal,
        total,
        createdById: currentUser.id,
        lines: { create: linesData },
      },
      select: { id: true, invoiceNumber: true },
    });

    // Increment INV form-id next number.
    const current = await prisma.accountingFormIdConfig.findUnique({
      where: { formType: "INV" },
      select: { nextNumber: true },
    });
    const baseNext = current?.nextNumber ?? "0001";
    const nextValue = String(Number(baseNext) + 1).padStart(Math.max(4, baseNext.length), "0");
    await prisma.accountingFormIdConfig.upsert({
      where: { formType: "INV" },
      update: { nextNumber: nextValue },
      create: {
        formType: "INV",
        code: "INV",
        yearToken: "2026",
        rangeFrom: "0001",
        rangeTo: "9999",
        nextNumber: nextValue,
      },
    });

    return NextResponse.json(
      ok({ id: created.id, invoiceNumber: created.invoiceNumber }, "Invoice created."),
      { status: 201 }
    );
  } catch (err) {
    console.error("[INV CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
