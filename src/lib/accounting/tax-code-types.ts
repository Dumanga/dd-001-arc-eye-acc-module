export const taxTypeOptions = ["Sales", "Purchase", "Both"] as const;
export const calculationOptions = ["Percentage", "Fixed Amount"] as const;
export const applicableOnOptions = ["Goods", "Services", "Both"] as const;
export const statusOptions = ["Active", "Inactive"] as const;
export const LIABILITY_ACCOUNT_CATEGORY_CODE = "LIABILITIES";
export const EXPENSE_ACCOUNT_CATEGORY_CODE = "EXPENSES";
export const TAX_ACCOUNT_CATEGORY_CODES = [
  LIABILITY_ACCOUNT_CATEGORY_CODE,
  EXPENSE_ACCOUNT_CATEGORY_CODE,
] as const;

export type TaxTypeOption = (typeof taxTypeOptions)[number];
export type TaxCalculationOption = (typeof calculationOptions)[number];
export type TaxApplicableOnOption = (typeof applicableOnOptions)[number];
export type TaxStatusOption = (typeof statusOptions)[number];

export type TaxCodeFormValues = {
  taxCode: string;
  taxName: string;
  taxType: TaxTypeOption | "";
  calculation: TaxCalculationOption;
  rate: string;
  outputTaxAccount: string;
  inputTaxAccount: string;
  applicableOn: TaxApplicableOnOption | "";
  effectiveFrom: string;
  status: TaxStatusOption;
};

export type TaxCodeRecord = {
  id: string;
  taxCode: string;
  taxName: string;
  taxType: TaxTypeOption;
  calculation: TaxCalculationOption;
  rate: string;
  applicableOn: TaxApplicableOnOption;
  effectiveFrom: string;
  status: TaxStatusOption;
  outputTaxAccount: string | null;
  outputTaxAccountId: string | null;
  inputTaxAccount: string | null;
  inputTaxAccountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaxCodeAccountOption = {
  id: string;
  label: string;
  categoryCode?: string;
  groupLabel?: string;
};

export type TaxCodeAccountOptionsPayload = {
  items: TaxCodeAccountOption[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type TaxCodesPayload = {
  items: TaxCodeRecord[];
};
