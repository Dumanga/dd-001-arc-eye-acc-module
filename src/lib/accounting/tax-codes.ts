import type { TaxCodeRecord, TaxCodesPayload } from "@/lib/accounting/tax-code-types";
import { prisma } from "@/lib/db";

const taxTypeFromDb = {
  SALES: "Sales",
  PURCHASE: "Purchase",
  BOTH: "Both",
} as const;

const calculationFromDb = {
  PERCENTAGE: "Percentage",
  FIXED_AMOUNT: "Fixed Amount",
} as const;

const applicableOnFromDb = {
  GOODS: "Goods",
  SERVICES: "Services",
  BOTH: "Both",
} as const;

function formatRateValue(value: { toString(): string }) {
  const [whole, decimal = ""] = value.toString().split(".");
  const trimmedDecimal = decimal.replace(/0+$/, "");

  return trimmedDecimal ? `${whole}.${trimmedDecimal}` : whole;
}

function toAccountLabel(account: { code: string; name: string } | null) {
  return account ? `${account.code} ${account.name}` : null;
}

export function serializeTaxCode(input: {
  id: string;
  code: string;
  name: string;
  taxType: keyof typeof taxTypeFromDb;
  calculation: keyof typeof calculationFromDb;
  rate: { toString(): string };
  applicableOn: keyof typeof applicableOnFromDb;
  effectiveFrom: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  outputTaxAccountId: string | null;
  inputTaxAccountId: string | null;
  outputTaxAccount: { code: string; name: string } | null;
  inputTaxAccount: { code: string; name: string } | null;
}): TaxCodeRecord {
  return {
    id: input.id,
    taxCode: input.code,
    taxName: input.name,
    taxType: taxTypeFromDb[input.taxType],
    calculation: calculationFromDb[input.calculation],
    rate: formatRateValue(input.rate),
    applicableOn: applicableOnFromDb[input.applicableOn],
    effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10),
    status: input.isActive ? "Active" : "Inactive",
    outputTaxAccount: toAccountLabel(input.outputTaxAccount),
    outputTaxAccountId: input.outputTaxAccountId,
    inputTaxAccount: toAccountLabel(input.inputTaxAccount),
    inputTaxAccountId: input.inputTaxAccountId,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export async function getTaxCodesPayload(): Promise<TaxCodesPayload> {
  const items = await prisma.taxCode.findMany({
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
    orderBy: [{ effectiveFrom: "desc" }, { code: "asc" }],
  });

  return {
    items: items.map((item) =>
      serializeTaxCode({
        id: item.id,
        code: item.code,
        name: item.name,
        taxType: item.taxType,
        calculation: item.calculation,
        rate: item.rate,
        applicableOn: item.applicableOn,
        effectiveFrom: item.effectiveFrom,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        outputTaxAccountId: item.outputTaxAccountId,
        inputTaxAccountId: item.inputTaxAccountId,
        outputTaxAccount: item.outputTaxAccount,
        inputTaxAccount: item.inputTaxAccount,
      })
    ),
  };
}
