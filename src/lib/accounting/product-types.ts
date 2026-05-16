export const PRODUCT_LIST_PAGE_SIZE = 10;

export type ProductListSort =
  | "latest"
  | "name-asc"
  | "name-desc"
  | "price-high"
  | "price-low"
  | "code-asc";

export type ProductFormItemType = "Inventory Item" | "Service Item" | "Group Item" | "Voucher";
export type ProductFormStatus = "Active" | "Inactive";
export type ProductSerialTracking = "Yes" | "No";
export type ProductTradeMode = "Both" | "Buy This" | "Sell This";

export type ProductSelectOption = {
  id: string;
  label: string;
};

export type ProductFormValues = {
  itemType: ProductFormItemType;
  tradeMode: ProductTradeMode;
  itemCode: string;
  itemCategoryId: string;
  itemBrandId: string;
  itemModelId: string;
  purchaseName: string;
  costPrice: string;
  purchaseUomCategoryId: string;
  inventoryAccountId: string;
  cogsAccountId: string;
  preferredSupplierIds: string[];
  serialNumberAvailability: ProductSerialTracking;
  productStatus: ProductFormStatus;
  salesName: string;
  salesPrice: string;
  salesUomCategoryId: string;
  incomeAccountId: string;
};

export type ProductBranchStock = {
  storeId: string;
  storeCode: string;
  storeName: string;
  qtyOnHand: string;
};

export type ProductRecord = {
  id: string;
  itemType: ProductFormItemType;
  tradeMode: ProductTradeMode;
  itemCode: string;
  itemCategoryId: string;
  itemCategoryLabel: string;
  itemBrandId: string;
  itemBrandLabel: string;
  itemModelId: string;
  itemModelLabel: string;
  purchaseName: string;
  costPrice: string;
  stockOnHand: string;
  branchStock: ProductBranchStock[];
  purchaseUomCategoryId: string;
  purchaseUomCategoryLabel: string;
  inventoryAccountId: string;
  inventoryAccountLabel: string;
  cogsAccountId: string;
  cogsAccountLabel: string;
  preferredSuppliers: ProductSelectOption[];
  serialNumberAvailability: ProductSerialTracking;
  productStatus: ProductFormStatus;
  salesName: string;
  salesPrice: string;
  salesUomCategoryId: string;
  salesUomCategoryLabel: string;
  incomeAccountId: string;
  incomeAccountLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductsPayload = {
  items: ProductRecord[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    registeredProducts: number;
    serializedItems: number;
    inventoryItems: number;
    totalStockOnHand: number;
    averageMargin: number;
  };
};

const productItemTypeLabelMap = {
  INVENTORY_ITEM: "Inventory Item",
  SERVICE_ITEM: "Service Item",
  GROUP_ITEM: "Group Item",
  VOUCHER: "Voucher",
} as const;

const productItemTypeValueMap = {
  "Inventory Item": "INVENTORY_ITEM",
  "Service Item": "SERVICE_ITEM",
  "Group Item": "GROUP_ITEM",
  Voucher: "VOUCHER",
} as const;

const productStatusLabelMap = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
} as const;

const productStatusValueMap = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
} as const;

const productTradeModeLabelMap = {
  BOTH: "Both",
  BUY: "Buy This",
  SELL: "Sell This",
} as const;

const productTradeModeValueMap = {
  Both: "BOTH",
  "Buy This": "BUY",
  "Sell This": "SELL",
} as const;

export function toProductItemTypeLabel(value: keyof typeof productItemTypeLabelMap): ProductFormItemType {
  return productItemTypeLabelMap[value];
}

export function toProductItemTypeValue(value: string) {
  return productItemTypeValueMap[value as ProductFormItemType] ?? null;
}

export function toProductStatusLabel(value: keyof typeof productStatusLabelMap): ProductFormStatus {
  return productStatusLabelMap[value];
}

export function toProductStatusValue(value: string) {
  return productStatusValueMap[value as ProductFormStatus] ?? null;
}

export function toProductTradeModeLabel(value: keyof typeof productTradeModeLabelMap): ProductTradeMode {
  return productTradeModeLabelMap[value];
}

export function toProductTradeModeValue(value: string) {
  return productTradeModeValueMap[value as ProductTradeMode] ?? null;
}

export function productHasPurchaseSide(value: ProductTradeMode) {
  return value === "Both" || value === "Buy This";
}

export function productHasSalesSide(value: ProductTradeMode) {
  return value === "Both" || value === "Sell This";
}

export function buildProductAccountLabel(input: { code: string; name: string } | null) {
  return input ? `${input.code} ${input.name}` : "";
}

export function buildProductSupplierLabel(input: { code: string; name: string }) {
  return `${input.code} - ${input.name}`;
}
