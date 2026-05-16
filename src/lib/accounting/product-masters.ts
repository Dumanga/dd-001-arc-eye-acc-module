import { prisma } from "@/lib/db";
import {
  PRODUCT_MASTER_OPTIONS_PAGE_SIZE,
  normalizeProductMasterName,
  toProductMasterNameLookup,
  type ProductMasterOption,
  type ProductMasterOptionsPayload,
  type ProductMasterType,
} from "@/lib/accounting/product-master-types";

const MAX_PRODUCT_MASTER_OPTIONS_LIMIT = 50;
const MAX_PRODUCT_MASTER_NAME_LENGTH = 120;

type ProductMasterCursor = {
  name: string;
  id: string;
};

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return PRODUCT_MASTER_OPTIONS_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_PRODUCT_MASTER_OPTIONS_LIMIT);
}

function encodeCursor(input: ProductMasterCursor) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function decodeCursor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ProductMasterCursor>;

    if (typeof parsed.name !== "string" || typeof parsed.id !== "string") {
      return null;
    }

    return parsed as ProductMasterCursor;
  } catch {
    return null;
  }
}

function serializeOption(input: { id: string; name: string }): ProductMasterOption {
  return {
    id: input.id,
    label: input.name,
  };
}

function buildBaseWhere(query: string) {
  const normalizedQuery = normalizeProductMasterName(query);

  return normalizedQuery
    ? {
        name: {
          contains: normalizedQuery,
        },
      }
    : {};
}

function buildAfterCursorWhere(cursor: ProductMasterCursor) {
  return {
    OR: [
      {
        name: {
          gt: cursor.name,
        },
      },
      {
        name: cursor.name,
        id: {
          gt: cursor.id,
        },
      },
    ],
  };
}

async function searchCategories(input: { query: string; cursor: ProductMasterCursor | null; limit: number }) {
  const baseWhere = buildBaseWhere(input.query);

  return prisma.accountingItemCategory.findMany({
    where: input.cursor
      ? {
          AND: [baseWhere, buildAfterCursorWhere(input.cursor)],
        }
      : baseWhere,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      name: true,
    },
  });
}

async function searchBrands(input: { query: string; cursor: ProductMasterCursor | null; limit: number }) {
  const baseWhere = buildBaseWhere(input.query);

  return prisma.accountingItemBrand.findMany({
    where: input.cursor
      ? {
          AND: [baseWhere, buildAfterCursorWhere(input.cursor)],
        }
      : baseWhere,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      name: true,
    },
  });
}

async function searchModels(input: { query: string; cursor: ProductMasterCursor | null; limit: number }) {
  const baseWhere = buildBaseWhere(input.query);

  return prisma.accountingItemModel.findMany({
    where: input.cursor
      ? {
          AND: [baseWhere, buildAfterCursorWhere(input.cursor)],
        }
      : baseWhere,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      name: true,
    },
  });
}

export async function searchProductMasterOptions(input: {
  type: ProductMasterType;
  query?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ProductMasterOptionsPayload> {
  const query = input.query?.trim() ?? "";
  const limit = normalizeLimit(input.limit);
  const cursor = decodeCursor(input.cursor);

  const items =
    input.type === "category"
      ? await searchCategories({ query, cursor, limit })
      : input.type === "brand"
        ? await searchBrands({ query, cursor, limit })
        : await searchModels({ query, cursor, limit });

  const hasMore = items.length > limit;
  const visibleItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore
    ? encodeCursor({
        name: visibleItems[visibleItems.length - 1].name,
        id: visibleItems[visibleItems.length - 1].id,
      })
    : null;

  return {
    items: visibleItems.map(serializeOption),
    nextCursor,
    hasMore,
  };
}

function validateName(name: string, type: ProductMasterType) {
  const normalizedName = normalizeProductMasterName(name);

  if (!normalizedName) {
    throw new Error(`${getTypeLabel(type)} name is required.`);
  }

  if (normalizedName.length > MAX_PRODUCT_MASTER_NAME_LENGTH) {
    throw new Error(`${getTypeLabel(type)} name must be ${MAX_PRODUCT_MASTER_NAME_LENGTH} characters or fewer.`);
  }

  return normalizedName;
}

function getTypeLabel(type: ProductMasterType) {
  switch (type) {
    case "category":
      return "Category";
    case "brand":
      return "Brand";
    default:
      return "Model";
  }
}

export async function createProductMasterOption(input: {
  type: ProductMasterType;
  name: string;
}): Promise<ProductMasterOption> {
  const normalizedName = validateName(input.name, input.type);
  const normalizedLookup = toProductMasterNameLookup(normalizedName);

  const created =
    input.type === "category"
      ? await prisma.accountingItemCategory.create({
          data: {
            name: normalizedName,
            normalizedName: normalizedLookup,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : input.type === "brand"
        ? await prisma.accountingItemBrand.create({
            data: {
              name: normalizedName,
              normalizedName: normalizedLookup,
            },
            select: {
              id: true,
              name: true,
            },
          })
        : await prisma.accountingItemModel.create({
            data: {
              name: normalizedName,
              normalizedName: normalizedLookup,
            },
            select: {
              id: true,
              name: true,
            },
          });

  return serializeOption(created);
}
