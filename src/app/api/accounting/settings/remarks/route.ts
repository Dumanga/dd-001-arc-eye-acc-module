import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import {
  authorizeAccountingSettingsAccess,
  authorizeAccountingSettingsReadAccess,
} from "@/lib/accounting/settings-access";
import { getRemarks, upsertRemark } from "@/lib/accounting/remarks-config";
import type { AccountingRemarkDocType } from "@prisma/client";

const VALID_DOC_TYPES: AccountingRemarkDocType[] = [
  "PURCHASE_ORDER",
  "INVOICE",
  "QUOTATION",
  "GRN",
  "GOODS_RETURN",
  "SALES_RETURN",
  "RECEIPT",
  "POS_BILL",
  "SUPPLIER_PAYMENT",
  "MATERIAL_ISSUE",
];

function isDocType(value: unknown): value is AccountingRemarkDocType {
  return typeof value === "string" && (VALID_DOC_TYPES as string[]).includes(value);
}

export async function GET() {
  try {
    // Read access — any authenticated accounting user can fetch remarks so
    // create forms (invoice, customer payment, etc.) can pre-fill the default
    // notes block. Edits stay locked to settings access on PATCH.
    const auth = await authorizeAccountingSettingsReadAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const items = await getRemarks();
    return NextResponse.json(ok({ items }, "Remarks fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAccountingSettingsAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { documentType, content } = body;

    if (!isDocType(documentType)) {
      return NextResponse.json(fail("Invalid documentType.", "VALIDATION_ERROR"), { status: 400 });
    }

    if (typeof content !== "string") {
      return NextResponse.json(fail("Content must be a string.", "VALIDATION_ERROR"), { status: 400 });
    }

    const updated = await upsertRemark(documentType, content);
    return NextResponse.json(ok(updated, "Remark saved."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
