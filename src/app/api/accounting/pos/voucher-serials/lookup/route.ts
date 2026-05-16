// GET /api/accounting/pos/voucher-serials/lookup?serial=<barcode-or-serial>
//
// Looks up an ISSUED voucher serial (per theory § 7.4 redemption flow)
// by scanned/typed serial number. Returns the serial id + voucher
// product face value, OR an explanation of why it can't be redeemed
// (NOT_FOUND, ACTIVE-not-yet-sold, ALREADY_REDEEMED).
//
// State derivation (no explicit `state` column on the serial table):
//   • exists in `accountinggoodsreceiptlineserial`           → row found
//   • referenced by a COMPLETED bill line → ISSUED (sold once)
//   • referenced by a COMPLETED bill payment as REDEEM_VOUCHER → REDEEMED
//
// Only ISSUED serials are returnable as redemption candidates.

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type VoucherSerialLookupResult = {
  serialId: string;
  serialNumber: string;
  faceValue: string;
  productCode: string;
  productName: string;
  state: "ACTIVE" | "ISSUED" | "REDEEMED";
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const serialQ = (url.searchParams.get("serial") ?? "").trim();
    if (!serialQ) {
      return NextResponse.json(
        fail("Voucher serial is required.", "VALIDATION"),
        { status: 422 },
      );
    }

    const serial = await prisma.accountingGoodsReceiptLineSerial.findFirst({
      where: { serialNumber: serialQ },
      include: {
        line: {
          select: {
            product: {
              select: {
                id: true,
                code: true,
                salesName: true,
                purchaseName: true,
                itemType: true,
                salesPrice: true,
              },
            },
          },
        },
        posBillLines: {
          where: { posBill: { status: "COMPLETED" } },
          select: { id: true },
        },
        posBillPayments: {
          where: { method: "REDEEM_VOUCHER", bill: { status: "COMPLETED" } },
          select: { id: true },
        },
      },
    });

    if (!serial) {
      return NextResponse.json(
        fail(`Voucher serial "${serialQ}" not found.`, "NOT_FOUND"),
        { status: 404 },
      );
    }

    if (serial.line.product.itemType !== "VOUCHER") {
      return NextResponse.json(
        fail(
          `Serial "${serialQ}" belongs to a non-voucher product.`,
          "NOT_VOUCHER",
        ),
        { status: 422 },
      );
    }

    let state: "ACTIVE" | "ISSUED" | "REDEEMED";
    if (serial.posBillPayments.length > 0) state = "REDEEMED";
    else if (serial.posBillLines.length > 0) state = "ISSUED";
    else state = "ACTIVE";

    if (state === "ACTIVE") {
      return NextResponse.json(
        fail(
          `Voucher "${serialQ}" hasn't been sold yet — only issued vouchers can be redeemed.`,
          "VOUCHER_NOT_ISSUED",
        ),
        { status: 422 },
      );
    }
    if (state === "REDEEMED") {
      return NextResponse.json(
        fail(`Voucher "${serialQ}" was already redeemed.`, "VOUCHER_REDEEMED"),
        { status: 409 },
      );
    }

    const result: VoucherSerialLookupResult = {
      serialId: serial.id,
      serialNumber: serial.serialNumber,
      faceValue: Number(serial.line.product.salesPrice ?? 0).toFixed(2),
      productCode: serial.line.product.code,
      productName:
        serial.line.product.salesName ??
        serial.line.product.purchaseName ??
        serial.line.product.code,
      state,
    };
    return NextResponse.json(ok(result, "Voucher serial found."), {
      status: 200,
    });
  } catch (err) {
    console.error("[VOUCHER LOOKUP]", err);
    return NextResponse.json(
      fail("Unexpected server error.", "SERVER_ERROR"),
      { status: 500 },
    );
  }
}
