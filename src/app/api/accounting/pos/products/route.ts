import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";
import { getDraftReservedQtyByProduct } from "@/lib/accounting/pos-bill";

export type PosProductOption = {
  id: string;
  code: string;
  name: string;
  itemType: "INVENTORY_ITEM" | "VOUCHER";
  // Inventory items can be serial-tracked. When true, the POS UI must
  // open a serial picker (mirroring the voucher serial picker) before
  // posting the add-line call. See pos-integration-flow.md § 3.2.
  serialTrackingEnabled: boolean;
  uomBase: string;
  uomMinQty: string;
  salesPrice: string;
  // Raw stock on hand at the requested branch (database `qtyOnHand`).
  branchQtyOnHand: string;
  // What other cashiers — and the cashier rendering this list —
  // actually see as available, after subtracting qty already in
  // DRAFT-status bill lines at this branch. Per
  // pos-integration-flow.md § 3.2 / § 8.2.
  branchAvailableQty: string;
};

const PAGE_SIZE = 24;

// GET /api/accounting/pos/products?storeId=<id>&q=<query>&skip=<n>&take=<m>
//
// Returns the products available to sell at a specific branch, filtered to
// inventory items + vouchers that have stock at the requested branch.
// Search matches against `code` (treated as the barcode equivalent until a
// dedicated barcode column lands) and the product's purchase / sales name.
//
// Branch users are silently locked to their assigned `storeId` — any
// attempt to peek at another branch via the query param is ignored.
export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "pos", "customers", "inventory"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? String(PAGE_SIZE))));

    // Branch scoping: branch users hard-locked to their own storeId; super
    // admin must specify a branch (POS is intentionally not "all branches").
    let effectiveStoreId: string;
    if (currentUser.role === "SUPER_ADMIN") {
      if (!requestedStoreId) {
        return NextResponse.json(
          fail("Pick a branch first.", "STORE_REQUIRED"),
          { status: 422 },
        );
      }
      effectiveStoreId = requestedStoreId;
    } else if (!currentUser.storeId) {
      return NextResponse.json(
        fail("Your account is not assigned to a branch.", "USER_NO_STORE"),
        { status: 403 },
      );
    } else {
      effectiveStoreId = currentUser.storeId;
    }

    const products = await prisma.accountingProduct.findMany({
      where: {
        itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
        tradeMode: { in: ["SELL", "BOTH"] },
        status: "ACTIVE",
        branchStock: {
          some: {
            storeId: effectiveStoreId,
            qtyOnHand: { gt: 0 },
          },
        },
        ...(query
          ? {
              OR: [
                { code: { contains: query } },
                { purchaseName: { contains: query } },
                { salesName: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: "asc" }],
      skip,
      take: take + 1,
      select: {
        id: true,
        code: true,
        purchaseName: true,
        salesName: true,
        itemType: true,
        serialTrackingEnabled: true,
        salesPrice: true,
        costPrice: true,
        uomCategory: { select: { baseUnitName: true, defaultSmallestAllowedQty: true } },
        branchStock: {
          where: { storeId: effectiveStoreId },
          select: { qtyOnHand: true },
        },
      },
    });

    const hasMore = products.length > take;
    const page = products.slice(0, take);

    // Reservation join — subtract qty already locked in DRAFT bill
    // lines (live OR held) at this branch from the visible stock
    // count. See pos-integration-flow.md § 3.2 / § 8.2 for the worked
    // example: two cashiers, one item, one cashier already added it
    // to a bill → second cashier sees zero available.
    const reservedMap = await getDraftReservedQtyByProduct(
      prisma,
      effectiveStoreId,
      page.map((p) => p.id),
    );

    const itemsAll: PosProductOption[] = page.map((p) => {
      const branchQty = Number(p.branchStock[0]?.qtyOnHand ?? 0);
      const reserved = reservedMap.get(p.id) ?? 0;
      const available = Math.max(0, branchQty - reserved);
      // Default to the cost price if no sales price is set — defensive
      // fallback for products that haven't had their sales side filled in.
      const salesPrice = Number(p.salesPrice ?? p.costPrice ?? 0);
      return {
        id: p.id,
        code: p.code,
        name: p.salesName ?? p.purchaseName ?? p.code,
        itemType: p.itemType as "INVENTORY_ITEM" | "VOUCHER",
        serialTrackingEnabled: p.serialTrackingEnabled,
        uomBase: p.uomCategory?.baseUnitName ?? "",
        uomMinQty: Number(p.uomCategory?.defaultSmallestAllowedQty ?? 1).toString(),
        salesPrice: salesPrice.toFixed(2),
        branchQtyOnHand: branchQty.toString(),
        branchAvailableQty: available.toString(),
      };
    });

    // Hide products with zero AVAILABLE qty from the picker — even
    // if qtyOnHand > 0, if every unit is reserved by other cashiers
    // we treat it as out-of-stock for now. The cashier sees the row
    // disappear; if a competing cashier deletes their line, the row
    // reappears on next product-list fetch.
    const items = itemsAll.filter((item) => Number(item.branchAvailableQty) > 0);

    return NextResponse.json(
      ok({ items, hasMore, storeId: effectiveStoreId }, "POS products fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[POS PRODUCTS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
