export const PRODUCT_MASTER_OPTIONS_PAGE_SIZE = 20;

export const productMasterTypes = ["category", "brand", "model"] as const;

export type ProductMasterType = (typeof productMasterTypes)[number];

export type ProductMasterOption = {
  id: string;
  label: string;
};

export type ProductMasterOptionsPayload = {
  items: ProductMasterOption[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function normalizeProductMasterName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function toProductMasterNameLookup(value: string) {
  return normalizeProductMasterName(value).toUpperCase();
}
