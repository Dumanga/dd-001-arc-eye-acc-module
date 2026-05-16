import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postGoodsReturnApproval } from "@/lib/accounting/goods-return-posting";
import { decrementProductStock } from "@/lib/accounting/product-stock";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const grr = await prisma.accountingGoodsReturn.findUnique({
      where: { id },
      select: { id: true, status: true, goodsReceiptId: true, storeId: true },
    });

    if (!grr) {
      return NextResponse.json(
        fail("Goods return not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }
    if (grr.status === "APPROVED") {
      return NextResponse.json(
        fail("Goods return is already approved.", "ALREADY_APPROVED"),
        { status: 409 }
      );
    }
    if (grr.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled goods returns cannot be approved.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Re-validate per-line cap at approve time. Another return may have been
      // approved in parallel while this one was a draft, so we need to check
      // again that this draft's qtys still fit within the remaining
      // returnable qty per source GRN line.
      const draft = await tx.accountingGoodsReturn.findUniqueOrThrow({
        where: { id },
        include: {
          lines: {
            select: {
              id: true,
              goodsReceiptLineId: true,
              productId: true,
              returnQty: true,
            },
          },
        },
      });

      const grnLines = await tx.accountingGoodsReceiptLine.findMany({
        where: { id: { in: draft.lines.map((l) => l.goodsReceiptLineId) } },
        include: {
          product: { select: { itemType: true } },
          // Sum approved returns excluding the one we're about to approve.
          returnLines: {
            where: {
              goodsReturn: { status: "APPROVED" },
              goodsReturnId: { not: id },
            },
            select: { returnQty: true },
          },
        },
      });
      const grnLineById = new Map(grnLines.map((line) => [line.id, line]));

      for (const line of draft.lines) {
        const grnLine = grnLineById.get(line.goodsReceiptLineId);
        if (!grnLine) {
          throw new Error("GRR_APPROVAL_MISSING_SOURCE_LINE");
        }
        const received = Number(grnLine.receivedQty);
        const alreadyReturned = grnLine.returnLines.reduce(
          (sum, rl) => sum + Number(rl.returnQty),
          0
        );
        const remaining = Math.max(0, received - alreadyReturned);
        const requested = Number(line.returnQty);
        if (requested > remaining + 1e-9) {
          throw new Error("GRR_APPROVAL_EXCEEDS_REMAINING");
        }
      }

      const approvedAt = new Date();
      const update = await tx.accountingGoodsReturn.updateMany({
        where: { id, status: "DRAFT" },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });

      if (update.count !== 1) {
        throw new Error("GRR_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingGoodsReturn.findUniqueOrThrow({
        where: { id },
        select: { id: true, returnNumber: true },
      });

      // Decrement inventory product stockOnHand for inventory items only.
      const qtyByProduct = new Map<string, number>();
      for (const line of draft.lines) {
        const grnLine = grnLineById.get(line.goodsReceiptLineId);
        if (grnLine?.product.itemType !== "INVENTORY_ITEM") continue;
        const qty = Number(line.returnQty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + qty);
      }
      for (const [productId, qty] of qtyByProduct) {
        await decrementProductStock(tx, {
          productId,
          storeId: grr.storeId,
          qty,
        });
      }

      // Post double-entry + supplier-ledger transactions per
      // accounting-theories.md (goods return scenario).
      await postGoodsReturnApproval(tx, {
        goodsReturnId: id,
        createdById: currentUser.id,
      });

      return { updated };
    });

    return NextResponse.json(
      ok(
        { id: result.updated.id, returnNumber: result.updated.returnNumber },
        "Goods return approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "GRR_APPROVAL_STATE_CHANGED") {
        return NextResponse.json(
          fail(
            "Goods return approval state changed. Refresh and try again.",
            "INVALID_STATE"
          ),
          { status: 409 }
        );
      }
      if (err.message === "GRR_APPROVAL_EXCEEDS_REMAINING") {
        return NextResponse.json(
          fail(
            "One or more lines exceed the remaining returnable qty on the source GRN. Reduce the qty and try again.",
            "VALIDATION_ERROR"
          ),
          { status: 422 }
        );
      }
      if (err.message === "GRR_APPROVAL_MISSING_SOURCE_LINE") {
        return NextResponse.json(
          fail("A return line references a missing GRN line.", "INVALID_STATE"),
          { status: 409 }
        );
      }
    }

    console.error("[GOODS RETURN APPROVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
