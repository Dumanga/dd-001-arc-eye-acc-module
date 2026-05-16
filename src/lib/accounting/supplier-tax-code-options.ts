import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SUPPLIER_TAX_CODE_OPTIONS_PAGE_SIZE,
  type SupplierTaxCodeOption,
  type SupplierTaxCodeOptionsPayload,
} from "@/lib/accounting/supplier-types";

const MAX_TAX_CODE_OPTIONS_LIMIT = 50;

type SupplierTaxCodeCursor = {
  code: string;
  name: string;
  id: string;
};

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return SUPPLIER_TAX_CODE_OPTIONS_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_TAX_CODE_OPTIONS_LIMIT);
}

function encodeCursor(input: SupplierTaxCodeCursor) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function decodeCursor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SupplierTaxCodeCursor>;

    if (
      typeof parsed.code !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }

    return parsed as SupplierTaxCodeCursor;
  } catch {
    return null;
  }
}

function serializeTaxCodeOption(input: { id: string; code: string; name: string }): SupplierTaxCodeOption {
  return {
    id: input.id,
    label: `${input.code} - ${input.name}`,
  };
}

function buildBaseWhere(query: string): Prisma.TaxCodeWhereInput {
  const normalizedQuery = query.trim();

  return {
    isActive: true,
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

function buildAfterCursorWhere(cursor: SupplierTaxCodeCursor): Prisma.TaxCodeWhereInput {
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

export async function searchSupplierTaxCodeOptions(input: {
  query?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<SupplierTaxCodeOptionsPayload> {
  const query = input.query?.trim() ?? "";
  const limit = normalizeLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const baseWhere = buildBaseWhere(query);

  const items = await prisma.taxCode.findMany({
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
    },
  });

  const hasMore = items.length > limit;
  const visibleItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore
    ? encodeCursor({
        code: visibleItems[visibleItems.length - 1].code,
        name: visibleItems[visibleItems.length - 1].name,
        id: visibleItems[visibleItems.length - 1].id,
      })
    : null;

  return {
    items: visibleItems.map(serializeTaxCodeOption),
    nextCursor,
    hasMore,
  };
}
