import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { prisma } from "@/lib/db";

export type StockReportBranchRow = {
  storeId: string;
  storeCode: string;
  storeName: string;
  qtyOnHand: string;
};

export type StockReportItem = {
  id: string;
  code: string;
  name: string;
  itemType: "INVENTORY_ITEM" | "VOUCHER";
  status: string;
  uomBase: string;
  costPrice: string;
  salesPrice: string;
  totalQtyOnHand: string;
  totalStockValue: string; // qty × costPrice (informational; uses static costPrice)
  branchStock: StockReportBranchRow[];
};

export type StockReportKpis = {
  totalProducts: number;
  totalUnits: string;
  totalValueLkr: string;
  lowStockCount: number;
  outOfStockCount: number;
};

const LOW_STOCK_THRESHOLD = 5;

function formatNumber(value: number) {
  return value.toFixed(2);
}

function trimQty(value: number): string {
  // Display qty without trailing decimals when whole.
  if (Number.isInteger(value)) return value.toString();
  return value.toString();
}

// GET /api/accounting/inventory/stock-report
//
// Returns a per-product stock-on-hand snapshot for the Stock Report page.
// Branch users are scoped to their assigned branch (per-branch qty only);
// super admins see all branches by default and can slice via ?storeId=<id>.
//
// For each product the response includes total qty on hand, per-branch
// breakdown (when applicable), and a computed stock value at the static
// `product.costPrice` (UI hint only — the GL inventory account value comes
// from posted journal rows, which can drift from qty × static costPrice
// under moving-average cost — that's the trade-off the system already
// accepts per accounting-theories.md § "Inventory Quantity Versus Value").
export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "inventory", "customers", "suppliers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedStoreId = url.searchParams.get("storeId");

    const storeScope = getListStoreFilter(currentUser, requestedStoreId);
    if (!storeScope.ok) {
      return NextResponse.json(fail(storeScope.message, storeScope.code), {
        status: storeScope.status,
      });
    }
    const branchStockWhere = storeScope.where ?? {};

    const products = await prisma.accountingProduct.findMany({
      where: {
        itemType: { in: ["INVENTORY_ITEM", "VOUCHER"] },
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
      select: {
        id: true,
        code: true,
        purchaseName: true,
        salesName: true,
        itemType: true,
        status: true,
        costPrice: true,
        salesPrice: true,
        uomCategory: { select: { baseUnitName: true } },
        branchStock: {
          where: branchStockWhere,
          select: {
            qtyOnHand: true,
            store: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    let totalUnits = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const items: StockReportItem[] = products.map((p) => {
      const totalQtyOnHand = p.branchStock.reduce(
        (sum, b) => sum + Number(b.qtyOnHand),
        0,
      );
      const cost = Number(p.costPrice ?? 0);
      const stockValue = totalQtyOnHand * cost;
      totalUnits += totalQtyOnHand;
      totalValue += stockValue;
      if (totalQtyOnHand <= 0) {
        outOfStockCount += 1;
      } else if (totalQtyOnHand <= LOW_STOCK_THRESHOLD) {
        lowStockCount += 1;
      }

      return {
        id: p.id,
        code: p.code,
        name: p.salesName ?? p.purchaseName ?? p.code,
        itemType: p.itemType as "INVENTORY_ITEM" | "VOUCHER",
        status: p.status,
        uomBase: p.uomCategory?.baseUnitName ?? "",
        costPrice: formatNumber(cost),
        salesPrice: formatNumber(Number(p.salesPrice ?? 0)),
        totalQtyOnHand: trimQty(totalQtyOnHand),
        totalStockValue: formatNumber(stockValue),
        branchStock: p.branchStock
          .map((b) => ({
            storeId: b.store.id,
            storeCode: b.store.code,
            storeName: b.store.name,
            qtyOnHand: trimQty(Number(b.qtyOnHand)),
          }))
          .sort((a, b) => a.storeCode.localeCompare(b.storeCode)),
      };
    });

    const kpis: StockReportKpis = {
      totalProducts: items.length,
      totalUnits: trimQty(totalUnits),
      totalValueLkr: formatNumber(totalValue),
      lowStockCount,
      outOfStockCount,
    };

    return NextResponse.json(ok({ items, kpis }, "Stock report fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[STOCK REPORT]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
