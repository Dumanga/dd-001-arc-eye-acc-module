// GET /api/accounting/products/issue-options?storeId=<id>&q=<query>&skip=<n>&take=<m>
//
// Product picker for the Material Issue Note form (accounting-theories.md §10).
// Differs from invoice-options in two ways:
//
//  1. Includes products in ALL trade modes — BUY, SELL, and BOTH. Material
//     Issue is for INTERNAL consumption, so buy-only items (cleaning
//     supplies, repair consumables that you never resell) must be pickable.
//
//  2. Filters to INVENTORY_ITEM only — service items + vouchers have no
//     physical stock to issue.
//
// Branch-aware: if `storeId` is supplied, the list is filtered to products
// with positive `qtyOnHand` at THAT specific branch (so you can't issue
// from a branch that has no stock).

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type IssueProductOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  // Tentative unit cost shown in the form preview. The GL posting uses
  // the lifetime weighted-average from GRN history at approval time.
  price: string;
  uomName: string;
  uomBase: string;
  uomCode: string;
  uomMinQty: string;
  // Available stock at the picked branch (decimal as string).
  stockOnHand: string;
};

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "accounts"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const storeId = searchParams.get("storeId")?.trim() ?? "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? String(PAGE_SIZE))));

    const where = {
      status: "ACTIVE" as const,
      itemType: "INVENTORY_ITEM" as const,
      // No tradeMode filter — BUY, SELL, BOTH all eligible for issue.
      ...(storeId
        ? {
            branchStock: {
              some: {
                storeId,
                qtyOnHand: { gt: 0 },
              },
            },
          }
        : { stockOnHand: { gt: 0 } }),
      ...(query
        ? {
            OR: [
              { code: { contains: query } },
              { salesName: { contains: query } },
              { purchaseName: { contains: query } },
            ],
          }
        : {}),
    };

    const products = await prisma.accountingProduct.findMany({
      where,
      orderBy: [{ code: "asc" }],
      skip,
      take: take + 1,
      select: {
        id: true,
        code: true,
        salesName: true,
        purchaseName: true,
        salesPrice: true,
        costPrice: true,
        stockOnHand: true,
        uomCategory: {
          select: {
            name: true,
            baseUnitName: true,
            code: true,
            defaultSmallestAllowedQty: true,
          },
        },
        ...(storeId
          ? {
              branchStock: {
                where: { storeId },
                select: { qtyOnHand: true },
              },
            }
          : {}),
      },
    });

    const hasMore = products.length > take;
    const page = products.slice(0, take);

    const items: IssueProductOption[] = page.map((p) => {
      // Show cost price first since this is an internal-consumption pick.
      // Fall back to sales price if cost isn't set.
      const tentativeCost = p.costPrice ?? p.salesPrice;
      const stock = storeId
        ? Number((p as { branchStock?: { qtyOnHand: unknown }[] }).branchStock?.[0]?.qtyOnHand ?? 0)
        : Number(p.stockOnHand);
      return {
        id: p.id,
        code: p.code,
        name: p.purchaseName ?? p.salesName ?? p.code,
        description: "",
        price: tentativeCost ? tentativeCost.toFixed(2) : "0.00",
        uomName: p.uomCategory.name,
        uomBase: p.uomCategory.baseUnitName,
        uomCode: p.uomCategory.code,
        uomMinQty: p.uomCategory.defaultSmallestAllowedQty.toString(),
        stockOnHand: stock.toString(),
      };
    });

    return NextResponse.json(
      ok({ items, hasMore }, "Issue product options fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/accounting/products/issue-options]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
