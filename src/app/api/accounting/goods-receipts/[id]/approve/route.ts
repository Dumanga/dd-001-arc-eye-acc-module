import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { postGrnApproval } from "@/lib/accounting/grn-posting";
import { incrementProductStock } from "@/lib/accounting/product-stock";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const grn = await prisma.accountingGoodsReceipt.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        purchaseOrderId: true,
        storeId: true,
      },
    });

    if (!grn) {
      return NextResponse.json(fail("Goods receipt not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (grn.status === "APPROVED") {
      return NextResponse.json(
        fail("Goods receipt is already approved.", "ALREADY_APPROVED"),
        { status: 409 }
      );
    }
    if (grn.status === "CANCELLED") {
      return NextResponse.json(
        fail("Cancelled GRNs cannot be approved.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const statusUpdate = await tx.accountingGoodsReceipt.updateMany({
        where: {
          id,
          status: "DRAFT",
        },
        data: {
          status: "APPROVED",
          approvedById: currentUser.id,
          approvedAt,
        },
      });

      if (statusUpdate.count !== 1) {
        throw new Error("GRN_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingGoodsReceipt.findUniqueOrThrow({
        where: { id },
        select: { id: true, grnNumber: true, purchaseOrderId: true },
      });

      const lines = await tx.accountingGoodsReceiptLine.findMany({
        where: { goodsReceiptId: id },
        select: {
          productId: true,
          receivedQty: true,
          product: { select: { itemType: true } },
        },
      });

      const qtyByProduct = new Map<string, number>();
      for (const line of lines) {
        if (line.product.itemType !== "INVENTORY_ITEM") continue;
        const receivedQty = Number(line.receivedQty);
        if (!Number.isFinite(receivedQty) || receivedQty <= 0) continue;
        qtyByProduct.set(
          line.productId,
          (qtyByProduct.get(line.productId) ?? 0) + receivedQty
        );
      }

      for (const [productId, receivedQty] of qtyByProduct) {
        await incrementProductStock(tx, {
          productId,
          storeId: grn.storeId,
          qty: receivedQty,
        });
      }

      // Post double-entry + supplier-ledger transactions per
      // accounting-theories.md (GRN approval scenario).
      await postGrnApproval(tx, {
        grnId: id,
        createdById: currentUser.id,
      });

      let nextPoStatus: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" | null = null;

      if (grn.purchaseOrderId) {
        const po = await tx.accountingPurchaseOrder.findUnique({
          where: { id: grn.purchaseOrderId },
          include: {
            lines: {
              select: {
                id: true,
                quantity: true,
                goodsReceiptLines: {
                  where: { goodsReceipt: { status: "APPROVED" } },
                  select: { receivedQty: true },
                },
              },
            },
          },
        });

        if (po && po.status !== "CANCELLED") {
          let allFullyReceived = true;
          let anyReceived = false;

          for (const line of po.lines) {
            const ordered = Number(line.quantity);
            const totalReceived = line.goodsReceiptLines.reduce(
              (sum, grnLine) => sum + Number(grnLine.receivedQty),
              0
            );
            if (totalReceived > 0) anyReceived = true;
            if (totalReceived < ordered) allFullyReceived = false;
          }

          if (allFullyReceived && po.lines.length > 0) {
            nextPoStatus = "RECEIVED";
          } else if (anyReceived) {
            nextPoStatus = "PARTIALLY_RECEIVED";
          }

          if (nextPoStatus && nextPoStatus !== po.status) {
            await tx.accountingPurchaseOrder.update({
              where: { id: po.id },
              data: { status: nextPoStatus },
            });
          } else {
            nextPoStatus = po.status as typeof nextPoStatus;
          }
        }
      }

      return { updated, nextPoStatus };
    });

    return NextResponse.json(
      ok(
        {
          id: result.updated.id,
          grnNumber: result.updated.grnNumber,
          poStatus: result.nextPoStatus,
        },
        "Goods receipt approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "GRN_APPROVAL_STATE_CHANGED") {
      return NextResponse.json(
        fail("Goods receipt approval state changed. Refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    console.error("[GRN APPROVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
