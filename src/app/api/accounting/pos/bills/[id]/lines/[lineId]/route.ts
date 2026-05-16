// PATCH /api/accounting/pos/bills/[id]/lines/[lineId]
// DELETE /api/accounting/pos/bills/[id]/lines/[lineId]
//
// Edit qty / discount on an existing line, or remove a line. Removing
// a line releases its reservation; other cashiers see stock available
// again on their next product-list call. Per pos-integration-flow.md
// § 3.2 and § 5.5.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import {
  billQueryInclude,
  getDraftReservedQtyByProduct,
  recomputeBillTotals,
  serializeBill,
} from "@/lib/accounting/pos-bill";

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type LoadResult =
  | { error: { status: number; code: string; message: string } }
  | {
      error: null;
      bill: { id: string; status: "DRAFT" | "COMPLETED" | "CANCELLED"; storeId: string; cashierId: string };
      line: {
        id: string;
        billId: string;
        productId: string;
        quantity: import("@prisma/client").Prisma.Decimal;
        unitPrice: import("@prisma/client").Prisma.Decimal;
        discount: import("@prisma/client").Prisma.Decimal;
      };
    };

async function loadDraftLine(billId: string, lineId: string, cashierId: string): Promise<LoadResult> {
  const bill = await prisma.accountingPosBill.findUnique({
    where: { id: billId },
    select: { id: true, status: true, cashierId: true, storeId: true },
  });
  if (!bill) return { error: { status: 404, code: "BILL_NOT_FOUND", message: "POS bill not found." } };
  if (bill.cashierId !== cashierId) {
    return { error: { status: 403, code: "BILL_NOT_OWNED", message: "Bill belongs to another cashier." } };
  }
  if (bill.status !== "DRAFT") {
    return { error: { status: 409, code: "BILL_NOT_EDITABLE", message: "Posted or cancelled bills cannot be edited." } };
  }
  const line = await prisma.accountingPosBillLine.findUnique({
    where: { id: lineId },
    select: { id: true, billId: true, productId: true, quantity: true, unitPrice: true, discount: true },
  });
  if (!line || line.billId !== bill.id) {
    return { error: { status: 404, code: "LINE_NOT_FOUND", message: "Line not found on this bill." } };
  }
  return { error: null, bill, line };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id: billId, lineId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const newQty = num(body.qty);
    const newDiscount = num(body.discount);

    const loaded = await loadDraftLine(billId, lineId, currentUser.id);
    if (loaded.error) {
      return NextResponse.json(fail(loaded.error.message, loaded.error.code), {
        status: loaded.error.status,
      });
    }
    const { bill, line } = loaded;

    const result = await prisma.$transaction(async (tx) => {
      // If qty is being raised, re-check reservation headroom against
      // the product's current branch stock. The current line's own
      // qty is already counted in `getDraftReservedQtyByProduct`, so
      // subtract it back out before checking.
      let qty = newQty ?? Number(line.quantity);
      if (qty <= 0) throw new Error("VALIDATION:Quantity must be greater than zero.");

      if (newQty !== null && newQty > Number(line.quantity)) {
        const onHandRow = await tx.accountingProductStock.findFirst({
          where: { productId: line.productId, storeId: bill.storeId },
          select: { qtyOnHand: true },
        });
        const onHand = Number(onHandRow?.qtyOnHand ?? 0);
        const reserved = await getDraftReservedQtyByProduct(tx, bill.storeId, [line.productId]);
        const reservedQty = reserved.get(line.productId) ?? 0;
        // Subtract our own current qty since it's already counted in the reserved total.
        const otherReserved = reservedQty - Number(line.quantity);
        const available = onHand - otherReserved;
        if (qty > available + 1e-9) {
          throw new Error(`OUT_OF_STOCK:Only ${available.toFixed(2)} unit(s) available.`);
        }
      }

      const unitPrice = Number(line.unitPrice);
      const discount = newDiscount ?? Number(line.discount);
      if (discount < 0) throw new Error("VALIDATION:Discount cannot be negative.");
      const lineTotal = qty * unitPrice - discount;
      if (lineTotal < 0) {
        throw new Error("VALIDATION:Discount cannot exceed the line total.");
      }

      await tx.accountingPosBillLine.update({
        where: { id: line.id },
        data: {
          quantity: new Prisma.Decimal(qty.toFixed(4)),
          discount: new Prisma.Decimal(discount.toFixed(4)),
          lineTotal: new Prisma.Decimal(lineTotal.toFixed(4)),
        },
      });
      await recomputeBillTotals(tx, bill.id);
      return tx.accountingPosBill.findUniqueOrThrow({
        where: { id: bill.id },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(ok({ bill: serializeBill(result) }, "Line updated."), {
      status: 200,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      return NextResponse.json(fail(rest.join(":") || "Unable to update line.", code), {
        status: code === "OUT_OF_STOCK" ? 409 : 422,
      });
    }
    console.error("[POS BILL PATCH LINE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id: billId, lineId } = await params;
    const loaded = await loadDraftLine(billId, lineId, currentUser.id);
    if (loaded.error) {
      return NextResponse.json(fail(loaded.error.message, loaded.error.code), {
        status: loaded.error.status,
      });
    }
    const { bill } = loaded;

    const result = await prisma.$transaction(async (tx) => {
      await tx.accountingPosBillLine.delete({ where: { id: lineId } });
      await recomputeBillTotals(tx, bill.id);
      return tx.accountingPosBill.findUniqueOrThrow({
        where: { id: bill.id },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(ok({ bill: serializeBill(result) }, "Line removed."), {
      status: 200,
    });
  } catch (err) {
    console.error("[POS BILL DELETE LINE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
