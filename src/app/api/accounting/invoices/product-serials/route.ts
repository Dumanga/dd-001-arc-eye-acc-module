// GET /api/accounting/invoices/product-serials?storeId=<id>&productId=<id>&currentInvoiceLineSerialId=<id?>
//
// Returns ACTIVE serials for a serial-tracked inventory product at a
// branch, for selection on an INVOICE line. Same shape as the POS
// equivalent (/api/accounting/pos/product-serials/active) but with a
// broader soft-lock filter:
//
//   • exists in `accountinggoodsreceiptlineserial` at this branch's GRN
//   • NOT referenced by any DRAFT or COMPLETED POS bill line  (POS lock)
//   • NOT referenced by any DRAFT or APPROVED invoice line    (INVOICE lock)
//
// `currentInvoiceLineSerialId` (optional): when supplied, that serial id
// is force-included in the result even if it's currently locked. This
// is the serial the user already picked on the line being edited — we
// don't want to hide it from its own picker.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";

export type ActiveInvoiceProductSerial = {
  serialId: string;
  serialNumber: string;
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const productId = (url.searchParams.get("productId") ?? "").trim();
    const currentLockedSerialId =
      (url.searchParams.get("currentInvoiceLineSerialId") ?? "").trim() || null;
    if (!productId) {
      return NextResponse.json(
        fail("productId is required.", "VALIDATION"),
        { status: 422 },
      );
    }

    const resolution = await resolveEffectiveStoreId(
      currentUser,
      url.searchParams.get("storeId"),
    );
    if (!resolution.ok) {
      return NextResponse.json(fail(resolution.message, resolution.code), {
        status: resolution.status,
      });
    }
    const storeId = resolution.storeId;

    // Defensive — only respond for INVENTORY_ITEM with serial tracking.
    const product = await prisma.accountingProduct.findUnique({
      where: { id: productId },
      select: { itemType: true, serialTrackingEnabled: true },
    });
    if (
      !product ||
      product.itemType !== "INVENTORY_ITEM" ||
      !product.serialTrackingEnabled
    ) {
      return NextResponse.json(
        fail("Product is not a serial-tracked inventory item.", "NOT_SERIAL_TRACKED"),
        { status: 422 },
      );
    }

    const serials = await prisma.accountingGoodsReceiptLineSerial.findMany({
      where: {
        line: {
          productId,
          goodsReceipt: { storeId },
        },
      },
      include: {
        // POS lock — any DRAFT or COMPLETED POS bill line via productSerialId
        posBillProductLines: {
          where: { posBill: { status: { in: ["DRAFT", "COMPLETED"] } } },
          select: { id: true },
        },
        // Invoice lock — any DRAFT or APPROVED invoice line via productSerialId
        invoiceLines: {
          where: { invoice: { status: { in: ["DRAFT", "APPROVED"] } } },
          select: { id: true },
        },
      },
      orderBy: { serialNumber: "asc" },
    });

    const items: ActiveInvoiceProductSerial[] = serials
      .filter(
        (s) =>
          // Include if it has no locks…
          (s.posBillProductLines.length === 0 && s.invoiceLines.length === 0) ||
          // …or if it's the line's currently-locked serial, so the user
          // can re-pick the same one (and edits don't lose state).
          (currentLockedSerialId !== null && s.id === currentLockedSerialId),
      )
      .map((s) => ({ serialId: s.id, serialNumber: s.serialNumber }));

    return NextResponse.json(
      ok({ items }, "Active invoice product serials fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[INVOICE PRODUCT SERIAL ACTIVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
