import type { Prisma } from "@prisma/client";
import {
  PRODUCT_LIST_PAGE_SIZE,
  buildProductAccountLabel,
  buildProductSupplierLabel,
  toProductTradeModeLabel,
  toProductItemTypeLabel,
  toProductStatusLabel,
  type ProductListSort,
  type ProductRecord,
  type ProductsPayload,
} from "@/lib/accounting/product-types";
import { prisma } from "@/lib/db";

export const productInclude = {
  itemCategory: {
    select: {
      id: true,
      name: true,
    },
  },
  itemBrand: {
    select: {
      id: true,
      name: true,
    },
  },
  itemModel: {
    select: {
      id: true,
      name: true,
    },
  },
  uomCategory: {
    select: {
      id: true,
      name: true,
    },
  },
  inventoryAccount: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  cogsAccount: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  incomeAccount: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  preferredSuppliers: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      supplier: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  branchStock: {
    select: {
      qtyOnHand: true,
      store: { select: { id: true, code: true, name: true } },
    },
    orderBy: { store: { code: "asc" } },
  },
} satisfies Prisma.AccountingProductInclude;

type ProductWithRelations = Prisma.AccountingProductGetPayload<{
  include: typeof productInclude;
}>;

function decimalToString(value: Prisma.Decimal | null | undefined) {
  if (!value) {
    return "";
  }

  const fixed = value.toFixed(4);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function serializeProduct(input: ProductWithRelations): ProductRecord {
  return {
    id: input.id,
    itemType: toProductItemTypeLabel(input.itemType),
    tradeMode: toProductTradeModeLabel(input.tradeMode),
    itemCode: input.code,
    itemCategoryId: input.itemCategoryId ?? "",
    itemCategoryLabel: input.itemCategory?.name ?? "",
    itemBrandId: input.itemBrandId ?? "",
    itemBrandLabel: input.itemBrand?.name ?? "",
    itemModelId: input.itemModelId ?? "",
    itemModelLabel: input.itemModel?.name ?? "",
    purchaseName: input.purchaseName ?? "",
    costPrice: decimalToString(input.costPrice),
    stockOnHand: decimalToString(input.stockOnHand),
    purchaseUomCategoryId: input.uomCategoryId,
    purchaseUomCategoryLabel: input.uomCategory.name,
    inventoryAccountId: input.inventoryAccountId ?? "",
    inventoryAccountLabel: buildProductAccountLabel(input.inventoryAccount),
    cogsAccountId: input.cogsAccountId ?? "",
    cogsAccountLabel: buildProductAccountLabel(input.cogsAccount),
    preferredSuppliers: input.preferredSuppliers.map((link) => ({
      id: link.supplier.id,
      label: buildProductSupplierLabel(link.supplier),
    })),
    branchStock: input.branchStock.map((row) => ({
      storeId: row.store.id,
      storeCode: row.store.code,
      storeName: row.store.name,
      qtyOnHand: decimalToString(row.qtyOnHand) || "0",
    })),
    serialNumberAvailability: input.serialTrackingEnabled ? "Yes" : "No",
    productStatus: toProductStatusLabel(input.status),
    salesName: input.salesName ?? "",
    salesPrice: decimalToString(input.salesPrice),
    salesUomCategoryId: input.uomCategoryId,
    salesUomCategoryLabel: input.uomCategory.name,
    incomeAccountId: input.incomeAccountId ?? "",
    incomeAccountLabel: buildProductAccountLabel(input.incomeAccount),
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

function getProductSearchWhere(query: string): Prisma.AccountingProductWhereInput {
  const search = query.trim();

  if (!search) {
    return {};
  }

  return {
    OR: [
      { code: { contains: search } },
      { purchaseName: { contains: search } },
      { salesName: { contains: search } },
      { itemCategory: { is: { name: { contains: search } } } },
      { itemBrand: { is: { name: { contains: search } } } },
      { itemModel: { is: { name: { contains: search } } } },
    ],
  };
}

function getProductOrderBy(sort: ProductListSort): Prisma.AccountingProductOrderByWithRelationInput[] {
  switch (sort) {
    case "name-asc":
      return [{ purchaseName: "asc" }, { code: "asc" }];
    case "name-desc":
      return [{ purchaseName: "desc" }, { code: "asc" }];
    case "price-high":
      return [{ salesPrice: "desc" }, { purchaseName: "asc" }];
    case "price-low":
      return [{ salesPrice: "asc" }, { purchaseName: "asc" }];
    case "code-asc":
      return [{ code: "asc" }];
    default:
      return [{ createdAt: "desc" }, { code: "asc" }];
  }
}

function normalizeAverageMargin(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return 0;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
}

export async function getProductsPayload({
  page = 1,
  limit = PRODUCT_LIST_PAGE_SIZE,
  query = "",
  sort = "latest",
}: {
  page?: number;
  limit?: number;
  query?: string;
  sort?: ProductListSort;
} = {}): Promise<ProductsPayload> {
  const currentPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const pageSize = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : PRODUCT_LIST_PAGE_SIZE;
  const where = getProductSearchWhere(query);
  const orderBy = getProductOrderBy(sort);
  const totalCount = await prisma.accountingProduct.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const skip = (effectivePage - 1) * pageSize;

  const [items, registeredProducts, serializedItems, inventoryItems, stockSummary, averageMarginRows] = await prisma.$transaction([
    prisma.accountingProduct.findMany({
      include: productInclude,
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.accountingProduct.count(),
    prisma.accountingProduct.count({
      where: {
        serialTrackingEnabled: true,
      },
    }),
    prisma.accountingProduct.count({
      where: {
        itemType: "INVENTORY_ITEM",
      },
    }),
    prisma.accountingProduct.aggregate({
      _sum: {
        stockOnHand: true,
      },
      where: {
        itemType: "INVENTORY_ITEM",
      },
    }),
    prisma.$queryRaw<Array<{ averageMargin: number | string | null }>>`
      SELECT AVG(
        CASE
          WHEN salesPrice > 0 AND costPrice IS NOT NULL THEN ((salesPrice - costPrice) / salesPrice) * 100
          ELSE NULL
        END
      ) AS averageMargin
      FROM accountingproduct
    `,
  ]);

  return {
    items: items.map(serializeProduct),
    totalCount,
    page: effectivePage,
    limit: pageSize,
    totalPages,
    summary: {
      registeredProducts,
      serializedItems,
      inventoryItems,
      totalStockOnHand: Number(stockSummary._sum.stockOnHand ?? 0),
      averageMargin: normalizeAverageMargin(averageMarginRows[0]?.averageMargin ?? 0),
    },
  };
}
