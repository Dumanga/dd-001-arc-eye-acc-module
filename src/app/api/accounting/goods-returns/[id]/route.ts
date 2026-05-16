import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import type { AccountingGoodsReturnReason } from "@prisma/client";

export type GoodsReturnDetailLine = {
  id: string;
  lineOrder: number;
  goodsReceiptLineId: string;
  productId: string;
  productCode: string;
  productName: string;
  description: string;
  receivedQty: string;
  returnQty: string;
  unitPrice: string;
  uomName: string;
  uomBase: string;
  reason: AccountingGoodsReturnReason;
  reasonLabel: string;
  lineTotal: string;
};

export type GoodsReturnDetail = {
  id: string;
  returnNumber: string;
  status: string;
  statusLabel: string;
  returnDate: string;
  returnedBy: string;
  reasonHeader: string;
  currency: string;
  notes: string;
  createdAt: string;
  approvedAt: string | null;
  goodsReceipt: {
    id: string;
    grnNumber: string;
    receiptDate: string;
  };
  supplier: {
    id: string;
    code: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
  };
  lines: GoodsReturnDetailLine[];
  totalQty: string;
  totalValue: string;
  createdByName: string;
  approvedByName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const REASON_LABELS: Record<AccountingGoodsReturnReason, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong Item",
  EXPIRED: "Expired",
  EXCESS: "Excess",
  OTHER: "Other",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const grr = await prisma.accountingGoodsReturn.findUnique({
      where: { id },
      include: {
        supplier: { include: { contactInfo: true } },
        goodsReceipt: { select: { id: true, grnNumber: true, receiptDate: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            product: { select: { code: true, purchaseName: true, salesName: true } },
          },
        },
      },
    });

    if (!grr) {
      return NextResponse.json(fail("Goods return not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    let totalQty = 0;
    let totalValue = 0;
    const lines: GoodsReturnDetailLine[] = grr.lines.map((line) => {
      const qty = Number(line.returnQty);
      const price = Number(line.unitPrice);
      const lineTotal = qty * price;
      totalQty += qty;
      totalValue += lineTotal;
      const productName =
        line.product.purchaseName ?? line.product.salesName ?? line.product.code;
      return {
        id: line.id,
        lineOrder: line.lineOrder,
        goodsReceiptLineId: line.goodsReceiptLineId,
        productId: line.productId,
        productCode: line.product.code,
        productName,
        description: line.description,
        receivedQty: Number(line.receivedQty).toString(),
        returnQty: qty.toString(),
        unitPrice: price.toFixed(2),
        uomName: line.uomName,
        uomBase: line.uomBase,
        reason: line.reason,
        reasonLabel: REASON_LABELS[line.reason] ?? line.reason,
        lineTotal: lineTotal.toFixed(2),
      };
    });

    const detail: GoodsReturnDetail = {
      id: grr.id,
      returnNumber: grr.returnNumber,
      status: grr.status,
      statusLabel: STATUS_LABELS[grr.status] ?? grr.status,
      returnDate: grr.returnDate.toISOString().slice(0, 10),
      returnedBy: grr.returnedBy,
      reasonHeader: grr.reasonHeader,
      currency: grr.currency,
      notes: grr.notes,
      createdAt: grr.createdAt.toISOString(),
      approvedAt: grr.approvedAt?.toISOString() ?? null,
      goodsReceipt: {
        id: grr.goodsReceipt.id,
        grnNumber: grr.goodsReceipt.grnNumber,
        receiptDate: grr.goodsReceipt.receiptDate.toISOString().slice(0, 10),
      },
      supplier: {
        id: grr.supplier.id,
        code: grr.supplier.code,
        name: grr.supplier.name,
        email: grr.supplier.email,
        phone: [
          grr.supplier.primaryPhoneDialCode,
          grr.supplier.primaryPhoneLocalNumber,
        ]
          .filter(Boolean)
          .join(" "),
        city: grr.supplier.contactInfo?.city ?? "",
        country: grr.supplier.contactInfo?.country ?? "",
        addressLine1: grr.supplier.contactInfo?.addressLine1 ?? "",
        addressLine2: grr.supplier.contactInfo?.addressLine2 ?? "",
      },
      lines,
      totalQty: totalQty.toString(),
      totalValue: totalValue.toFixed(2),
      createdByName: grr.createdBy.displayName,
      approvedByName: grr.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(
      ok({ goodsReturn: detail }, "Goods return detail fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[GOODS RETURN DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
