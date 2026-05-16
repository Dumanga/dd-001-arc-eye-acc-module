import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { searchSupplierOptions } from "@/lib/accounting/supplier-options";
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

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["suppliers", "inventory"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const payload = await searchSupplierOptions({
      query: normalizeText(searchParams.get("q")),
      cursor: normalizeText(searchParams.get("cursor")) || null,
      limit: parseLimit(searchParams.get("limit")),
    });

    return NextResponse.json(ok(payload, "Supplier options fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
