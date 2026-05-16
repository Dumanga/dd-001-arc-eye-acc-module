import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";
import type { AccountingGoodsReturnReason, AccountingUser, Prisma } from "@prisma/client";

export type CustomerReturnListItem = {
  id: string;
  returnNumber: string;
  // Source discriminator + refs. For INVOICE returns invoiceId/Number
  // are populated; for POS_BILL returns posBillId/billNo are.
  sourceType: "INVOICE" | "POS_BILL";
  invoiceId: string;
  invoiceNumber: string;
  posBillId: string;
  posBillNo: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  returnDate: string;
  reasonHeader: string;
  itemsCount: number;
  status: string;
  statusLabel: string;
  currency: string;
  totalQty: string;
  totalGross: string;
  totalDiscount: string;
  totalNet: string;
  storeId: string;
  storeCode: string;
  storeName: string;
};

export type CustomerReturnKpis = {
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
  return typeof value === "string" && VALID_REASONS.includes(value as AccountingGoodsReturnReason);
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
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedStoreId = searchParams.get("storeId");

    const storeScope = getListStoreFilter(currentUser, requestedStoreId);
    if (!storeScope.ok) {
      return NextResponse.json(fail(storeScope.message, storeScope.code), {
        status: storeScope.status,
      });
    }

    const where: Prisma.AccountingCustomerReturnWhereInput = {
      status: { not: "CANCELLED" },
      ...storeScope.where,
    };
    if (query) {
      where.OR = [
        { returnNumber: { contains: query } },
        { reasonHeader: { contains: query } },
        { customer: { name: { contains: query } } },
        { invoice: { invoiceNumber: { contains: query } } },
      ];
    }

    const returns = await prisma.accountingCustomerReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        invoice: { select: { invoiceNumber: true } },
        sourcePosBill: { select: { id: true, billNo: true } },
        customer: { select: { name: true, address: true } },
        store: { select: { id: true, code: true, name: true } },
        lines: { select: { id: true } },
      },
    });

    let approvedValueLkr = 0;
    let drafts = 0;
    let approved = 0;

    const items: CustomerReturnListItem[] = returns.map((r) => {
      const totalNet = Number(r.totalNet);
      if (r.status === "DRAFT") drafts += 1;
      if (r.status === "APPROVED") {
        approved += 1;
        if (r.currency === "LKR") approvedValueLkr += totalNet;
      }
      return {
        id: r.id,
        returnNumber: r.returnNumber,
        sourceType: r.sourceType,
        invoiceId: r.invoiceId ?? "",
        invoiceNumber: r.invoice?.invoiceNumber ?? "",
        posBillId: r.sourcePosBillId ?? "",
        posBillNo: r.sourcePosBill?.billNo ?? "",
        customerId: r.customerId,
        customerName: r.customer.name,
        customerCity: r.customer.address?.split(",")?.pop()?.trim() || "",
        returnDate: formatDate(r.returnDate),
        reasonHeader: r.reasonHeader,
        itemsCount: r.lines.length,
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        currency: r.currency,
        totalQty: Number(r.totalQty).toString(),
        totalGross: formatNumber(Number(r.totalGross)),
        totalDiscount: formatNumber(Number(r.totalDiscount)),
        totalNet: formatNumber(totalNet),
        storeId: r.storeId,
        storeCode: r.store.code,
        storeName: r.store.name,
      };
    });

    const kpis: CustomerReturnKpis = {
      totalReturns: returns.length,
      drafts,
      approved,
      approvedValueLkr: formatNumber(approvedValueLkr),
    };

    return NextResponse.json(ok({ items, kpis }, "Customer returns fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[CR LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POST — create draft return ──────────────────────────────────────────────

type CreateReturnLine = {
  // For sourceType=INVOICE:
  invoiceLineId?: string;
  // For sourceType=POS_BILL:
  sourcePosBillLineId?: string;
  returnQty: string;
  reason: string;
  notes?: string;
  lineOrder: number;
};

type CreateReturnBody = {
  returnNumber: string;
  // sourceType defaults to INVOICE for backwards compatibility.
  sourceType?: "INVOICE" | "POS_BILL";
  // For sourceType=INVOICE:
  invoiceId?: string;
  // For sourceType=POS_BILL:
  sourcePosBillId?: string;
  storeId?: string;
  returnDate: string;
  returnedBy: string;
  reasonHeader: string;
  notes: string;
  lines: CreateReturnLine[];
};

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json()) as CreateReturnBody;

    if (!body.returnNumber?.trim()) {
      return NextResponse.json(
        fail("Return number is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    const sourceType = body.sourceType ?? "INVOICE";
    if (sourceType !== "INVOICE" && sourceType !== "POS_BILL") {
      return NextResponse.json(
        fail("Invalid sourceType.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    if (sourceType === "INVOICE" && !body.invoiceId) {
      return NextResponse.json(
        fail("Source invoice is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    if (sourceType === "POS_BILL" && !body.sourcePosBillId) {
      return NextResponse.json(
        fail("Source POS bill is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    if (!body.lines?.length) {
      return NextResponse.json(
        fail("At least one return line is required.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }

    // Branch on sourceType. POS_BILL flow runs in a separate helper so
    // the existing INVOICE path stays unchanged.
    if (sourceType === "POS_BILL") {
      return await createReturnFromPosBill(body, currentUser);
    }

    // Load source invoice + lines + paid total + already-returned per line.
    const invoice = await prisma.accountingInvoice.findUnique({
      where: { id: body.invoiceId },
      include: {
        lines: {
          select: {
            id: true,
            productId: true,
            itemCode: true,
            itemName: true,
            description: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            uomName: true,
            uomBase: true,
            uomMinQty: true,
          },
        },
        paymentAllocations: {
          where: { receipt: { status: "APPROVED" } },
          select: { receivableAmount: true },
        },
        customerReturns: {
          where: { status: "APPROVED" },
          select: {
            totalNet: true,
            lines: { select: { invoiceLineId: true, returnQty: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(fail("Invoice not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (invoice.status !== "APPROVED") {
      return NextResponse.json(
        fail("Source invoice must be approved before raising a return.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }

    const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
    if (!storeResolution.ok) {
      return NextResponse.json(fail(storeResolution.message, storeResolution.code), {
        status: storeResolution.status,
      });
    }
    const effectiveStoreId = storeResolution.storeId;

    // Per-line cap: returnQty must not exceed remaining returnable qty on the
    // source invoice line (originalQty − sum of approved CR returnQty on this
    // invoice line).
    const returnedByLineId = new Map<string, number>();
    for (const cr of invoice.customerReturns) {
      for (const line of cr.lines) {
        if (!line.invoiceLineId) continue;
        returnedByLineId.set(
          line.invoiceLineId,
          (returnedByLineId.get(line.invoiceLineId) ?? 0) + Number(line.returnQty),
        );
      }
    }

    const invoiceLineMap = new Map(invoice.lines.map((l) => [l.id, l]));

    let totalQty = 0;
    let totalGross = 0;
    let totalDiscount = 0;
    const linesData: Array<{
      invoiceLineId: string;
      productId: string;
      itemCode: string;
      itemName: string;
      description: string;
      uomName: string;
      uomBase: string;
      uomMinQty: number;
      originalQty: number;
      unitPrice: number;
      returnQty: number;
      lineGross: number;
      lineDiscount: number;
      lineNet: number;
      reason: AccountingGoodsReturnReason;
      notes: string;
      lineOrder: number;
    }> = [];

    for (const [idx, line] of body.lines.entries()) {
      if (!line.invoiceLineId) {
        return NextResponse.json(
          fail("INVOICE return lines need invoiceLineId.", "VALIDATION_ERROR"),
          { status: 422 },
        );
      }
      const inv = invoiceLineMap.get(line.invoiceLineId);
      if (!inv) {
        return NextResponse.json(
          fail("A return line references a missing invoice line.", "VALIDATION_ERROR"),
          { status: 422 },
        );
      }
      const returnQty = Number(line.returnQty);
      if (!Number.isFinite(returnQty) || returnQty <= 0) {
        return NextResponse.json(
          fail(
            `Return quantity must be greater than zero for ${inv.itemCode}.`,
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
      const originalQty = Number(inv.quantity);
      const alreadyReturned = returnedByLineId.get(inv.id) ?? 0;
      const remainingLineQty = Math.max(0, originalQty - alreadyReturned);
      if (returnQty > remainingLineQty + 1e-9) {
        return NextResponse.json(
          fail(
            `Return quantity ${returnQty} for ${inv.itemCode} exceeds remaining returnable qty ${remainingLineQty} (original ${originalQty} − already returned ${alreadyReturned}).`,
            "VALIDATION_ERROR",
          ),
          { status: 422 },
        );
      }
      if (!isReason(line.reason)) {
        return NextResponse.json(
          fail(`Invalid reason for line ${inv.itemCode}.`, "VALIDATION_ERROR"),
          { status: 422 },
        );
      }

      const unitPrice = Number(inv.unitPrice);
      const invDiscount = Number(inv.discount);
      const lineGross = returnQty * unitPrice;
      // Auto-apportion the source invoice line's discount proportionally to
      // returnQty / originalQty. With line-level discount this mapping is
      // natural — no header-level proportional math.
      const lineDiscount = originalQty > 0 ? invDiscount * (returnQty / originalQty) : 0;
      const lineNet = Math.max(0, lineGross - lineDiscount);

      totalQty += returnQty;
      totalGross += lineGross;
      totalDiscount += lineDiscount;

      linesData.push({
        invoiceLineId: inv.id,
        productId: inv.productId,
        itemCode: inv.itemCode,
        itemName: inv.itemName,
        description: inv.description,
        uomName: inv.uomName,
        uomBase: inv.uomBase,
        uomMinQty: Number(inv.uomMinQty) || 1,
        originalQty,
        unitPrice,
        returnQty,
        lineGross,
        lineDiscount,
        lineNet,
        reason: line.reason as AccountingGoodsReturnReason,
        notes: line.notes ?? "",
        lineOrder: line.lineOrder ?? idx,
      });
    }

    // Header value cap: totalNet must not exceed the invoice's remaining
    // returnable value (= invoice.total − approved CPR receivable_cleared
    // − approved CR totalNet). This enforces the "paid portion is closed"
    // business rule from the form's UI.
    const invoiceTotal = Number(invoice.total);
    const paidAmount = invoice.paymentAllocations.reduce(
      (sum, a) => sum + Number(a.receivableAmount),
      0,
    );
    const alreadyReturnedNet = invoice.customerReturns.reduce(
      (sum, r) => sum + Number(r.totalNet),
      0,
    );
    const remainingReturnable = Math.max(
      0,
      invoiceTotal - paidAmount - alreadyReturnedNet,
    );
    const totalNet = Math.max(0, totalGross - totalDiscount);
    if (totalNet > remainingReturnable + 1e-9) {
      return NextResponse.json(
        fail(
          `Return value ${totalNet.toFixed(2)} exceeds the invoice's remaining returnable amount of ${remainingReturnable.toFixed(2)}. The paid portion of an invoice is closed and cannot be returned.`,
          "VALIDATION_ERROR",
        ),
        { status: 422 },
      );
    }

    const existing = await prisma.accountingCustomerReturn.findUnique({
      where: { returnNumber: body.returnNumber.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        fail(`Return number "${body.returnNumber}" already exists.`, "DUPLICATE_RETURN"),
        { status: 409 },
      );
    }

    const created = await prisma.accountingCustomerReturn.create({
      data: {
        returnNumber: body.returnNumber.trim(),
        invoiceId: body.invoiceId,
        customerId: invoice.customerId,
        storeId: effectiveStoreId,
        returnDate: isoToDate(body.returnDate),
        returnedBy: body.returnedBy?.trim() ?? "",
        reasonHeader: body.reasonHeader?.trim() ?? "",
        currency: invoice.currency,
        notes: body.notes ?? "",
        totalQty,
        totalGross,
        totalDiscount,
        totalNet,
        status: "DRAFT",
        createdById: currentUser.id,
        lines: { create: linesData },
      },
      select: { id: true, returnNumber: true },
    });

    // Increment SR form-id next number.
    const current = await prisma.accountingFormIdConfig.findUnique({
      where: { formType: "SR" },
      select: { nextNumber: true },
    });
    const baseNext = current?.nextNumber ?? "0001";
    const nextValue = String(Number(baseNext) + 1).padStart(
      Math.max(4, baseNext.length),
      "0",
    );
    await prisma.accountingFormIdConfig.upsert({
      where: { formType: "SR" },
      update: { nextNumber: nextValue },
      create: {
        formType: "SR",
        code: "SR",
        yearToken: "2026",
        rangeFrom: "0001",
        rangeTo: "9999",
        nextNumber: nextValue,
      },
    });

    return NextResponse.json(
      ok({ id: created.id, returnNumber: created.returnNumber }, "Customer return created."),
      { status: 201 },
    );
  } catch (err) {
    console.error("[CR CREATE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

// ─── POS_BILL source path ───────────────────────────────────────────
// Handles both SPLIT and non-SPLIT (CASH / CARD / MIXED) POS bill
// returns. Differences:
//
//   • SPLIT:        AAR was tagged with the merchantClientId; the
//                   return reverses against that same merchant
//                   ledger.
//   • CASH-LIKE:    AAR was tagged with the bill's actual customer
//                   (walk-in or registered) and immediately settled
//                   via the till at sale time. The return needs to
//                   reverse the receivable AND refund the cash to
//                   the customer — that extra cash leg is added by
//                   postCustomerReturnApproval when it sees a
//                   non-SPLIT source bill.
async function createReturnFromPosBill(
  body: CreateReturnBody,
  currentUser: AccountingUser,
): Promise<NextResponse> {
  const sourcePosBillId = body.sourcePosBillId!;
  const bill = await prisma.accountingPosBill.findUnique({
    where: { id: sourcePosBillId },
    include: {
      customer: { select: { id: true, isWalkIn: true } },
      merchantClient: { select: { id: true } },
      lines: {
        select: {
          id: true,
          productId: true,
          itemCode: true,
          itemName: true,
          description: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          uomName: true,
          uomBase: true,
          uomMinQty: true,
          voucherSerialId: true,
          product: { select: { itemType: true } },
        },
      },
      customerReturns: {
        where: { status: "APPROVED" },
        select: {
          totalNet: true,
          lines: { select: { sourcePosBillLineId: true, returnQty: true } },
        },
      },
    },
  });

  if (!bill) {
    return NextResponse.json(fail("POS bill not found.", "NOT_FOUND"), {
      status: 404,
    });
  }
  if (bill.status !== "COMPLETED") {
    return NextResponse.json(
      fail(
        "Source POS bill must be completed before raising a return.",
        "VALIDATION_ERROR",
      ),
      { status: 422 },
    );
  }
  // SPLIT bills need a merchantClientId; cash-like bills don't. Both
  // are accepted; the per-bill discrimination flows downstream.
  if (bill.paymentMethod === "SPLIT" && !bill.merchantClientId) {
    return NextResponse.json(
      fail("SPLIT POS bill is missing its merchantClientId.", "VALIDATION_ERROR"),
      { status: 422 },
    );
  }
  if (bill.paymentMethod === null) {
    return NextResponse.json(
      fail("POS bill has no payment method recorded.", "VALIDATION_ERROR"),
      { status: 422 },
    );
  }
  // For non-SPLIT bills we additionally need the primary cash account
  // recorded at Pay time — that's where the refund will be paid out
  // from. Bills posted via the live POS always have this set, but
  // we double-check.
  if (bill.paymentMethod !== "SPLIT" && !bill.primaryCashAccountId) {
    return NextResponse.json(
      fail(
        "Cash/Card/Mixed POS bill is missing its primary cash account — cannot refund.",
        "VALIDATION_ERROR",
      ),
      { status: 422 },
    );
  }

  const storeResolution = await resolveEffectiveStoreId(currentUser, body.storeId);
  if (!storeResolution.ok) {
    return NextResponse.json(fail(storeResolution.message, storeResolution.code), {
      status: storeResolution.status,
    });
  }
  const effectiveStoreId = storeResolution.storeId;

  // Per-line cap based on prior approved CR rows referencing this POS bill
  const returnedByLineId = new Map<string, number>();
  for (const cr of bill.customerReturns) {
    for (const line of cr.lines) {
      if (!line.sourcePosBillLineId) continue;
      returnedByLineId.set(
        line.sourcePosBillLineId,
        (returnedByLineId.get(line.sourcePosBillLineId) ?? 0) + Number(line.returnQty),
      );
    }
  }

  const billLineMap = new Map(bill.lines.map((l) => [l.id, l]));

  let totalQty = 0;
  let totalGross = 0;
  let totalDiscount = 0;
  const linesData: Array<{
    sourcePosBillLineId: string;
    productId: string;
    itemCode: string;
    itemName: string;
    description: string;
    uomName: string;
    uomBase: string;
    uomMinQty: number;
    originalQty: number;
    unitPrice: number;
    returnQty: number;
    lineGross: number;
    lineDiscount: number;
    lineNet: number;
    reason: AccountingGoodsReturnReason;
    notes: string;
    lineOrder: number;
  }> = [];

  for (const [idx, line] of body.lines.entries()) {
    if (!line.sourcePosBillLineId) {
      return NextResponse.json(
        fail("POS_BILL return lines need sourcePosBillLineId.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    const billLine = billLineMap.get(line.sourcePosBillLineId);
    if (!billLine) {
      return NextResponse.json(
        fail("A return line references a missing POS bill line.", "VALIDATION_ERROR"),
        { status: 422 },
      );
    }
    // Per theory § 7.5 — voucher lines are NOT returnable.
    if (billLine.product.itemType === "VOUCHER") {
      return NextResponse.json(
        fail(
          `Voucher line ${billLine.itemCode} cannot be returned (theory § 7.5).`,
          "VALIDATION_ERROR",
        ),
        { status: 422 },
      );
    }
    const returnQty = Number(line.returnQty);
    if (!Number.isFinite(returnQty) || returnQty <= 0) {
      return NextResponse.json(
        fail(
          `Return quantity must be greater than zero for ${billLine.itemCode}.`,
          "VALIDATION_ERROR",
        ),
        { status: 422 },
      );
    }
    const originalQty = Number(billLine.quantity);
    const alreadyReturned = returnedByLineId.get(billLine.id) ?? 0;
    const remainingLineQty = Math.max(0, originalQty - alreadyReturned);
    if (returnQty > remainingLineQty + 1e-9) {
      return NextResponse.json(
        fail(
          `Return quantity ${returnQty} for ${billLine.itemCode} exceeds remaining returnable qty ${remainingLineQty} (original ${originalQty} − already returned ${alreadyReturned}).`,
          "VALIDATION_ERROR",
        ),
        { status: 422 },
      );
    }
    if (!isReason(line.reason)) {
      return NextResponse.json(
        fail(`Invalid reason for line ${billLine.itemCode}.`, "VALIDATION_ERROR"),
        { status: 422 },
      );
    }

    const unitPrice = Number(billLine.unitPrice);
    const billLineDiscount = Number(billLine.discount);
    const lineGross = returnQty * unitPrice;
    const lineDiscount = originalQty > 0 ? billLineDiscount * (returnQty / originalQty) : 0;
    const lineNet = Math.max(0, lineGross - lineDiscount);

    totalQty += returnQty;
    totalGross += lineGross;
    totalDiscount += lineDiscount;

    linesData.push({
      sourcePosBillLineId: billLine.id,
      productId: billLine.productId,
      itemCode: billLine.itemCode,
      itemName: billLine.itemName,
      description: billLine.description,
      uomName: billLine.uomName,
      uomBase: billLine.uomBase,
      uomMinQty: Number(billLine.uomMinQty) || 1,
      originalQty,
      unitPrice,
      returnQty,
      lineGross,
      lineDiscount,
      lineNet,
      reason: line.reason as AccountingGoodsReturnReason,
      notes: line.notes ?? "",
      lineOrder: line.lineOrder ?? idx,
    });
  }

  // Header value cap — for SPLIT bills, the unsettled portion is what
  // can still be returned. Today merchant-CPR-against-POS-bill isn't
  // implemented, so paidAmount = 0 and the cap is just total − prior
  // approved CR net.
  const billTotal = Number(bill.total);
  const paidAmount = 0;
  const alreadyReturnedNet = bill.customerReturns.reduce(
    (sum, r) => sum + Number(r.totalNet),
    0,
  );
  const remainingReturnable = Math.max(
    0,
    billTotal - paidAmount - alreadyReturnedNet,
  );
  const totalNet = Math.max(0, totalGross - totalDiscount);
  if (totalNet > remainingReturnable + 1e-9) {
    return NextResponse.json(
      fail(
        `Return value ${totalNet.toFixed(2)} exceeds the POS bill's remaining returnable amount of ${remainingReturnable.toFixed(2)}.`,
        "VALIDATION_ERROR",
      ),
      { status: 422 },
    );
  }

  const existing = await prisma.accountingCustomerReturn.findUnique({
    where: { returnNumber: body.returnNumber.trim() },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      fail(`Return number "${body.returnNumber}" already exists.`, "DUPLICATE_RETURN"),
      { status: 409 },
    );
  }

  const created = await prisma.accountingCustomerReturn.create({
    data: {
      returnNumber: body.returnNumber.trim(),
      sourceType: "POS_BILL",
      sourcePosBillId: bill.id,
      // Customer-side: who was the AAR / sub-ledger tagged with on the
      // original POS posting?
      //   • SPLIT bills   → merchantClientId (theory § 7.2)
      //   • Cash-like     → bill.customerId (walk-in or real customer)
      // The CR row carries that id so the customer ledger posting goes
      // to the right sub-ledger on approval.
      customerId:
        bill.paymentMethod === "SPLIT"
          ? bill.merchantClientId!
          : bill.customerId,
      storeId: effectiveStoreId,
      returnDate: isoToDate(body.returnDate),
      returnedBy: body.returnedBy?.trim() ?? "",
      reasonHeader: body.reasonHeader?.trim() ?? "",
      currency: "LKR",
      notes: body.notes ?? "",
      totalQty,
      totalGross,
      totalDiscount,
      totalNet,
      status: "DRAFT",
      createdById: currentUser.id,
      lines: { create: linesData },
    },
    select: { id: true, returnNumber: true },
  });

  // Increment SR form-id next number (shared with invoice returns
  // per pos-integration-flow.md § 3.11).
  const current = await prisma.accountingFormIdConfig.findUnique({
    where: { formType: "SR" },
    select: { nextNumber: true },
  });
  const baseNext = current?.nextNumber ?? "0001";
  const nextValue = String(Number(baseNext) + 1).padStart(
    Math.max(4, baseNext.length),
    "0",
  );
  await prisma.accountingFormIdConfig.upsert({
    where: { formType: "SR" },
    update: { nextNumber: nextValue },
    create: {
      formType: "SR",
      code: "SR",
      yearToken: "2026",
      rangeFrom: "0001",
      rangeTo: "9999",
      nextNumber: nextValue,
    },
  });

  return NextResponse.json(
    ok({ id: created.id, returnNumber: created.returnNumber }, "Customer return created."),
    { status: 201 },
  );
}
