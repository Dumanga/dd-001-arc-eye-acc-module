import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingInventoryAccess } from "@/lib/accounting/inventory-access";
import {
  createProductMasterOption,
  searchProductMasterOptions,
} from "@/lib/accounting/product-masters";
import { productMasterTypes, type ProductMasterType } from "@/lib/accounting/product-master-types";

const productMasterTypeSet = new Set<ProductMasterType>(productMasterTypes);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseType(value: unknown): ProductMasterType | null {
  const normalizedValue = normalizeText(value).toLowerCase();
  return productMasterTypeSet.has(normalizedValue as ProductMasterType)
    ? (normalizedValue as ProductMasterType)
    : null;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingInventoryAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const type = parseType(searchParams.get("type"));

    if (!type) {
      return NextResponse.json(fail("Product master type is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const payload = await searchProductMasterOptions({
      type,
      query: normalizeText(searchParams.get("q")),
      cursor: normalizeText(searchParams.get("cursor")) || null,
      limit: parseLimit(searchParams.get("limit")),
    });

    return NextResponse.json(ok(payload, "Product master options fetched."), { status: 200 });
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

    const body = (await request.json()) as {
      type?: unknown;
      name?: unknown;
    };
    const type = parseType(body.type);

    if (!type) {
      return NextResponse.json(fail("Product master type is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const created = await createProductMasterOption({
      type,
      name: normalizeText(body.name),
    });

    return NextResponse.json(ok(created, "Product master created."), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(fail("This name already exists.", "DUPLICATE"), {
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
