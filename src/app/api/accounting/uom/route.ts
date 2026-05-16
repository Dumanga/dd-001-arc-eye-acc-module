import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingInventoryAccess } from "@/lib/accounting/inventory-access";
import {
  DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY,
  UOM_BASE_RATIO,
  UOM_DECIMAL_SCALE,
  formatUomDecimal,
  isUomFixedDecimal,
  normalizeUomName,
  toUomNameLookup,
  type UomCategoryCode,
  type UomCategoryDefinition,
  type UomRecord,
  uomCategories,
} from "@/lib/accounting/uom-config";
import type { UomFormValues, UomPayload } from "@/lib/accounting/uom-types";

const allowedCategoryCodes = new Set<UomCategoryCode>(uomCategories.map((category) => category.code));

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatStoredDecimal(value: { toString(): string } | string | number) {
  return formatUomDecimal(String(value), UOM_DECIMAL_SCALE);
}

function serializeCategory(input: {
  id: string;
  code: UomCategoryCode;
  name: string;
  description: string | null;
  baseUnitName: string;
  defaultSmallestAllowedQty: { toString(): string };
  displayOrder: number;
}): UomCategoryDefinition {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    baseUnit: input.baseUnitName,
    defaultSmallestAllowedQty: formatStoredDecimal(input.defaultSmallestAllowedQty),
    description: input.description ?? "",
    displayOrder: input.displayOrder,
  };
}

function serializeUnit(input: {
  id: string;
  name: string;
  ratioToBase: { toString(): string };
  smallestAllowedQty: { toString(): string };
  isActive: boolean;
  isSystem: boolean;
  isBase: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: { code: UomCategoryCode };
  createdByUser: { displayName: string } | null;
}): UomRecord {
  return {
    id: input.id,
    categoryCode: input.category.code,
    name: input.name,
    ratioToBase: formatStoredDecimal(input.ratioToBase),
    smallestAllowedQty: formatStoredDecimal(input.smallestAllowedQty),
    addedBy: input.isSystem ? "Default" : input.createdByUser?.displayName ?? "Unknown User",
    isActive: input.isActive,
    isSystem: input.isSystem,
    isBase: input.isBase,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

async function loadCategoryByCode(code: UomCategoryCode) {
  return prisma.accountingUomCategory.findFirst({
    where: {
      code,
      isActive: true,
    },
  });
}

function parseCreateBody(body: Partial<UomFormValues>) {
  return {
    categoryCode: normalizeText(body.categoryCode) as UomCategoryCode,
    name: normalizeUomName(normalizeText(body.name)),
    ratioToBase: normalizeText(body.ratioToBase),
    smallestAllowedQty:
      normalizeText(body.smallestAllowedQty) || DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY,
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
  };
}

function validateUnitInput(input: {
  name: string;
  ratioToBase: string;
  smallestAllowedQty: string;
}) {
  if (!input.name) {
    return "Unit name is required.";
  }

  if (input.name.length > 80) {
    return "Unit name must be 80 characters or fewer.";
  }

  if (!input.ratioToBase) {
    return "Ratio is required.";
  }

  if (!isUomFixedDecimal(input.ratioToBase)) {
    return "Enter ratio with exactly 5 decimal places.";
  }

  const ratioValue = Number(input.ratioToBase);
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    return "Ratio must be above zero.";
  }

  if (formatStoredDecimal(input.ratioToBase) === UOM_BASE_RATIO) {
    return "Ratio 1.00000 belongs to the base unit.";
  }

  if (!input.smallestAllowedQty) {
    return "Smallest allowed qty is required.";
  }

  if (!isUomFixedDecimal(input.smallestAllowedQty)) {
    return "Enter smallest allowed qty with exactly 5 decimal places.";
  }

  const smallestAllowedQty = Number(input.smallestAllowedQty);
  if (!Number.isFinite(smallestAllowedQty) || smallestAllowedQty <= 0) {
    return "Smallest allowed qty must be above zero.";
  }

  return null;
}

export async function GET() {
  try {
    const auth = await authorizeAccountingInventoryAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const categories = await prisma.accountingUomCategory.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: {
        units: {
          include: {
            category: {
              select: {
                code: true,
              },
            },
            createdByUser: {
              select: {
                displayName: true,
              },
            },
          },
          orderBy: [{ isBase: "desc" }, { name: "asc" }],
        },
      },
    });

    const payload: UomPayload = {
      categories: categories.map((category) =>
        serializeCategory({
          id: category.id,
          code: category.code,
          name: category.name,
          description: category.description,
          baseUnitName: category.baseUnitName,
          defaultSmallestAllowedQty: category.defaultSmallestAllowedQty,
          displayOrder: category.displayOrder,
        })
      ),
      items: categories.flatMap((category) => category.units.map((unit) => serializeUnit(unit))),
      currentUserDisplayName: auth.currentUser.displayName,
    };

    return NextResponse.json(ok(payload, "UOM data fetched."), { status: 200 });
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

    const body = (await request.json()) as Partial<UomFormValues>;
    const form = parseCreateBody(body);

    if (!allowedCategoryCodes.has(form.categoryCode)) {
      return NextResponse.json(fail("UOM category is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const validationError = validateUnitInput(form);
    if (validationError) {
      return NextResponse.json(fail(validationError, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const category = await loadCategoryByCode(form.categoryCode);
    if (!category) {
      return NextResponse.json(fail("UOM category not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    const normalizedName = toUomNameLookup(form.name);
    const duplicate = await prisma.accountingUom.findFirst({
      where: {
        categoryId: category.id,
        normalizedName,
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return NextResponse.json(
        fail("This unit already exists in this category.", "DUPLICATE"),
        { status: 409 }
      );
    }

    const created = await prisma.accountingUom.create({
      data: {
        categoryId: category.id,
        name: form.name,
        normalizedName,
        ratioToBase: formatStoredDecimal(form.ratioToBase),
        smallestAllowedQty: formatStoredDecimal(form.smallestAllowedQty),
        isActive: form.isActive,
        isSystem: false,
        isBase: false,
        createdByUserId: auth.currentUser.id,
      },
      include: {
        category: {
          select: {
            code: true,
          },
        },
        createdByUser: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return NextResponse.json(ok(serializeUnit(created), "UOM created."), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("This unit already exists in this category.", "DUPLICATE"),
        { status: 409 }
      );
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

    const body = (await request.json()) as Partial<UomFormValues> & { id?: unknown };
    const id = normalizeText(body.id);
    if (!id) {
      return NextResponse.json(fail("UOM id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const form = {
      name: normalizeUomName(normalizeText(body.name)),
      ratioToBase: normalizeText(body.ratioToBase),
      smallestAllowedQty:
        normalizeText(body.smallestAllowedQty) || DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    };

    const validationError = validateUnitInput(form);
    if (validationError) {
      return NextResponse.json(fail(validationError, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const existing = await prisma.accountingUom.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        categoryId: true,
        isBase: true,
      },
    });

    if (!existing) {
      return NextResponse.json(fail("UOM not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    if (existing.isBase) {
      return NextResponse.json(fail("Base unit is locked.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const normalizedName = toUomNameLookup(form.name);
    const duplicate = await prisma.accountingUom.findFirst({
      where: {
        categoryId: existing.categoryId,
        normalizedName,
        id: {
          not: existing.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return NextResponse.json(
        fail("This unit already exists in this category.", "DUPLICATE"),
        { status: 409 }
      );
    }

    const updated = await prisma.accountingUom.update({
      where: {
        id: existing.id,
      },
      data: {
        name: form.name,
        normalizedName,
        ratioToBase: formatStoredDecimal(form.ratioToBase),
        smallestAllowedQty: formatStoredDecimal(form.smallestAllowedQty),
        isActive: form.isActive,
      },
      include: {
        category: {
          select: {
            code: true,
          },
        },
        createdByUser: {
          select: {
            displayName: true,
          },
        },
      },
    });

    return NextResponse.json(ok(serializeUnit(updated), "UOM updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("This unit already exists in this category.", "DUPLICATE"),
        { status: 409 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(fail("UOM not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
