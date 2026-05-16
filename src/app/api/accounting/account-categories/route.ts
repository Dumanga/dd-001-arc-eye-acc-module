import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAccountAccess } from "@/lib/accounting/account-classifications";
import type { AccountingAccountCategoryOption } from "@/lib/accounting/chart-of-accounts-types";

export async function GET() {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const items = await prisma.accountingAccountCategory.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            chartAccounts: {
              where: {
                isActive: true,
              },
            },
          },
        },
        accountTypes: {
          where: {
            isActive: true,
          },
          select: {
            _count: {
              select: {
                accountSubtypes: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const payload: AccountingAccountCategoryOption[] = items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      accountCount: item._count.chartAccounts,
      subtypeCount: item.accountTypes.reduce(
        (count, type) => count + type._count.accountSubtypes,
        0
      ),
    }));

    return NextResponse.json(
      ok<AccountingAccountCategoryOption[]>(payload, "Account categories fetched."),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
