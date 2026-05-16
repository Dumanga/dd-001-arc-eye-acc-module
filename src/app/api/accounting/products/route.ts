import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingInventoryAccess } from "@/lib/accounting/inventory-access";
import {
  PRODUCT_LIST_PAGE_SIZE,
  toProductTradeModeValue,
  toProductItemTypeValue,
  toProductStatusValue,
  type ProductFormValues,
  type ProductListSort,
} from "@/lib/accounting/product-types";
import { getProductsPayload, productInclude, serializeProduct } from "@/lib/accounting/products";
import { prisma } from "@/lib/db";

type ProductRequestBody = Partial<ProductFormValues> & {
  id?: unknown;
};

type NormalizedProductInput = {
  productId: string;
  itemType: string;
  tradeMode: string;
  itemCode: string;
  itemCategoryId: string;
  itemBrandId: string;
  itemModelId: string;
  purchaseName: string;
  costPrice: string;
  purchaseUomCategoryId: string;
  inventoryAccountId: string;
  cogsAccountId: string;
  preferredSupplierIds: string[];
  serialTrackingEnabled: boolean;
  productStatus: string;
  salesName: string;
  salesPrice: string;
  salesUomCategoryId: string;
  incomeAccountId: string;
};

type ValidatedProductInput = NormalizedProductInput & {
  itemTypeValue: NonNullable<ReturnType<typeof toProductItemTypeValue>>;
  tradeModeValue: NonNullable<ReturnType<typeof toProductTradeModeValue>>;
  productStatusValue: NonNullable<ReturnType<typeof toProductStatusValue>>;
  hasPurchaseSide: boolean;
  hasSalesSide: boolean;
  // True only for INVENTORY_ITEM — these always need the three account
  // mappings (inventory / COGS / income) regardless of trade mode.
  isInventoryTracked: boolean;
  // True for VOUCHER products. Per accounting-theories.md § 7.3, vouchers
  // have cost = 0 (no COGS / no inventory leg) and their `incomeAccountId`
  // points to a CURRENT_LIABILITY account (Gift Voucher Liability), not an
  // income account.
  isVoucher: boolean;
  // True for SERVICE_ITEM products. Service items never sit in inventory —
  // they hit COGS at GRN time (Dr COGS / Cr AP), so the inventory account
  // column stays null and no inventory leg is posted.
  isServiceItem: boolean;
  sharedUomCategoryId: string;
  costPriceValue: Prisma.Decimal | null;
  salesPriceValue: Prisma.Decimal | null;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: unknown) {
  return normalizeText(value);
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => normalizeId(item)).filter(Boolean)));
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSort(value: string | null): ProductListSort {
  switch (value) {
    case "name-asc":
    case "name-desc":
    case "price-high":
    case "price-low":
    case "code-asc":
      return value;
    default:
      return "latest";
  }
}

function normalizeProductInput(body: ProductRequestBody): NormalizedProductInput {
  return {
    productId: normalizeId(body.id),
    itemType: normalizeText(body.itemType),
    tradeMode: normalizeText(body.tradeMode),
    itemCode: normalizeText(body.itemCode),
    itemCategoryId: normalizeId(body.itemCategoryId),
    itemBrandId: normalizeId(body.itemBrandId),
    itemModelId: normalizeId(body.itemModelId),
    purchaseName: normalizeText(body.purchaseName),
    costPrice: normalizeText(body.costPrice),
    purchaseUomCategoryId: normalizeId(body.purchaseUomCategoryId),
    inventoryAccountId: normalizeId(body.inventoryAccountId),
    cogsAccountId: normalizeId(body.cogsAccountId),
    preferredSupplierIds: normalizeIds(body.preferredSupplierIds),
    serialTrackingEnabled: normalizeText(body.serialNumberAvailability) === "Yes",
    productStatus: normalizeText(body.productStatus),
    salesName: normalizeText(body.salesName),
    salesPrice: normalizeText(body.salesPrice),
    salesUomCategoryId: normalizeId(body.salesUomCategoryId),
    incomeAccountId: normalizeId(body.incomeAccountId),
  };
}

function parsePrice(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error(`${label} must be a valid amount with up to 4 decimals.`);
  }

  const decimal = new Prisma.Decimal(value);

  if (decimal.lessThan(0)) {
    throw new Error(`${label} cannot be negative.`);
  }

  return decimal;
}

function parseOptionalPrice(value: string, label: string, required: boolean) {
  if (!required && !value) {
    return null;
  }

  return parsePrice(value, label);
}

function validateProductInput(input: NormalizedProductInput): ValidatedProductInput {
  const itemTypeValue = toProductItemTypeValue(input.itemType);
  if (!itemTypeValue) {
    throw new Error("Select the item type.");
  }

  const tradeModeValue = toProductTradeModeValue(input.tradeMode);
  if (!tradeModeValue) {
    throw new Error("Select whether this item is for buying, selling, or both.");
  }

  const hasPurchaseSide = tradeModeValue !== "SELL";
  const hasSalesSide = tradeModeValue !== "BUY";

  if (!input.itemCode) {
    throw new Error("Item code is required.");
  }

  if (/\s/.test(input.itemCode)) {
    throw new Error("Spaces are not allowed in the item code.");
  }

  if (input.itemCode.length > 30) {
    throw new Error("Item code must be 30 characters or fewer.");
  }

  if (hasPurchaseSide && !input.purchaseName) {
    throw new Error("Purchase item name is required.");
  }

  if (input.purchaseName && input.purchaseName.length > 200) {
    throw new Error("Purchase item name must be 200 characters or fewer.");
  }

  if (hasSalesSide && !input.salesName) {
    throw new Error("Sales item name is required.");
  }

  if (input.salesName && input.salesName.length > 200) {
    throw new Error("Sales item name must be 200 characters or fewer.");
  }

  let sharedUomCategoryId = "";

  if (hasPurchaseSide && hasSalesSide) {
    sharedUomCategoryId = input.purchaseUomCategoryId || input.salesUomCategoryId;

    if (!sharedUomCategoryId) {
      throw new Error("Select the product UOM.");
    }

    if (
      input.purchaseUomCategoryId &&
      input.salesUomCategoryId &&
      input.purchaseUomCategoryId !== input.salesUomCategoryId
    ) {
      throw new Error("Purchase and sales UOM must match.");
    }
  } else if (hasPurchaseSide) {
    sharedUomCategoryId = input.purchaseUomCategoryId || input.salesUomCategoryId;

    if (!sharedUomCategoryId) {
      throw new Error("Purchase UOM is required.");
    }
  } else {
    sharedUomCategoryId = input.salesUomCategoryId || input.purchaseUomCategoryId;

    if (!sharedUomCategoryId) {
      throw new Error("Sales UOM is required.");
    }
  }

  // All three accounting account mappings are compulsory for inventory items
  // regardless of trade mode — invoice approval (accounting-theories.md § 4)
  // requires every inventory line to resolve a per-product income account,
  // COGS account, and inventory account at posting time. Without this rule
  // the create-side validation would allow products that later cause
  // invoice approval to fail. Service / group items keep the older
  // trade-mode-conditional rule because they don't enter the COGS pair.
  //
  // Vouchers are special per accounting-theories.md § 7.3 — cost is zero,
  // so COGS and Inventory account fields are NOT required. The
  // incomeAccountId column for a voucher product points to a
  // CURRENT_LIABILITY account (Gift Voucher Liability), not an income
  // account; that branching is enforced by ensureRelationsAvailable below.
  if (itemTypeValue === "INVENTORY_ITEM") {
    if (!input.inventoryAccountId) {
      throw new Error("Inventory account is required.");
    }
    if (!input.cogsAccountId) {
      throw new Error("COGS account is required.");
    }
    if (!input.incomeAccountId) {
      throw new Error("Income account is required.");
    }
  } else if (itemTypeValue === "VOUCHER") {
    if (!input.incomeAccountId) {
      throw new Error("Gift Voucher Liability account is required.");
    }
  } else if (itemTypeValue === "SERVICE_ITEM") {
    // Service items don't sit in inventory (no stock), so the inventory
    // account is intentionally optional. COGS is still required on the
    // purchase side — service purchases hit COGS immediately as an
    // expense (Dr COGS / Cr AP at GRN approval).
    if (hasPurchaseSide && !input.cogsAccountId) {
      throw new Error("COGS account is required.");
    }
    if (hasSalesSide && !input.incomeAccountId) {
      throw new Error("Income account is required.");
    }
  } else {
    if (hasPurchaseSide && !input.inventoryAccountId) {
      throw new Error("Inventory account is required.");
    }
    if (hasPurchaseSide && !input.cogsAccountId) {
      throw new Error("COGS account is required.");
    }
    if (hasSalesSide && !input.incomeAccountId) {
      throw new Error("Income account is required.");
    }
  }

  const productStatusValue = toProductStatusValue(input.productStatus);
  if (!productStatusValue) {
    throw new Error("Select the product status.");
  }

  // INVENTORY_ITEM still requires all three accounts regardless of trade mode.
  // VOUCHER is NOT inventory-tracked in the accounting sense — cost = 0, so
  // no COGS/Inventory legs ever post (per theory § 7.3). It still needs the
  // income (= liability) account.
  const isInventoryTracked = itemTypeValue === "INVENTORY_ITEM";
  const isVoucher = itemTypeValue === "VOUCHER";
  const isServiceItem = itemTypeValue === "SERVICE_ITEM";

  // Vouchers always carry a serial number per theory § 7.3 — force-on
  // server-side regardless of what the client sent. The product form
  // already locks the toggle on screen; this is the belt-and-braces.
  const serialTrackingEnabled = isVoucher ? true : input.serialTrackingEnabled;

  return {
    ...input,
    itemTypeValue,
    tradeModeValue,
    productStatusValue,
    hasPurchaseSide,
    hasSalesSide,
    isInventoryTracked,
    isVoucher,
    isServiceItem,
    serialTrackingEnabled,
    sharedUomCategoryId,
    costPriceValue: parseOptionalPrice(input.costPrice, "Cost price", hasPurchaseSide || isInventoryTracked),
    salesPriceValue: parseOptionalPrice(input.salesPrice, "Sales price", hasSalesSide || isInventoryTracked || isVoucher),
  };
}

async function ensureOptionalLookup(id: string, loader: () => Promise<{ id: string } | null>, message: string) {
  if (!id) {
    return;
  }

  const item = await loader();
  if (!item) {
    throw new Error(message);
  }
}

async function ensureRelationsAvailable(input: ValidatedProductInput) {
  await Promise.all([
    ensureOptionalLookup(
      input.itemCategoryId,
      () =>
        prisma.accountingItemCategory.findFirst({
          where: { id: input.itemCategoryId },
          select: { id: true },
        }),
      "Selected item category is not available."
    ),
    ensureOptionalLookup(
      input.itemBrandId,
      () =>
        prisma.accountingItemBrand.findFirst({
          where: { id: input.itemBrandId },
          select: { id: true },
        }),
      "Selected item brand is not available."
    ),
    ensureOptionalLookup(
      input.itemModelId,
      () =>
        prisma.accountingItemModel.findFirst({
          where: { id: input.itemModelId },
          select: { id: true },
        }),
      "Selected item model is not available."
    ),
    prisma.accountingUomCategory.findFirst({
      where: {
        id: input.sharedUomCategoryId,
        isActive: true,
      },
      select: { id: true },
    }).then((item) => {
      if (!item) {
        throw new Error("Selected UOM category is not available.");
      }
    }),
    ensureOptionalLookup(
      (input.hasPurchaseSide || input.isInventoryTracked) && !input.isServiceItem
        ? input.inventoryAccountId
        : "",
      () =>
        prisma.chartOfAccount.findFirst({
          where: {
            id: input.inventoryAccountId,
            isActive: true,
            category: { is: { code: "ASSET", isActive: true } },
            type: { is: { code: "CURRENT_ASSET", isActive: true } },
          },
          select: { id: true },
        }),
      "Selected inventory account is not available."
    ),
    ensureOptionalLookup(
      input.hasPurchaseSide || input.isInventoryTracked ? input.cogsAccountId : "",
      () =>
        prisma.chartOfAccount.findFirst({
          where: {
            id: input.cogsAccountId,
            isActive: true,
            category: { is: { code: "EXPENSES", isActive: true } },
          },
          select: { id: true },
        }),
      "Selected COGS account is not available."
    ),
    // Income-account validation has two shapes:
    //   • Regular products (sales side) — must point to an INCOME-category
    //     account.
    //   • VOUCHER products — `incomeAccountId` actually stores a
    //     CURRENT_LIABILITY account (Gift Voucher Liability) per theory
    //     § 7.3. Accept LIABILITY-category / CURRENT_LIABILITY-type
    //     accounts in this case.
    ensureOptionalLookup(
      input.isVoucher ? input.incomeAccountId : "",
      () =>
        prisma.chartOfAccount.findFirst({
          where: {
            id: input.incomeAccountId,
            isActive: true,
            category: { is: { code: "LIABILITIES", isActive: true } },
            type: { is: { code: "CURRENT_LIABILITIES", isActive: true } },
          },
          select: { id: true },
        }),
      "Selected gift-voucher liability account is not available."
    ),
    ensureOptionalLookup(
      input.hasSalesSide && !input.isVoucher ? input.incomeAccountId : "",
      () =>
        prisma.chartOfAccount.findFirst({
          where: {
            id: input.incomeAccountId,
            isActive: true,
            category: { is: { code: "INCOME", isActive: true } },
          },
          select: { id: true },
        }),
      "Selected income account is not available."
    ),
  ]);

  if (input.hasPurchaseSide && input.preferredSupplierIds.length) {
    const supplierCount = await prisma.accountingSupplier.count({
      where: {
        id: { in: input.preferredSupplierIds },
      },
    });

    if (supplierCount !== input.preferredSupplierIds.length) {
      throw new Error("One or more preferred suppliers are not available.");
    }
  }
}

function buildPreferredSuppliersCreate(preferredSupplierIds: string[]) {
  return preferredSupplierIds.length
    ? {
        create: preferredSupplierIds.map((supplierId, index) => ({
          supplierId,
          displayOrder: index,
        })),
      }
    : undefined;
}

function buildCreateProductData(input: ValidatedProductInput): Prisma.AccountingProductCreateInput {
  // INVENTORY_ITEM products persist all three account mappings (income +
  // COGS + inventory). VOUCHER products only persist the income account
  // — which actually points to a current-liability account per theory
  // § 7.3 — and skip COGS/Inventory entirely (cost = 0, no JE 2 leg).
  const persistInventoryAccounts = input.hasPurchaseSide || input.isInventoryTracked;
  // Service items intentionally skip the inventory account leg — they never
  // sit in stock, so the column stays null even when there is a purchase side.
  const persistInventoryAccount = persistInventoryAccounts && !input.isServiceItem;
  const persistIncomeAccount = input.hasSalesSide || input.isInventoryTracked || input.isVoucher;
  return {
    itemType: input.itemTypeValue,
    tradeMode: input.tradeModeValue,
    code: input.itemCode,
    itemCategory: input.itemCategoryId ? { connect: { id: input.itemCategoryId } } : undefined,
    itemBrand: input.itemBrandId ? { connect: { id: input.itemBrandId } } : undefined,
    itemModel: input.itemModelId ? { connect: { id: input.itemModelId } } : undefined,
    purchaseName: input.hasPurchaseSide ? input.purchaseName : null,
    costPrice: input.costPriceValue,
    uomCategory: {
      connect: { id: input.sharedUomCategoryId },
    },
    inventoryAccount:
      persistInventoryAccount && input.inventoryAccountId
        ? { connect: { id: input.inventoryAccountId } }
        : undefined,
    cogsAccount:
      persistInventoryAccounts && input.cogsAccountId
        ? { connect: { id: input.cogsAccountId } }
        : undefined,
    serialTrackingEnabled: input.serialTrackingEnabled,
    status: input.productStatusValue,
    salesName: input.hasSalesSide ? input.salesName : null,
    salesPrice: input.salesPriceValue,
    incomeAccount:
      persistIncomeAccount && input.incomeAccountId
        ? { connect: { id: input.incomeAccountId } }
        : undefined,
    preferredSuppliers: input.hasPurchaseSide ? buildPreferredSuppliersCreate(input.preferredSupplierIds) : undefined,
  };
}

function buildUpdateProductData(input: ValidatedProductInput): Prisma.AccountingProductUpdateInput {
  const persistInventoryAccounts = input.hasPurchaseSide || input.isInventoryTracked;
  // Service items intentionally skip the inventory account leg — they never
  // sit in stock, so the column stays null even when there is a purchase side.
  const persistInventoryAccount = persistInventoryAccounts && !input.isServiceItem;
  const persistIncomeAccount = input.hasSalesSide || input.isInventoryTracked || input.isVoucher;
  return {
    itemType: input.itemTypeValue,
    tradeMode: input.tradeModeValue,
    code: input.itemCode,
    itemCategory: input.itemCategoryId ? { connect: { id: input.itemCategoryId } } : { disconnect: true },
    itemBrand: input.itemBrandId ? { connect: { id: input.itemBrandId } } : { disconnect: true },
    itemModel: input.itemModelId ? { connect: { id: input.itemModelId } } : { disconnect: true },
    purchaseName: input.hasPurchaseSide ? input.purchaseName : null,
    costPrice: input.costPriceValue,
    uomCategory: {
      connect: { id: input.sharedUomCategoryId },
    },
    inventoryAccount:
      persistInventoryAccount && input.inventoryAccountId
        ? { connect: { id: input.inventoryAccountId } }
        : { disconnect: true },
    cogsAccount:
      persistInventoryAccounts && input.cogsAccountId
        ? { connect: { id: input.cogsAccountId } }
        : { disconnect: true },
    serialTrackingEnabled: input.serialTrackingEnabled,
    status: input.productStatusValue,
    salesName: input.hasSalesSide ? input.salesName : null,
    salesPrice: input.salesPriceValue,
    incomeAccount:
      persistIncomeAccount && input.incomeAccountId
        ? { connect: { id: input.incomeAccountId } }
        : { disconnect: true },
    preferredSuppliers: {
      deleteMany: {},
      ...(input.hasPurchaseSide && input.preferredSupplierIds.length
        ? {
            create: input.preferredSupplierIds.map((supplierId, index) => ({
              supplierId,
              displayOrder: index,
            })),
          }
        : {}),
    },
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingInventoryAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const payload = await getProductsPayload({
      page: parsePositiveInt(searchParams.get("page"), 1),
      limit: parsePositiveInt(searchParams.get("limit"), PRODUCT_LIST_PAGE_SIZE),
      query: normalizeText(searchParams.get("query")),
      sort: parseSort(searchParams.get("sort")),
    });

    return NextResponse.json(ok(payload, "Products fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingInventoryAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as ProductRequestBody;
    const normalizedInput = normalizeProductInput(body);
    const validatedInput = validateProductInput(normalizedInput);
    await ensureRelationsAvailable(validatedInput);

    const created = await prisma.accountingProduct.create({
      data: buildCreateProductData(validatedInput),
      include: productInclude,
    });

    return NextResponse.json(ok(serializeProduct(created), "Product created."), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(fail("Product code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json(fail(error.message, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAccountingInventoryAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as ProductRequestBody;
    const normalizedInput = normalizeProductInput(body);

    if (!normalizedInput.productId) {
      return NextResponse.json(fail("Product id is required for updates.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const validatedInput = validateProductInput(normalizedInput);
    await ensureRelationsAvailable(validatedInput);

    const updated = await prisma.accountingProduct.update({
      where: {
        id: validatedInput.productId,
      },
      data: buildUpdateProductData(validatedInput),
      include: productInclude,
    });

    return NextResponse.json(ok(serializeProduct(updated), "Product updated."), { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(fail("Product code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(fail("Product not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json(fail(error.message, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
