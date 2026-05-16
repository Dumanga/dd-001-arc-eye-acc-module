// POST /api/accounting/pos/bills/lines
//
// Body: { storeId?, productId, qty?, voucherSerialId? }
//
// Adds a line to the cashier's active DRAFT bill. If no active DRAFT
// exists, creates a new one and consumes the next POS form-id number
// (per pos-integration-flow.md § 8.4 — bill numbers are reserved at
// the moment the first line lands and never recycled).
//
// Reservation semantics (pos-integration-flow.md § 3.2): the
// `availableQty(productId, storeId)` math elsewhere subtracts the qty
// on every DRAFT-status line at this branch. So the moment this
// endpoint commits, every other cashier sees stock drop by `qty`.
//
// If a line for the same productId already exists on the bill (and
// the product is NOT a voucher), increment its qty instead of adding
// a second row. Voucher lines are always 1-qty per serial — adding a
// second voucher serial creates a separate line.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";
import {
  billQueryInclude,
  getDraftReservedQtyByProduct,
  getReservedProductSerialIds,
  getReservedVoucherSerialIds,
  getWalkInCustomerId,
  recomputeBillTotals,
  serializeBill,
  sweepStaleActiveDrafts,
} from "@/lib/accounting/pos-bill";
import { consumeFormIdInTx } from "@/lib/accounting/form-id-config";

function normString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseQty(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : 1;
  }
  return 1;
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedStoreId = normString(body.storeId);
    const productId = normString(body.productId);
    const voucherSerialId = normString(body.voucherSerialId) || null;
    const productSerialId = normString(body.productSerialId) || null;
    const qtyInput = parseQty(body.qty);

    if (!productId) {
      return NextResponse.json(fail("Product is required.", "VALIDATION"), { status: 422 });
    }
    if (qtyInput <= 0 || !Number.isFinite(qtyInput)) {
      return NextResponse.json(fail("Quantity must be greater than zero.", "VALIDATION"), {
        status: 422,
      });
    }

    const resolution = await resolveEffectiveStoreId(currentUser, requestedStoreId);
    if (!resolution.ok) {
      return NextResponse.json(fail(resolution.message, resolution.code), {
        status: resolution.status,
      });
    }
    const storeId = resolution.storeId;

    const result = await prisma.$transaction(async (tx) => {
      await sweepStaleActiveDrafts(tx);

      // Load the product including UOM + branch stock at this store
      const product = await tx.accountingProduct.findUnique({
        where: { id: productId },
        include: {
          uomCategory: { select: { baseUnitName: true, defaultSmallestAllowedQty: true } },
          branchStock: { where: { storeId }, select: { qtyOnHand: true } },
        },
      });
      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND:Product is not available.");
      }
      if (product.status !== "ACTIVE") {
        throw new Error("PRODUCT_INACTIVE:Product is not active.");
      }
      if (product.tradeMode !== "SELL" && product.tradeMode !== "BOTH") {
        throw new Error("PRODUCT_NOT_SELLABLE:Product is not configured for sale.");
      }
      if (product.itemType === "VOUCHER" && !voucherSerialId) {
        // Voucher products must arrive with a specific serial id picked
        // from the voucher-serial popup on the POS screen.
        throw new Error("VOUCHER_SERIAL_REQUIRED:Pick a voucher serial first.");
      }

      // Serial-tracked inventory items must arrive with a productSerialId.
      // Qty is forced to 1 (one bill line per serial). If the caller sent
      // qty > 1 we reject — the cashier must add another line for another
      // serial.
      const isSerialTrackedInventory =
        product.itemType === "INVENTORY_ITEM" && product.serialTrackingEnabled;
      if (isSerialTrackedInventory) {
        if (!productSerialId) {
          throw new Error("PRODUCT_SERIAL_REQUIRED:Pick a serial number for this product.");
        }
        if (qtyInput !== 1) {
          throw new Error(
            "SERIAL_QTY_INVALID:Serial-tracked products are sold one unit at a time — add another line for another serial."
          );
        }
      } else if (productSerialId) {
        // Caller passed a serial for a product that isn't serial-tracked.
        // Reject defensively so we don't end up with stray FKs.
        throw new Error(
          "PRODUCT_SERIAL_NOT_APPLICABLE:This product does not use serial-number tracking."
        );
      }

      // Reservation check — current branch qty minus everything in DRAFT
      // bill lines at this branch must have headroom for `qtyInput`.
      const onHand = Number(product.branchStock[0]?.qtyOnHand ?? 0);
      const reserved = await getDraftReservedQtyByProduct(tx, storeId, [productId]);
      const reservedQty = reserved.get(productId) ?? 0;
      const available = onHand - reservedQty;
      if (qtyInput > available + 1e-9) {
        throw new Error(
          `OUT_OF_STOCK:Only ${available.toFixed(2)} ${product.uomCategory?.baseUnitName ?? "unit"}(s) available at this branch.`
        );
      }

      // Voucher serial soft-lock check
      if (voucherSerialId) {
        const reservedSerials = await getReservedVoucherSerialIds(tx, storeId, [voucherSerialId]);
        if (reservedSerials.has(voucherSerialId)) {
          throw new Error("VOUCHER_SERIAL_RESERVED:That voucher serial is already on another bill.");
        }
      }

      // Product serial soft-lock check + branch/product match.
      if (productSerialId) {
        const serial = await tx.accountingGoodsReceiptLineSerial.findUnique({
          where: { id: productSerialId },
          select: {
            serialNumber: true,
            line: { select: { productId: true, goodsReceipt: { select: { storeId: true } } } },
          },
        });
        if (!serial) {
          throw new Error("PRODUCT_SERIAL_NOT_FOUND:That serial number was not found.");
        }
        if (serial.line.productId !== productId) {
          throw new Error("PRODUCT_SERIAL_MISMATCH:Serial does not belong to the selected product.");
        }
        if (serial.line.goodsReceipt.storeId !== storeId) {
          throw new Error("PRODUCT_SERIAL_WRONG_BRANCH:Serial is not in stock at this branch.");
        }
        const reservedProd = await getReservedProductSerialIds(tx, storeId, [productSerialId]);
        if (reservedProd.has(productSerialId)) {
          throw new Error(
            `PRODUCT_SERIAL_RESERVED:Serial "${serial.serialNumber}" is already on another bill.`
          );
        }
      }

      // Find or create the active draft for this cashier
      let draft = await tx.accountingPosBill.findFirst({
        where: { cashierId: currentUser.id, storeId, status: "DRAFT", isHeld: false },
        select: { id: true },
      });

      if (!draft) {
        // Mint a new bill — consume the next POS form-id number
        // (atomically, with row lock on the form-id config table).
        const { formId } = await consumeFormIdInTx(tx, "POS");

        // Resolve the customerId — defaults to the seeded walk-in
        // record. The POS screen can later patch the bill to a real
        // customer via the (future) /bills/[id] PATCH endpoint.
        const walkInId = await getWalkInCustomerId();

        draft = await tx.accountingPosBill.create({
          data: {
            billNo: formId,
            status: "DRAFT",
            isHeld: false,
            storeId,
            cashierId: currentUser.id,
            customerId: walkInId,
          },
          select: { id: true },
        });
      }

      // Re-stamp lastActivityAt regardless of whether we incremented or inserted.
      // Voucher lines are 1-per-serial; serial-tracked inventory lines are
      // 1-per-serial too. For non-serial inventory items, merge by productId.
      const isVoucher = product.itemType === "VOUCHER";

      if (!isVoucher && !isSerialTrackedInventory) {
        const existing = await tx.accountingPosBillLine.findFirst({
          where: { billId: draft.id, productId, voucherSerialId: null, productSerialId: null },
          select: { id: true, quantity: true, unitPrice: true, discount: true, lineOrder: true },
        });
        if (existing) {
          const newQty = Number(existing.quantity) + qtyInput;
          const newLineTotal = newQty * Number(existing.unitPrice) - Number(existing.discount);
          await tx.accountingPosBillLine.update({
            where: { id: existing.id },
            data: {
              quantity: new Prisma.Decimal(newQty.toFixed(4)),
              lineTotal: new Prisma.Decimal(newLineTotal.toFixed(4)),
            },
          });
          await recomputeBillTotals(tx, draft.id);
          return tx.accountingPosBill.findUniqueOrThrow({
            where: { id: draft.id },
            include: billQueryInclude,
          });
        }
      }

      // Insert a fresh line. Snapshot product fields onto the row.
      const unitPrice = Number(product.salesPrice ?? 0);
      const lineTotal = unitPrice * qtyInput;
      const lastLine = await tx.accountingPosBillLine.findFirst({
        where: { billId: draft.id },
        orderBy: { lineOrder: "desc" },
        select: { lineOrder: true },
      });
      const lineOrder = (lastLine?.lineOrder ?? -1) + 1;

      await tx.accountingPosBillLine.create({
        data: {
          billId: draft.id,
          productId,
          itemCode: product.code,
          itemName: product.salesName ?? product.purchaseName ?? product.code,
          quantity: new Prisma.Decimal(qtyInput.toFixed(4)),
          unitPrice: new Prisma.Decimal(unitPrice.toFixed(4)),
          discount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(lineTotal.toFixed(4)),
          uomName: product.uomCategory?.baseUnitName ?? "",
          uomBase: product.uomCategory?.baseUnitName ?? "",
          uomMinQty: new Prisma.Decimal(
            Number(product.uomCategory?.defaultSmallestAllowedQty ?? 1).toFixed(4)
          ),
          voucherSerialId,
          productSerialId,
          lineOrder,
        },
      });

      await recomputeBillTotals(tx, draft.id);
      return tx.accountingPosBill.findUniqueOrThrow({
        where: { id: draft.id },
        include: billQueryInclude,
      });
    });

    return NextResponse.json(ok({ bill: serializeBill(result) }, "Line added."), {
      status: 200,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes(":")) {
      const [code, ...rest] = err.message.split(":");
      const conflict = code === "OUT_OF_STOCK"
        || code === "VOUCHER_SERIAL_RESERVED"
        || code === "PRODUCT_SERIAL_RESERVED";
      return NextResponse.json(fail(rest.join(":") || "Unable to add line.", code), {
        status: conflict ? 409 : 422,
      });
    }
    console.error("[POS BILL ADD LINE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
