import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { searchAccountOptions } from "@/lib/accounting/account-options";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";

function normalizeText(value: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCategoryCodes(searchParams: URLSearchParams) {
  const categoriesValue = normalizeText(searchParams.get("categories"));

  if (categoriesValue) {
    return categoriesValue
      .split(",")
      .map((categoryCode) => categoryCode.trim().toUpperCase())
      .filter(Boolean);
  }

  const categoryCode = normalizeText(searchParams.get("category")).toUpperCase();
  return categoryCode ? [categoryCode] : [];
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["accounts", "inventory"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const categoryCodes = parseCategoryCodes(searchParams);
    const typeCode = normalizeText(searchParams.get("type")).toUpperCase();
    const subtypeCode = normalizeText(searchParams.get("subtype")).toUpperCase();

    if (!categoryCodes.length) {
      return NextResponse.json(
        fail("At least one account category is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const payload = await searchAccountOptions({
      categoryCodes,
      typeCode: typeCode || undefined,
      subtypeCode: subtypeCode || undefined,
      query: normalizeText(searchParams.get("q")),
      cursor: normalizeText(searchParams.get("cursor")) || null,
      limit: parseLimit(searchParams.get("limit")),
    });

    return NextResponse.json(ok(payload, "Account options fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
