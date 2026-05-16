import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type GrnDetailLine = {
  id: string;
  lineOrder: number;
  productCode: string;
  productName: string;
  description: string;
  orderedQty: string;
  receivedQty: string;
  variance: string;
  unitPrice: string;
  discount: string;
  uomName: string;
  uomBase: string;
  condition: string;
  conditionLabel: string;
  requiresSerial: boolean;
  serials: string[];
  lineGross: string;
  lineTotal: string;
};

export type GrnDetail = {
  id: string;
  grnNumber: string;
  status: string;
  statusLabel: string;
  mode: "withPo" | "withoutPo";
  poId: string | null;
  poNumber: string | null;
  poStatus: string | null;
  poStatusLabel: string | null;
  receiptDate: string;
  receivedBy: string;
  deliveryNoteRef: string;
  vehicleRef: string;
  currency: string;
  notes: string;
  createdAt: string;
  approvedAt: string | null;
  // Null when openingBalanceMode = true (no supplier on opening balance GRNs).
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
  } | null;
  openingBalanceMode: boolean;
  openingEquityAccount: { id: string; code: string; name: string } | null;
  lines: GrnDetailLine[];
  totalOrdered: string;
  totalReceived: string;
  variance: string;
  grossValue: string;
  totalDiscount: string;
  receiptValue: string;
  createdByName: string;
  approvedByName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

const PO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Fully received",
  CANCELLED: "Cancelled",
};

const CONDITION_LABELS: Record<string, string> = {
  GOOD: "Good",
  DAMAGED: "Damaged",
  SHORT: "Short",
  EXCESS: "Excess",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const grn = await prisma.accountingGoodsReceipt.findUnique({
      where: { id },
      include: {
        supplier: { include: { contactInfo: true } },
        purchaseOrder: { select: { id: true, poNumber: true, status: true } },
        openingEquityAccount: { select: { id: true, code: true, name: true } },
        createdBy: { select: { displayName: true } },
        approvedBy: { select: { displayName: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          include: {
            product: { select: { code: true, purchaseName: true } },
            serials: { orderBy: { position: "asc" }, select: { serialNumber: true } },
          },
        },
      },
    });

    if (!grn) {
      return NextResponse.json(fail("Goods receipt not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    let totalOrdered = 0;
    let totalReceived = 0;
    let grossValue = 0;
    let totalDiscount = 0;
    let receiptValue = 0;

    const lines: GrnDetailLine[] = grn.lines.map((line) => {
      const ordered = Number(line.orderedQty);
      const received = Number(line.receivedQty);
      const unitPrice = Number(line.unitPrice);
      const discount = Number(line.discount ?? 0);
      const lineGross = received * unitPrice;
      const lineNet = Math.max(0, lineGross - discount);
      const variance = ordered ? received - ordered : 0;
      totalOrdered += ordered;
      totalReceived += received;
      grossValue += lineGross;
      totalDiscount += discount;
      receiptValue += lineNet;
      const productName = line.product.purchaseName ?? line.product.code;
      return {
        id: line.id,
        lineOrder: line.lineOrder,
        productCode: line.product.code,
        productName,
        description: line.description,
        orderedQty: ordered ? ordered.toString() : "",
        receivedQty: received.toString(),
        variance: variance.toString(),
        unitPrice: unitPrice.toFixed(2),
        discount: discount.toFixed(2),
        uomName: line.uomName,
        uomBase: line.uomBase,
        condition: line.condition,
        conditionLabel: CONDITION_LABELS[line.condition] ?? line.condition,
        requiresSerial: line.requiresSerial,
        serials: line.serials.map((s) => s.serialNumber),
        lineGross: lineGross.toFixed(2),
        lineTotal: lineNet.toFixed(2),
      };
    });

    const variance = totalOrdered ? totalReceived - totalOrdered : 0;

    const detail: GrnDetail = {
      id: grn.id,
      grnNumber: grn.grnNumber,
      status: grn.status,
      statusLabel: STATUS_LABELS[grn.status] ?? grn.status,
      mode: grn.purchaseOrderId ? "withPo" : "withoutPo",
      poId: grn.purchaseOrder?.id ?? null,
      poNumber: grn.purchaseOrder?.poNumber ?? null,
      poStatus: grn.purchaseOrder?.status ?? null,
      poStatusLabel: grn.purchaseOrder
        ? PO_STATUS_LABELS[grn.purchaseOrder.status] ?? grn.purchaseOrder.status
        : null,
      receiptDate: grn.receiptDate.toISOString().slice(0, 10),
      receivedBy: grn.receivedBy,
      deliveryNoteRef: grn.deliveryNoteRef,
      vehicleRef: grn.vehicleRef,
      currency: grn.currency,
      notes: grn.notes,
      createdAt: grn.createdAt.toISOString(),
      approvedAt: grn.approvedAt?.toISOString() ?? null,
      supplier: grn.supplier
        ? {
            id: grn.supplier.id,
            code: grn.supplier.code,
            name: grn.supplier.name,
            email: grn.supplier.email,
            phone: [
              grn.supplier.primaryPhoneDialCode,
              grn.supplier.primaryPhoneLocalNumber,
            ]
              .filter(Boolean)
              .join(" "),
            city: grn.supplier.contactInfo?.city ?? "",
            country: grn.supplier.contactInfo?.country ?? "",
            addressLine1: grn.supplier.contactInfo?.addressLine1 ?? "",
            addressLine2: grn.supplier.contactInfo?.addressLine2 ?? "",
          }
        : null,
      openingBalanceMode: grn.openingBalanceMode,
      openingEquityAccount: grn.openingEquityAccount
        ? {
            id: grn.openingEquityAccount.id,
            code: grn.openingEquityAccount.code,
            name: grn.openingEquityAccount.name,
          }
        : null,
      lines,
      totalOrdered: totalOrdered.toString(),
      totalReceived: totalReceived.toString(),
      variance: variance.toString(),
      grossValue: grossValue.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      receiptValue: receiptValue.toFixed(2),
      createdByName: grn.createdBy.displayName,
      approvedByName: grn.approvedBy?.displayName ?? null,
    };

    return NextResponse.json(ok({ grn: detail }, "GRN detail fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GRN DETAIL]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
