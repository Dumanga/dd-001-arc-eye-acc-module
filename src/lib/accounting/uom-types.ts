import type {
  UomCategoryCode,
  UomCategoryDefinition,
  UomRecord,
} from "@/lib/accounting/uom-config";

export type UomFormValues = {
  categoryCode: UomCategoryCode;
  name: string;
  ratioToBase: string;
  smallestAllowedQty: string;
  isActive: boolean;
};

export type UomPayload = {
  categories: UomCategoryDefinition[];
  items: UomRecord[];
  currentUserDisplayName: string;
};
