import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type PoProductOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: string;
  uomName: string;
  uomBase: string;
  uomCode: string;
  uomMinQty: string;
  serialTrackingEnabled: boolean;
};

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["inventory", "suppliers"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? String(PAGE_SIZE))));

    const where = {
      status: "ACTIVE" as const,
      tradeMode: { in: ["BUY", "BOTH"] as ("BUY" | "BOTH")[] },
      ...(query
        ? {
            OR: [
              { code: { contains: query } },
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
        purchaseName: true,
        costPrice: true,
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

    const items: PoProductOption[] = page.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.purchaseName ?? p.code,
      description: "",
      price: p.costPrice ? p.costPrice.toFixed(2) : "0.00",
      uomName: p.uomCategory.name,
      uomBase: p.uomCategory.baseUnitName,
      uomCode: p.uomCategory.code,
      uomMinQty: p.uomCategory.defaultSmallestAllowedQty.toString(),
      serialTrackingEnabled: p.serialTrackingEnabled,
    }));

    return NextResponse.json(ok({ items, hasMore }, "PO product options fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GET /api/accounting/products/po-options]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
