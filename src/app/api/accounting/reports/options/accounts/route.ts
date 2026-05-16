// GET /api/accounting/reports/options/accounts?q=&take=
//
// Chart-of-accounts search for the Reports filter pickers AND the
// Expense Voucher account picker. Returns id, code, name, plus the
// account's category (Assets / Liabilities / Equity / Income /
// Expenses) so the Expense Voucher form can:
//   - group accounts by category in the dropdown (UX)
//   - auto-determine Dr/Cr placement based on category (accounting)
//
// The shared /api/accounting/accounts/options endpoint REQUIRES a
// category param (it's wired for product forms that always pick
// within a category), which is wrong for the reports / voucher
// use-cases where we want any account across all categories.

import { NextResponse } from "next/server";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export type ReportAccountOption = {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  typeName: string;
};

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports", "accounts"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const categoryCode = url.searchParams.get("categoryCode")?.trim() ?? "";
    const typeName = url.searchParams.get("typeName")?.trim() ?? "";
    const takeRaw = Number(url.searchParams.get("take") ?? "200");
    // Wider default so the categorised picker can show every account
    // in a single fetch (the chart-of-accounts table is small — tens
    // of rows in practice).
    const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 200;

    const rows = await prisma.chartOfAccount.findMany({
      where: {
        isActive: true,
        ...(categoryCode || typeName
          ? {
              type: {
                ...(categoryCode ? { category: { code: categoryCode } } : {}),
                ...(typeName ? { name: typeName } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q } },
                { name: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: "asc" }],
      take,
      select: {
        id: true,
        code: true,
        name: true,
        type: {
          select: {
            name: true,
            category: { select: { code: true, name: true } },
          },
        },
      },
    });

    const items: ReportAccountOption[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      categoryCode: r.type.category.code,
      categoryName: r.type.category.name,
      typeName: r.type.name,
    }));

    return NextResponse.json(ok({ items }, "Accounts fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT OPTIONS ACCOUNTS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
