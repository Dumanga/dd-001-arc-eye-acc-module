import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type GrnPoOptionLine = {
  poLineId: string;
  itemId: string;
  itemLabel: string;
  description: string;
  orderedQty: string;
  receivedQtySoFar: string;
  remainingQty: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  requiresSerial: boolean;
};

export type GrnPoOption = {
  id: string;
  poNumber: string;
  poDate: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  supplierContact: string;
  supplierCity: string;
  currency: string;
  status: string;
  statusLabel: string;
  lines: GrnPoOptionLine[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Fully received",
  CANCELLED: "Cancelled",
};

export async function GET() {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;

    const orders = await prisma.accountingPurchaseOrder.findMany({
      where: {
        status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            primaryPhoneDialCode: true,
            primaryPhoneLocalNumber: true,
            contactInfo: { select: { city: true } },
          },
        },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            product: {
              select: {
                id: true,
                code: true,
                purchaseName: true,
                serialTrackingEnabled: true,
              },
            },
            goodsReceiptLines: {
              where: { goodsReceipt: { status: "APPROVED" } },
              select: { receivedQty: true },
            },
          },
        },
      },
    });

    const items: GrnPoOption[] = [];
    for (const po of orders) {
      const lines: GrnPoOptionLine[] = po.lines.map((line) => {
        const receivedSoFar = line.goodsReceiptLines.reduce(
          (sum, grnLine) => sum + Number(grnLine.receivedQty),
          0
        );
        const ordered = Number(line.quantity);
        const remaining = Math.max(0, ordered - receivedSoFar);
        const productName = line.product.purchaseName ?? line.product.code;
        return {
          poLineId: line.id,
          itemId: line.product.id,
          itemLabel: `${line.product.code} · ${productName}`,
          description: line.description || productName,
          orderedQty: ordered.toString(),
          receivedQtySoFar: receivedSoFar.toString(),
          remainingQty: remaining.toString(),
          unitPrice: Number(line.unitPrice).toFixed(2),
          uomName: line.uomName,
          uomBase: line.uomBase,
          requiresSerial: line.product.serialTrackingEnabled,
        };
      });
      // Hide POs whose every line is already fully received (defensive — in
      // practice the auto-close logic should have moved them to RECEIVED).
      if (!lines.some((l) => Number(l.remainingQty) > 0)) continue;
      const dial = po.supplier.primaryPhoneDialCode.trim();
      const local = po.supplier.primaryPhoneLocalNumber.trim();
      items.push({
        id: po.id,
        poNumber: po.poNumber,
        poDate: po.poDate.toISOString().slice(0, 10),
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        supplierCode: po.supplier.code,
        supplierContact: dial && local ? `${dial} ${local}` : local || dial,
        supplierCity: po.supplier.contactInfo?.city ?? "",
        currency: po.currency,
        status: po.status,
        statusLabel: STATUS_LABELS[po.status] ?? po.status,
        lines,
      });
    }

    return NextResponse.json(ok({ items }, "GRN PO options fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GRN PO OPTIONS]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
