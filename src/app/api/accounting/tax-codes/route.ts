import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAccountAccess } from "@/lib/accounting/account-classifications";
import { getTaxCodesPayload, serializeTaxCode } from "@/lib/accounting/tax-codes";
import { prisma } from "@/lib/db";
import {
  TAX_ACCOUNT_CATEGORY_CODES,
  type TaxApplicableOnOption,
  type TaxCalculationOption,
  type TaxCodeFormValues,
  type TaxStatusOption,
  type TaxTypeOption,
} from "@/lib/accounting/tax-code-types";

const taxTypeToDb: Record<TaxTypeOption, "SALES" | "PURCHASE" | "BOTH"> = {
  Sales: "SALES",
  Purchase: "PURCHASE",
  Both: "BOTH",
};

const calculationToDb: Record<TaxCalculationOption, "PERCENTAGE" | "FIXED_AMOUNT"> = {
  Percentage: "PERCENTAGE",
  "Fixed Amount": "FIXED_AMOUNT",
};

const applicableOnToDb: Record<TaxApplicableOnOption, "GOODS" | "SERVICES" | "BOTH"> = {
  Goods: "GOODS",
  Services: "SERVICES",
  Both: "BOTH",
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateSelection<T extends string>(value: string, mapping: Record<string, T>) {
  return value in mapping ? mapping[value] : null;
}

function parseStatus(value: string) {
  return value === "Inactive"
    ? ("Inactive" as TaxStatusOption)
    : value === "Active"
      ? ("Active" as TaxStatusOption)
      : null;
}

export async function GET() {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const payload = await getTaxCodesPayload();
    return NextResponse.json(ok(payload, "Tax codes fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as Partial<TaxCodeFormValues>;
    const form: TaxCodeFormValues = {
      taxCode: normalizeText(body.taxCode).toUpperCase(),
      taxName: normalizeText(body.taxName),
      taxType: normalizeText(body.taxType) as TaxCodeFormValues["taxType"],
      calculation: normalizeText(body.calculation) as TaxCodeFormValues["calculation"],
      rate: normalizeText(body.rate),
      outputTaxAccount: normalizeText(body.outputTaxAccount),
      inputTaxAccount: normalizeText(body.inputTaxAccount),
      applicableOn: normalizeText(body.applicableOn) as TaxCodeFormValues["applicableOn"],
      effectiveFrom: normalizeText(body.effectiveFrom),
      status: normalizeText(body.status) as TaxCodeFormValues["status"],
    };

    if (!form.taxCode) {
      return NextResponse.json(fail("Tax code is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (form.taxCode.length > 20) {
      return NextResponse.json(
        fail("Tax code must be 20 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!form.taxName) {
      return NextResponse.json(fail("Tax name is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (form.taxName.length > 50) {
      return NextResponse.json(
        fail("Tax name must be 50 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const taxType = validateSelection(form.taxType, taxTypeToDb);
    if (!taxType) {
      return NextResponse.json(fail("Tax type is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const calculation = validateSelection(form.calculation, calculationToDb);
    if (!calculation) {
      return NextResponse.json(fail("Calculation is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (!form.rate) {
      return NextResponse.json(fail("Rate is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const parsedRate = Number(form.rate);
    if (!Number.isFinite(parsedRate)) {
      return NextResponse.json(fail("Enter a valid numeric rate.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (calculation === "PERCENTAGE" && parsedRate <= 0) {
      return NextResponse.json(
        fail("Percentage rate must be greater than 0.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (calculation === "FIXED_AMOUNT" && parsedRate < 0) {
      return NextResponse.json(
        fail("Fixed amount cannot be negative.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const applicableOn = validateSelection(form.applicableOn, applicableOnToDb);
    if (!applicableOn) {
      return NextResponse.json(
        fail("Applicable on is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const effectiveFrom = parseDate(form.effectiveFrom);
    if (!effectiveFrom) {
      return NextResponse.json(
        fail("Effective from date is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const status = parseStatus(form.status);
    if (!status) {
      return NextResponse.json(fail("Status is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const requireOutputAccount = taxType === "SALES" || taxType === "BOTH";
    const requireInputAccount = taxType === "PURCHASE" || taxType === "BOTH";

    if (requireOutputAccount && !form.outputTaxAccount) {
      return NextResponse.json(
        fail("Output tax account is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (requireInputAccount && !form.inputTaxAccount) {
      return NextResponse.json(
        fail("Input tax account is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const accountIds = [form.outputTaxAccount, form.inputTaxAccount].filter(Boolean);
    const accounts = accountIds.length
      ? await prisma.chartOfAccount.findMany({
          where: {
            id: {
              in: accountIds,
            },
            isActive: true,
            category: {
              is: {
                code: {
                  in: [...TAX_ACCOUNT_CATEGORY_CODES],
                },
                isActive: true,
              },
            },
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        })
      : [];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    if (requireOutputAccount && !accountMap.has(form.outputTaxAccount)) {
      return NextResponse.json(
        fail(
          "Selected output tax account must be an active liability or expense account.",
          "VALIDATION_ERROR"
        ),
        { status: 400 }
      );
    }

    if (requireInputAccount && !accountMap.has(form.inputTaxAccount)) {
      return NextResponse.json(
        fail(
          "Selected input tax account must be an active liability or expense account.",
          "VALIDATION_ERROR"
        ),
        { status: 400 }
      );
    }

    const created = await prisma.taxCode.create({
      data: {
        code: form.taxCode,
        name: form.taxName,
        taxType,
        calculation,
        rate: form.rate,
        applicableOn,
        effectiveFrom,
        isActive: status === "Active",
        outputTaxAccountId: requireOutputAccount ? form.outputTaxAccount : null,
        inputTaxAccountId: requireInputAccount ? form.inputTaxAccount : null,
      },
      include: {
        outputTaxAccount: {
          select: {
            code: true,
            name: true,
          },
        },
        inputTaxAccount: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      ok(
        serializeTaxCode({
          id: created.id,
          code: created.code,
          name: created.name,
          taxType: created.taxType,
          calculation: created.calculation,
          rate: created.rate,
          applicableOn: created.applicableOn,
          effectiveFrom: created.effectiveFrom,
          isActive: created.isActive,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          outputTaxAccountId: created.outputTaxAccountId,
          inputTaxAccountId: created.inputTaxAccountId,
          outputTaxAccount: created.outputTaxAccount,
          inputTaxAccount: created.inputTaxAccount,
        }),
        "Tax code created."
      ),
      { status: 201 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(fail("Tax code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAccountingAccountAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      id?: unknown;
      taxName?: unknown;
      status?: unknown;
    };

    const id = normalizeText(body.id);
    const taxName = normalizeText(body.taxName);
    const status = parseStatus(normalizeText(body.status));

    if (!id) {
      return NextResponse.json(fail("Tax code id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (!taxName) {
      return NextResponse.json(fail("Tax name is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (taxName.length > 50) {
      return NextResponse.json(
        fail("Tax name must be 50 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(fail("Status is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const updated = await prisma.taxCode.update({
      where: {
        id,
      },
      data: {
        name: taxName,
        isActive: status === "Active",
      },
      include: {
        outputTaxAccount: {
          select: {
            code: true,
            name: true,
          },
        },
        inputTaxAccount: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      ok(
        serializeTaxCode({
          id: updated.id,
          code: updated.code,
          name: updated.name,
          taxType: updated.taxType,
          calculation: updated.calculation,
          rate: updated.rate,
          applicableOn: updated.applicableOn,
          effectiveFrom: updated.effectiveFrom,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          outputTaxAccountId: updated.outputTaxAccountId,
          inputTaxAccountId: updated.inputTaxAccountId,
          outputTaxAccount: updated.outputTaxAccount,
          inputTaxAccount: updated.inputTaxAccount,
        }),
        "Tax code updated."
      ),
      { status: 200 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(fail("Tax code not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
