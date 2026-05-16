export const SUPPLIER_DEFAULT_COUNTRY_CODE = "LK";
export const SUPPLIER_DEFAULT_DIAL_CODE = "94";
export const SUPPLIER_DEFAULT_CURRENCY = "LKR";
export const SUPPLIER_TAX_CODE_OPTIONS_PAGE_SIZE = 20;
export const SUPPLIER_OPTIONS_PAGE_SIZE = 20;
export const SUPPLIER_LIST_PAGE_SIZE = 10;

export type SupplierBankAccount = {
  accountNumber: string;
  bankName: string;
  branchName: string;
};

export type SupplierSalesContact = {
  name: string;
  email: string;
  designation: string;
  mobileCountryCode: string;
  mobile: string;
};

export type SupplierSalesContactRecord = SupplierSalesContact & {
  mobileDialCode: string;
};

export type SupplierTaxCodeOption = {
  id: string;
  label: string;
};

export type SupplierFormValues = {
  supplierCode: string;
  supplierName: string;
  primaryMobileCountryCode: string;
  primaryMobile: string;
  email: string;
  address: string;
  alternateMobileCountryCode: string;
  alternateMobile: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  currency: string;
  tinNumber: string;
  taxCodes: string[];
  salesContacts: SupplierSalesContact[];
  bankAccounts: SupplierBankAccount[];
  internalNotes: string;
};

export type SupplierRecord = SupplierFormValues & {
  id: string;
  primaryMobileDialCode: string;
  alternateMobileDialCode: string;
  taxCodeOptions: SupplierTaxCodeOption[];
  salesContacts: SupplierSalesContactRecord[];
  createdAt: string;
  updatedAt: string;
};

export type SuppliersPayload = {
  items: SupplierRecord[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    registeredSuppliers: number;
    reachableSuppliers: number;
    backupContacts: number;
    addressProfiles: number;
  };
};

export type SupplierListSort = "latest" | "name-asc" | "name-desc" | "code-asc";
export type SupplierTaxCodeOptionsPayload = {
  items: SupplierTaxCodeOption[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SupplierOption = {
  id: string;
  label: string;
};

export type SupplierOptionsPayload = {
  items: SupplierOption[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function buildSupplierAddressSummary(
  input: Pick<SupplierFormValues, "addressLine1" | "addressLine2" | "city" | "country" | "postalCode" | "address">
) {
  const structured = [
    input.addressLine1.trim(),
    input.addressLine2.trim(),
    input.city.trim(),
    input.country.trim(),
    input.postalCode.trim(),
  ].filter(Boolean);

  return structured.join(", ") || input.address.trim();
}
