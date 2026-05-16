// GET /api/accounting/pos/bills/[id]/receipt
//
// Returns the thermal-receipt HTML for a COMPLETED POS bill. The POS
// screen's "Complete bill and print" flow opens this URL in a new
// window after a successful pay so the cashier can hit Cmd/Ctrl-P
// (or use the receipt printer's auto-cut handler).

import { NextResponse } from "next/server";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { renderPosBillReceipt, type PosReceiptPayment } from "@/lib/print/pos-bill";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;
    const bill = await prisma.accountingPosBill.findUnique({
      where: { id },
      include: {
        store: { select: { name: true, code: true } },
        cashier: { select: { displayName: true } },
        customer: { select: { name: true, isWalkIn: true } },
        merchantClient: { select: { name: true } },
        lines: {
          orderBy: { lineOrder: "asc" },
          select: {
            itemCode: true,
            itemName: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            uomBase: true,
            // Either of these can be set on serial-tracked POS lines:
            //   productSerial → regular inventory serial sale
            //   voucherSerial → gift-voucher redemption
            // Both reference accountinggoodsreceiptlineserial.
            productSerial: { select: { serialNumber: true } },
            voucherSerial: { select: { serialNumber: true } },
          },
        },
        payments: {
          orderBy: { rowOrder: "asc" },
          include: {
            cashAccount: { select: { code: true, name: true } },
            merchantClient: { select: { name: true } },
          },
        },
      },
    });

    if (!bill) {
      return new NextResponse("POS bill not found.", { status: 404 });
    }
    if (currentUser.role !== "SUPER_ADMIN" && currentUser.storeId !== bill.storeId) {
      return new NextResponse("Bill belongs to another branch.", { status: 403 });
    }
    if (bill.status !== "COMPLETED") {
      return new NextResponse(
        `Only completed bills have receipts (this bill is ${bill.status}).`,
        { status: 409 },
      );
    }

    const paymentRows: PosReceiptPayment[] = bill.payments.map((p) => {
      let label = "";
      if (p.method === "CASH") {
        label = p.cashAccount
          ? `Cash · ${p.cashAccount.code} ${p.cashAccount.name}`
          : "Cash";
      } else if (p.method === "CARD") {
        label = p.cashAccount
          ? `Card · ${p.cashAccount.code} ${p.cashAccount.name}`
          : "Card";
      } else if (p.method === "SPLIT") {
        label = p.merchantClient ? `Merchant · ${p.merchantClient.name}` : "Merchant";
      }
      return {
        label,
        amount: Number(p.amount).toFixed(2),
      };
    });

    const html = renderPosBillReceipt({
      billNo: bill.billNo,
      postedAt: bill.postedAt ?? new Date(),
      storeName: bill.store.name,
      cashierName: bill.cashier.displayName,
      customerName: bill.customer.name,
      customerIsWalkIn: bill.customer.isWalkIn,
      paymentMethod: (bill.paymentMethod ?? "CASH") as
        | "CASH"
        | "CARD"
        | "MIXED"
        | "SPLIT",
      lines: bill.lines.map((l) => ({
        productCode: l.itemCode,
        productName: l.itemName,
        qty: Number(l.quantity).toString(),
        unitPrice: Number(l.unitPrice).toFixed(2),
        discount: Number(l.discount).toFixed(2),
        lineTotal: Number(l.lineTotal).toFixed(2),
        uomBase: l.uomBase,
        // Prefer the product serial. Vouchers carry their own serial in
        // voucherSerial; show that when there's no product serial. Both
        // are populated by the POS serial picker on add-to-cart.
        serialNumber:
          l.productSerial?.serialNumber ?? l.voucherSerial?.serialNumber ?? null,
      })),
      subtotal: Number(bill.subtotal).toFixed(2),
      totalDiscount: Number(bill.totalDiscount).toFixed(2),
      total: Number(bill.total).toFixed(2),
      payments: paymentRows,
      splitMerchantName:
        bill.paymentMethod === "SPLIT" ? bill.merchantClient?.name ?? null : null,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[POS RECEIPT]", err);
    return new NextResponse("Unexpected server error rendering receipt.", {
      status: 500,
    });
  }
}
