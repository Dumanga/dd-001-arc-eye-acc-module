import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAccountAccess } from "@/lib/accounting/account-classifications";
import type {
  ChartOfAccountFormValues,
  ChartOfAccountRecord,
  ChartOfAccountsCategoryView,
  ChartOfAccountSubtypeGroup,
} from "@/lib/accounting/chart-of-accounts-types";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeAccount(input: {
  id: string;
  code: string;
  name: string;
  currencyCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string;
  categoryName: string;
  typeId: string;
  typeName: string;
  subtypeId: string;
  subtypeName: string;
  requiresCurrency: boolean;
  hasJournalEntries: boolean;
}): ChartOfAccountRecord {
  return {
    id: input.id,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    typeId: input.typeId,
    typeName: input.typeName,
    subtypeId: input.subtypeId,
    subtypeName: input.subtypeName,
    code: input.code,
    name: input.name,
    currencyCode: input.currencyCode,
    isActive: input.isActive,
    requiresCurrency: input.requiresCurrency,
    hasJournalEntries: input.hasJournalEntries,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

async function resolveChartHierarchy(categoryId: string) {
  return prisma.accountingAccountCategory.findFirst({
    where: {
      id: categoryId,
      isActive: true,
    },
    include: {
      accountTypes: {
        where: {
          isActive: true,
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          accountSubtypes: {
            where: {
              isActive: true,
            },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            include: {
              chartAccounts: {
                where: {
                  isActive: true,
                },
                orderBy: [{ code: "asc" }, { createdAt: "asc" }],
                include: {
                  _count: { select: { journalEntries: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function buildCategoryPayload(categoryId: string): Promise<ChartOfAccountsCategoryView | null> {
  const category = await resolveChartHierarchy(categoryId);

  if (!category) {
    return null;
  }

  const subtypes: ChartOfAccountSubtypeGroup[] = category.accountTypes.flatMap((type) =>
    type.accountSubtypes.map((subtype) => ({
      id: subtype.id,
      name: subtype.name,
      description: subtype.description,
      typeId: type.id,
      typeName: type.name,
      requiresCurrency: type.requiresCurrency,
      accounts: subtype.chartAccounts.map((account) =>
        serializeAccount({
          id: account.id,
          code: account.code,
          name: account.name,
          currencyCode: account.currencyCode,
          isActive: account.isActive,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          categoryId: category.id,
          categoryName: category.name,
          typeId: type.id,
          typeName: type.name,
          subtypeId: subtype.id,
          subtypeName: subtype.name,
          requiresCurrency: type.requiresCurrency,
          hasJournalEntries: account._count.journalEntries > 0,
        })
      ),
    }))
  );

  const accountCount = subtypes.reduce((count, subtype) => count + subtype.accounts.length, 0);

  return {
    category: {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      accountCount,
      subtypeCount: subtypes.length,
    },
    accountCount,
    subtypeCount: subtypes.length,
    subtypes,
  };
}

async function validateHierarchy(form: ChartOfAccountFormValues) {
  const subtype = await prisma.accountingAccountSubtype.findFirst({
    where: {
      id: form.accountSubtypeId,
      isActive: true,
    },
    include: {
      type: {
        include: {
          category: true,
        },
      },
    },
  });

  if (!subtype || !subtype.type.isActive || !subtype.type.category.isActive) {
    return {
      error: NextResponse.json(
        fail("Selected account hierarchy is not available.", "VALIDATION_ERROR"),
        { status: 400 }
      ),
    };
  }

  if (
    subtype.typeId !== form.accountTypeId ||
    subtype.type.categoryId !== form.accountCategoryId
  ) {
    return {
      error: NextResponse.json(
        fail("Account category, type, and subtype do not match.", "VALIDATION_ERROR"),
        { status: 400 }
      ),
    };
  }

  return { subtype };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const categoryId = normalizeText(searchParams.get("categoryId"));

    if (!categoryId) {
      return NextResponse.json(
        fail("Account category id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const payload = await buildCategoryPayload(categoryId);

    if (!payload) {
      return NextResponse.json(
        fail("Account category not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(ok(payload, "Chart of accounts fetched."), {
      status: 200,
    });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as Partial<ChartOfAccountFormValues>;
    const form: ChartOfAccountFormValues = {
      accountCategoryId: normalizeText(body.accountCategoryId),
      accountTypeId: normalizeText(body.accountTypeId),
      accountSubtypeId: normalizeText(body.accountSubtypeId),
      accountCode: normalizeText(body.accountCode),
      accountName: normalizeText(body.accountName),
      currency: normalizeText(body.currency).toUpperCase(),
    };

    if (!form.accountCategoryId || !form.accountTypeId || !form.accountSubtypeId) {
      return NextResponse.json(
        fail("Account category, type, and subtype are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!form.accountCode) {
      return NextResponse.json(fail("Account code is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (form.accountCode.length > 30) {
      return NextResponse.json(
        fail("Account code must be 30 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!form.accountName) {
      return NextResponse.json(fail("Account name is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (form.accountName.length > 120) {
      return NextResponse.json(
        fail("Account name must be 120 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const hierarchy = await validateHierarchy(form);
    if ("error" in hierarchy) {
      return hierarchy.error;
    }

    const currencyCode = hierarchy.subtype.type.requiresCurrency
      ? form.currency
      : null;

    if (hierarchy.subtype.type.requiresCurrency && !currencyCode) {
      return NextResponse.json(
        fail("Currency is required for this account type.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const created = await prisma.chartOfAccount.create({
      data: {
        categoryId: hierarchy.subtype.type.categoryId,
        typeId: hierarchy.subtype.typeId,
        subtypeId: hierarchy.subtype.id,
        code: form.accountCode,
        name: form.accountName,
        currencyCode,
      },
      include: {
        category: true,
        type: true,
        subtype: true,
      },
    });

    return NextResponse.json(
      ok(
        serializeAccount({
          id: created.id,
          code: created.code,
          name: created.name,
          currencyCode: created.currencyCode,
          isActive: created.isActive,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          categoryId: created.categoryId,
          categoryName: created.category.name,
          typeId: created.typeId,
          typeName: created.type.name,
          subtypeId: created.subtypeId,
          subtypeName: created.subtype.name,
          requiresCurrency: created.type.requiresCurrency,
          hasJournalEntries: false,
        }),
        "Account created."
      ),
      { status: 201 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(fail("Account code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      id?: unknown;
      accountCode?: unknown;
      accountName?: unknown;
    };
    const id = normalizeText(body.id);
    const accountCode = normalizeText(body.accountCode);
    const accountName = normalizeText(body.accountName);

    if (!id) {
      return NextResponse.json(fail("Account id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (!accountCode) {
      return NextResponse.json(fail("Account code is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (accountCode.length > 30) {
      return NextResponse.json(
        fail("Account code must be 30 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!accountName) {
      return NextResponse.json(fail("Account name is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (accountName.length > 120) {
      return NextResponse.json(
        fail("Account name must be 120 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    // Lock account code edits once any journal entries reference this account.
    // The journal-row snapshot already protects historical reports, but allowing
    // a code change after activity exists creates ambiguity ("which code is the
    // current one?") — so we freeze it. The name remains editable in either
    // state. New rule per accounting-theories.md "Why Snapshots?" + the
    // account-edit safety convention.
    const existingAccount = await prisma.chartOfAccount.findUnique({
      where: { id },
      select: { code: true, _count: { select: { journalEntries: true } } },
    });
    if (!existingAccount) {
      return NextResponse.json(fail("Account not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (
      existingAccount.code !== accountCode &&
      existingAccount._count.journalEntries > 0
    ) {
      return NextResponse.json(
        fail(
          `Account code is locked because this account already has ${existingAccount._count.journalEntries} journal ` +
            "entries. The code must remain stable so historical reports stay consistent. " +
            "You can still edit the account name.",
          "ACCOUNT_CODE_LOCKED"
        ),
        { status: 409 }
      );
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id },
      data: {
        code: accountCode,
        name: accountName,
      },
      include: {
        category: true,
        type: true,
        subtype: true,
        _count: { select: { journalEntries: true } },
      },
    });

    return NextResponse.json(
      ok(
        serializeAccount({
          id: updated.id,
          code: updated.code,
          name: updated.name,
          currencyCode: updated.currencyCode,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          categoryId: updated.categoryId,
          categoryName: updated.category.name,
          typeId: updated.typeId,
          typeName: updated.type.name,
          subtypeId: updated.subtypeId,
          subtypeName: updated.subtype.name,
          requiresCurrency: updated.type.requiresCurrency,
          hasJournalEntries: updated._count.journalEntries > 0,
        }),
        "Account updated."
      ),
      { status: 200 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(fail("Account code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(fail("Account not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
