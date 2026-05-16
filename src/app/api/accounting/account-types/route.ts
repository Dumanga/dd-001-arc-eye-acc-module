import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAccountAccess } from "@/lib/accounting/account-classifications";
import type { AccountingAccountTypeOption } from "@/lib/accounting/chart-of-accounts-types";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const categoryId = (searchParams.get("categoryId") ?? "").trim();

    if (!categoryId) {
      return NextResponse.json(fail("Account category id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const items = await prisma.accountingAccountType.findMany({
      where: {
        categoryId,
        isActive: true,
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        requiresCurrency: true,
      },
    });

    return NextResponse.json(ok<AccountingAccountTypeOption[]>(items, "Account types fetched."), {
      status: 200,
    });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
