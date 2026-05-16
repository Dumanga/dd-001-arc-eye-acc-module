// GET /api/accounting/pos/voucher-serials/active?storeId=<id>&productId=<id>
//
// Returns the ACTIVE voucher serials for a voucher product at a
// branch — i.e. serials that came in via a GRN at this branch and
// haven't been referenced by any DRAFT or COMPLETED bill line yet.
//
// Used by the POS screen's voucher-add popup: cashier picks a
// product, the screen opens a popup listing serials returned by
// this endpoint, cashier selects one, and the add-line call passes
// the chosen `voucherSerialId`.
//
// State derivation (no explicit `state` column on the serial table):
//   • exists in `accountinggoodsreceiptlineserial` at this branch's GRN
//   • NOT referenced by any DRAFT bill line (would be soft-locked
//     in another cashier's cart) — per pos-integration-flow.md § 3.2
//   • NOT referenced by any COMPLETED bill line (already sold = ISSUED)
//
// Branch scoping: only serials whose source GRN is at the requested
// branch are returned, so a voucher received at MAIN-001 doesn't
// surface in JS-001's picker.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";

export type ActiveVoucherSerial = {
  serialId: string;
  serialNumber: string;
  faceValue: string;
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

    // Verify the product is a voucher (defensive — UI should only
    // call this for voucher products).
    const product = await prisma.accountingProduct.findUnique({
      where: { id: productId },
      select: { itemType: true, salesPrice: true },
    });
    if (!product || product.itemType !== "VOUCHER") {
      return NextResponse.json(
        fail("Product is not a voucher.", "NOT_VOUCHER"),
        { status: 422 },
      );
    }

    // Fetch all serials for this product whose source GRN is at the
    // resolved branch. Then filter out ones already referenced by
    // any DRAFT or COMPLETED bill line.
    const serials = await prisma.accountingGoodsReceiptLineSerial.findMany({
      where: {
        line: {
          productId,
          goodsReceipt: {
            storeId,
          },
        },
      },
      include: {
        posBillLines: {
          where: { posBill: { status: { in: ["DRAFT", "COMPLETED"] } } },
          select: { id: true },
        },
      },
      orderBy: { serialNumber: "asc" },
    });

    const items: ActiveVoucherSerial[] = serials
      .filter((s) => s.posBillLines.length === 0)
      .map((s) => ({
        serialId: s.id,
        serialNumber: s.serialNumber,
        faceValue: Number(product.salesPrice ?? 0).toFixed(2),
      }));

    return NextResponse.json(
      ok({ items }, "Active voucher serials fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[VOUCHER ACTIVE]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
