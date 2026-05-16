// GET /api/accounting/reports/options/products?q=&take=
//
// Lightweight product search used by the reports filter pickers.
// Searches by code, salesName, or purchaseName. Returns id/code/name.

import { NextResponse } from "next/server";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export type ReportProductOption = {
  id: string;
  code: string;
  name: string;
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const takeRaw = Number(url.searchParams.get("take") ?? "20");
    const take = Number.isFinite(takeRaw) ? Math.min(50, Math.max(1, takeRaw)) : 20;

    const rows = await prisma.accountingProduct.findMany({
      where: {
        status: "ACTIVE",
        ...(q
          ? {
              OR: [
                { code: { contains: q } },
                { salesName: { contains: q } },
                { purchaseName: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: "asc" }],
      take,
      select: {
        id: true,
        code: true,
        salesName: true,
        purchaseName: true,
      },
    });

    const items: ReportProductOption[] = rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.salesName ?? p.purchaseName ?? p.code,
    }));

    return NextResponse.json(ok({ items }, "Products fetched."), { status: 200 });
  } catch (err) {
    console.error("[REPORT OPTIONS PRODUCTS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
