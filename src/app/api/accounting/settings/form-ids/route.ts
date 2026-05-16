import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import {
  authorizeAccountingSettingsAccess,
  authorizeAccountingSettingsReadAccess,
} from "@/lib/accounting/settings-access";
import {
  getFormIdConfigs,
  upsertFormIdConfig,
} from "@/lib/accounting/form-id-config";
import type { AccountingFormType } from "@prisma/client";

const VALID_FORM_TYPES: AccountingFormType[] = ["PO", "GRN", "GRR", "QT", "INV", "SR", "RC", "POS", "PV", "EXP", "JEV", "MIN"];

function isFormType(value: unknown): value is AccountingFormType {
  return typeof value === "string" && (VALID_FORM_TYPES as string[]).includes(value);
}

export async function GET() {
  try {
    // Read access — branch users need form-id sequences to pre-fill the next
    // doc number on create forms. Mutations stay locked on PATCH.
    const auth = await authorizeAccountingSettingsReadAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const items = await getFormIdConfigs();
    return NextResponse.json(ok({ items }, "Form ID configs fetched."), { status: 200 });
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
    const { formType, code, yearToken, rangeFrom, rangeTo, nextNumber } = body;

    if (!isFormType(formType)) {
      return NextResponse.json(fail("Invalid formType.", "VALIDATION_ERROR"), { status: 400 });
    }

    if (
      typeof code !== "string" || !code.trim() ||
      typeof yearToken !== "string" ||
      typeof rangeFrom !== "string" || !rangeFrom.trim() ||
      typeof rangeTo !== "string" || !rangeTo.trim() ||
      typeof nextNumber !== "string" || !nextNumber.trim()
    ) {
      return NextResponse.json(fail("Missing required fields.", "VALIDATION_ERROR"), { status: 400 });
    }

    const updated = await upsertFormIdConfig({
      formType,
      code: code.trim(),
      yearToken: (yearToken as string).trim(),
      rangeFrom: rangeFrom.trim(),
      rangeTo: rangeTo.trim(),
      nextNumber: nextNumber.trim(),
    });

    return NextResponse.json(ok(updated, "Form ID config saved."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
