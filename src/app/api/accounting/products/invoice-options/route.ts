import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type InvoiceProductOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: string;
  uomName: string;
  uomBase: string;
  uomCode: string;
  uomMinQty: string;
  stockOnHand: string;
  // Exposed so the invoice form can refuse to add serial-tracked
  // products until proper per-serial selection is built into the
  // invoice flow. POS is the only sales path that handles serials
  // end-to-end today.
  serialTrackingEnabled: boolean;
};

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? String(PAGE_SIZE))));

    // Service items have no inventory leg, so their stockOnHand stays at 0
    // forever. Without the OR below they'd be filtered out of the invoice
    // picker even though they're sellable. The `stockOnHand > 0` gate
    // applies only to INVENTORY_ITEM rows — services, vouchers, and groups
    // pass through regardless.
    const where = {
      status: "ACTIVE" as const,
      tradeMode: { in: ["SELL", "BOTH"] as ("SELL" | "BOTH")[] },
      OR: [
        { itemType: { not: "INVENTORY_ITEM" as const } },
        { stockOnHand: { gt: 0 } },
      ],
      ...(query
        ? {
            AND: [
              {
                OR: [
                  { code: { contains: query } },
                  { salesName: { contains: query } },
                  { purchaseName: { contains: query } },
                ],
              },
            ],
          }
        : {}),
    };

    // Fetch one extra to determine hasMore
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
        serialTrackingEnabled: true,
        uomCategory: {
          select: {
            name: true,
            baseUnitName: true,
            code: true,
            defaultSmallestAllowedQty: true,
          },
        },
      },
    });

    const hasMore = products.length > take;
    const page = products.slice(0, take);

    const items: InvoiceProductOption[] = page.map((p) => {
      const price = p.salesPrice ?? p.costPrice;
      return {
        id: p.id,
        code: p.code,
        name: p.salesName ?? p.purchaseName ?? p.code,
        description: "",
        price: price ? price.toFixed(2) : "0.00",
        uomName: p.uomCategory.name,
        uomBase: p.uomCategory.baseUnitName,
        uomCode: p.uomCategory.code,
        uomMinQty: p.uomCategory.defaultSmallestAllowedQty.toString(),
        stockOnHand: Number(p.stockOnHand).toString(),
        serialTrackingEnabled: p.serialTrackingEnabled,
      };
    });

    return NextResponse.json(
      ok({ items, hasMore }, "Invoice product options fetched."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/accounting/products/invoice-options]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
