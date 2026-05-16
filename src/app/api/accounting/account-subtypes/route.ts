import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAccountAccess } from "@/lib/accounting/account-classifications";
import type { AccountingAccountSubtypeOption } from "@/lib/accounting/chart-of-accounts-types";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const typeId = (searchParams.get("typeId") ?? "").trim();

    if (!typeId) {
      return NextResponse.json(fail("Account type id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const items = await prisma.accountingAccountSubtype.findMany({
      where: {
        typeId,
        isActive: true,
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
      },
    });

    return NextResponse.json(
      ok<AccountingAccountSubtypeOption[]>(items, "Account subtypes fetched."),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
