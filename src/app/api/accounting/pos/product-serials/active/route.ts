// GET /api/accounting/pos/product-serials/active?storeId=<id>&productId=<id>
//
// Returns the ACTIVE serials for a serial-tracked inventory product at a
// branch. Mirrors the voucher-serials/active endpoint — same soft-lock
// semantics — but for `itemType=INVENTORY_ITEM AND serialTrackingEnabled=true`
// products and reading the productSerialId column on POS bill lines.
//
// State derivation (no explicit `state` column):
//   • exists in `accountinggoodsreceiptlineserial` at this branch's GRN
//   • NOT referenced by any DRAFT bill line via productSerialId
//   • NOT referenced by any COMPLETED bill line via productSerialId
//   • NOT referenced by any DRAFT or APPROVED invoice line via productSerialId
//     (invoice-line lock added with migration 20260513000000)
//
// Branch scoping: only serials whose source GRN is at the requested branch
// are returned.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";

export type ActiveProductSerial = {
  serialId: string;
  serialNumber: string;
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const productId = (url.searchParams.get("productId") ?? "").trim();
    if (!productId) {
      return NextResponse.json(
        fail("productId is required.", "VALIDATION"),
        { status: 422 },
      );
    }

    const resolution = await resolveEffectiveStoreId(currentUser, url.searchParams.get("storeId"));
    if (!resolution.ok) {
      return NextResponse.json(fail(resolution.message, resolution.code), {
        status: resolution.status,
      });
    }
    const storeId = resolution.storeId;

    // Defensive: only respond for INVENTORY_ITEM with serial tracking on.
    // Vouchers have their own endpoint.
    const product = await prisma.accountingProduct.findUnique({
      where: { id: productId },
      select: { itemType: true, serialTrackingEnabled: true },
    });
    if (!product || product.itemType !== "INVENTORY_ITEM" || !product.serialTrackingEnabled) {
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
        // Active = NOT referenced via productSerialId by any DRAFT or
        // COMPLETED bill. Vouchers also live in this same serial table
        // but use voucherSerialId, so we don't need to look at that one.
        posBillProductLines: {
          where: { posBill: { status: { in: ["DRAFT", "COMPLETED"] } } },
          select: { id: true },
        },
        // Invoice-side lock — any DRAFT or APPROVED invoice line that
        // already grabbed this serial. Stops POS from double-selling
        // a serial that was just sold via an invoice.
        invoiceLines: {
          where: { invoice: { status: { in: ["DRAFT", "APPROVED"] } } },
          select: { id: true },
        },
      },
      orderBy: { serialNumber: "asc" },
    });

    const items: ActiveProductSerial[] = serials
      .filter(
        (s) =>
          s.posBillProductLines.length === 0 && s.invoiceLines.length === 0,
      )
      .map((s) => ({ serialId: s.id, serialNumber: s.serialNumber }));

    return NextResponse.json(
      ok({ items }, "Active product serials fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[PRODUCT SERIAL ACTIVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
