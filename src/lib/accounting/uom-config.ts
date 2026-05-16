import uomCategoryCatalog from "@/lib/accounting/data/uom-categories.json";

export type UomCategoryCode = "AREA" | "LENGTH" | "TIME" | "UNIT" | "VOLUME" | "WEIGHT";

export type UomCategoryDefinition = {
  id: string;
  code: UomCategoryCode;
  name: string;
  baseUnit: string;
  defaultSmallestAllowedQty: string;
  description: string;
  displayOrder: number;
};

export type UomRecord = {
  id: string;
  categoryCode: UomCategoryCode;
  name: string;
  ratioToBase: string;
  smallestAllowedQty: string;
  addedBy: string;
  isActive: boolean;
  isSystem: boolean;
  isBase: boolean;
  createdAt: string;
  updatedAt: string;
};

export const UOM_DECIMAL_SCALE = 5;
export const UOM_BASE_RATIO = "1.00000";
export const DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY = "0.01000";
export const UOM_FIXED_DECIMAL_PATTERN = /^\d+\.\d{5}$/;

export const uomCategories = uomCategoryCatalog as UomCategoryDefinition[];

export function getUomCategory(code: UomCategoryCode) {
  return uomCategories.find((category) => category.code === code);
}

export function normalizeUomName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function toUomNameLookup(value: string) {
  return normalizeUomName(value).toUpperCase();
}

export function parseUomDecimal(value: string | number) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

export function isUomFixedDecimal(value: string) {
  return UOM_FIXED_DECIMAL_PATTERN.test(value.trim());
}

export function formatUomDecimal(value: string | number, fractionDigits = UOM_DECIMAL_SCALE) {
  const numeric = parseUomDecimal(value);

  return numeric.toFixed(fractionDigits);
}

export function deriveUomType(ratioToBase: string) {
  const ratio = parseUomDecimal(ratioToBase);

  if (ratio === 1) {
    return "Reference";
  }

  if (ratio > 1) {
    return "Bigger than base";
  }

  if (ratio > 0 && ratio < 1) {
    return "Smaller than base";
  }

  return "Unclear";
}

export function sortUomRecords(records: UomRecord[]) {
  return [...records].sort((left, right) => {
    if (left.isBase && !right.isBase) {
      return -1;
    }

    if (!left.isBase && right.isBase) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}
