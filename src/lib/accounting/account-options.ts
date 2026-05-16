import type { Prisma } from "@prisma/client";
import {
  type TaxCodeAccountOption,
  type TaxCodeAccountOptionsPayload,
} from "@/lib/accounting/tax-code-types";
import { prisma } from "@/lib/db";

const DEFAULT_ACCOUNT_OPTIONS_LIMIT = 20;
const MAX_ACCOUNT_OPTIONS_LIMIT = 50;

type AccountOptionsCursor = {
  code: string;
  name: string;
  id: string;
};

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ACCOUNT_OPTIONS_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_ACCOUNT_OPTIONS_LIMIT);
}

function encodeCursor(input: AccountOptionsCursor) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function decodeCursor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AccountOptionsCursor>;

    if (
      typeof parsed.code !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }

    return parsed as AccountOptionsCursor;
  } catch {
    return null;
  }
}

function serializeAccountOption(account: { id: string; code: string; name: string }): TaxCodeAccountOption {
  return {
    id: account.id,
    label: `${account.code} ${account.name}`,
  };
}

function buildBaseWhere(input: {
  categoryCodes: string[];
  typeCode?: string;
  subtypeCode?: string;
  query: string;
}): Prisma.ChartOfAccountWhereInput {
  const normalizedCategoryCodes = input.categoryCodes
    .map((categoryCode) => categoryCode.trim())
    .filter(Boolean);
  const normalizedTypeCode = input.typeCode?.trim() ?? "";
  const normalizedSubtypeCode = input.subtypeCode?.trim() ?? "";
  const normalizedQuery = input.query.trim();

  return {
    isActive: true,
    category: {
      is: {
        code:
          normalizedCategoryCodes.length === 1
            ? normalizedCategoryCodes[0]
            : {
                in: normalizedCategoryCodes,
              },
        isActive: true,
      },
    },
    ...(normalizedTypeCode
      ? {
          type: {
            is: {
              code: normalizedTypeCode,
              isActive: true,
            },
          },
        }
      : {}),
    ...(normalizedSubtypeCode
      ? {
          subtype: {
            is: {
              code: normalizedSubtypeCode,
              isActive: true,
            },
          },
        }
      : {}),
    ...(normalizedQuery
      ? {
          OR: [
            {
              code: {
                contains: normalizedQuery,
              },
            },
            {
              name: {
                contains: normalizedQuery,
              },
            },
          ],
        }
      : {}),
  };
}

function buildAfterCursorWhere(cursor: AccountOptionsCursor): Prisma.ChartOfAccountWhereInput {
  return {
    OR: [
      {
        code: {
          gt: cursor.code,
        },
      },
      {
        code: cursor.code,
        name: {
          gt: cursor.name,
        },
      },
      {
        code: cursor.code,
        name: cursor.name,
        id: {
          gt: cursor.id,
        },
      },
    ],
  };
}

export async function searchAccountOptions(input: {
  categoryCodes: string[];
  typeCode?: string;
  subtypeCode?: string;
  query?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<TaxCodeAccountOptionsPayload> {
  const query = input.query?.trim() ?? "";
  const limit = normalizeLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const baseWhere = buildBaseWhere({
    categoryCodes: input.categoryCodes,
    typeCode: input.typeCode,
    subtypeCode: input.subtypeCode,
    query,
  });

  const accounts = await prisma.chartOfAccount.findMany({
    where: cursor
      ? {
          AND: [baseWhere, buildAfterCursorWhere(cursor)],
        }
      : baseWhere,
    orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      code: true,
      name: true,
      category: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  const hasMore = accounts.length > limit;
  const visibleAccounts = hasMore ? accounts.slice(0, limit) : accounts;
  const nextCursor = hasMore
    ? encodeCursor({
        code: visibleAccounts[visibleAccounts.length - 1].code,
        name: visibleAccounts[visibleAccounts.length - 1].name,
        id: visibleAccounts[visibleAccounts.length - 1].id,
      })
    : null;

  return {
    items: visibleAccounts.map((account) => ({
      ...serializeAccountOption(account),
      categoryCode: account.category.code,
      groupLabel: account.category.name,
    })),
    nextCursor,
    hasMore,
  };
}
