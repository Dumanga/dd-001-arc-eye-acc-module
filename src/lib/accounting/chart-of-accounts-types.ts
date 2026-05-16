export type AccountingAccountCategoryOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  accountCount?: number;
  subtypeCount?: number;
};

export type AccountingAccountTypeOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresCurrency: boolean;
};

export type AccountingAccountSubtypeOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type ChartOfAccountMode = "create" | "view" | "edit";

export type ChartOfAccountFormValues = {
  accountCategoryId: string;
  accountTypeId: string;
  accountSubtypeId: string;
  accountCode: string;
  accountName: string;
  currency: string;
};

export type ChartOfAccountRecord = {
  id: string;
  categoryId: string;
  categoryName: string;
  typeId: string;
  typeName: string;
  subtypeId: string;
  subtypeName: string;
  code: string;
  name: string;
  currencyCode: string | null;
  isActive: boolean;
  requiresCurrency: boolean;
  // True when at least one accountingjournalentry row references this account.
  // Once true, the account code is locked from edits — historical journal rows
  // already reference this code and changing it would create reporting confusion
  // (the snapshot on the journal row protects history, but new rows would diverge).
  // The account name remains editable in either state.
  hasJournalEntries: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChartOfAccountSubtypeGroup = {
  id: string;
  name: string;
  description: string | null;
  typeId: string;
  typeName: string;
  requiresCurrency: boolean;
  accounts: ChartOfAccountRecord[];
};

export type ChartOfAccountsCategoryView = {
  category: AccountingAccountCategoryOption;
  accountCount: number;
  subtypeCount: number;
  subtypes: ChartOfAccountSubtypeGroup[];
};
