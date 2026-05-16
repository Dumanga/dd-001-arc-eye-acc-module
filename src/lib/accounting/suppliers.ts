import type { Prisma } from "@prisma/client";
import {
  buildSupplierAddressSummary,
  SUPPLIER_DEFAULT_COUNTRY_CODE,
  SUPPLIER_DEFAULT_CURRENCY,
  SUPPLIER_DEFAULT_DIAL_CODE,
  SUPPLIER_LIST_PAGE_SIZE,
  type SupplierListSort,
  type SupplierRecord,
  type SupplierSalesContactRecord,
  type SuppliersPayload,
} from "@/lib/accounting/supplier-types";
import { prisma } from "@/lib/db";

export const supplierInclude = {
  contactInfo: true,
  salesInfo: true,
  taxCodes: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      taxCode: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  salesContacts: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  },
  bankAccounts: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.AccountingSupplierInclude;

type SupplierWithRelations = Prisma.AccountingSupplierGetPayload<{
  include: typeof supplierInclude;
}>;

function serializeSupplierSalesContact(
  input: SupplierWithRelations["salesContacts"][number]
): SupplierSalesContactRecord {
  return {
    name: input.name,
    email: input.email,
    designation: input.designation,
    mobileCountryCode: input.phoneCountryCode,
    mobileDialCode: input.phoneDialCode,
    mobile: input.phoneLocalNumber,
  };
}

function serializeSupplierTaxCodeOption(
  input: SupplierWithRelations["taxCodes"][number]
): SupplierRecord["taxCodeOptions"][number] {
  return {
    id: input.taxCode.id,
    label: `${input.taxCode.code} - ${input.taxCode.name}`,
  };
}

export function serializeSupplier(input: SupplierWithRelations): SupplierRecord {
  const contactInfo = input.contactInfo;
  const salesInfo = input.salesInfo;
  const taxCodeOptions = input.taxCodes.map(serializeSupplierTaxCodeOption);
  const address = buildSupplierAddressSummary({
    address: "",
    addressLine1: contactInfo?.addressLine1 ?? "",
    addressLine2: contactInfo?.addressLine2 ?? "",
    city: contactInfo?.city ?? "",
    country: contactInfo?.country ?? "",
    postalCode: contactInfo?.postalCode ?? "",
  });

  return {
    id: input.id,
    supplierCode: input.code,
    supplierName: input.name,
    primaryMobileCountryCode: input.primaryPhoneCountryCode,
    primaryMobileDialCode: input.primaryPhoneDialCode,
    primaryMobile: input.primaryPhoneLocalNumber,
    email: input.email,
    address,
    alternateMobileCountryCode: contactInfo?.alternatePhoneCountryCode ?? SUPPLIER_DEFAULT_COUNTRY_CODE,
    alternateMobileDialCode: contactInfo?.alternatePhoneDialCode ?? SUPPLIER_DEFAULT_DIAL_CODE,
    alternateMobile: contactInfo?.alternatePhoneLocalNumber ?? "",
    addressLine1: contactInfo?.addressLine1 ?? "",
    addressLine2: contactInfo?.addressLine2 ?? "",
    city: contactInfo?.city ?? "",
    country: contactInfo?.country ?? "",
    postalCode: contactInfo?.postalCode ?? "",
    currency: salesInfo?.currencyCode ?? SUPPLIER_DEFAULT_CURRENCY,
    tinNumber: salesInfo?.tinNumber ?? "",
    taxCodes: taxCodeOptions.map((option) => option.id),
    taxCodeOptions,
    salesContacts: input.salesContacts.map(serializeSupplierSalesContact),
    bankAccounts: input.bankAccounts.map((account) => ({
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branchName: account.branchName,
    })),
    internalNotes: input.internalNotes ?? "",
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

function getSupplierSearchWhere(query: string): Prisma.AccountingSupplierWhereInput {
  const search = query.trim();

  if (!search) {
    return {};
  }

  return {
    OR: [
      { code: { contains: search } },
      { name: { contains: search } },
      { email: { contains: search } },
      { primaryPhoneDialCode: { contains: search } },
      { primaryPhoneLocalNumber: { contains: search } },
      {
        contactInfo: {
          is: {
            OR: [
              { addressLine1: { contains: search } },
              { addressLine2: { contains: search } },
              { city: { contains: search } },
              { country: { contains: search } },
              { postalCode: { contains: search } },
              { alternatePhoneDialCode: { contains: search } },
              { alternatePhoneLocalNumber: { contains: search } },
            ],
          },
        },
      },
      {
        salesInfo: {
          is: {
            OR: [{ currencyCode: { contains: search } }, { tinNumber: { contains: search } }],
          },
        },
      },
      {
        taxCodes: {
          some: {
            OR: [
              { taxCode: { is: { code: { contains: search } } } },
              { taxCode: { is: { name: { contains: search } } } },
            ],
          },
        },
      },
    ],
  };
}

function getSupplierOrderBy(sort: SupplierListSort): Prisma.AccountingSupplierOrderByWithRelationInput[] {
  switch (sort) {
    case "name-asc":
      return [{ name: "asc" }, { code: "asc" }];
    case "name-desc":
      return [{ name: "desc" }, { code: "asc" }];
    case "code-asc":
      return [{ code: "asc" }];
    default:
      return [{ createdAt: "desc" }, { code: "asc" }];
  }
}

export async function getSuppliersPayload({
  page = 1,
  limit = SUPPLIER_LIST_PAGE_SIZE,
  query = "",
  sort = "latest",
}: {
  page?: number;
  limit?: number;
  query?: string;
  sort?: SupplierListSort;
} = {}): Promise<SuppliersPayload> {
  const currentPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const pageSize = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : SUPPLIER_LIST_PAGE_SIZE;
  const where = getSupplierSearchWhere(query);
  const orderBy = getSupplierOrderBy(sort);
  const totalCount = await prisma.accountingSupplier.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const skip = (effectivePage - 1) * pageSize;

  const [
    items,
    registeredSuppliers,
    reachableSuppliers,
    backupContacts,
    addressProfiles,
  ] = await prisma.$transaction([
    prisma.accountingSupplier.findMany({
      include: supplierInclude,
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.accountingSupplier.count(),
    prisma.accountingSupplier.count({
      where: {
        AND: [{ email: { not: "" } }, { primaryPhoneLocalNumber: { not: "" } }],
      },
    }),
    prisma.accountingSupplier.count({
      where: {
        contactInfo: {
          is: {
            AND: [
              { alternatePhoneLocalNumber: { not: null } },
              { alternatePhoneLocalNumber: { not: "" } },
            ],
          },
        },
      },
    }),
    prisma.accountingSupplier.count({
      where: {
        contactInfo: {
          is: {
            OR: [
              {
                AND: [{ addressLine1: { not: null } }, { addressLine1: { not: "" } }],
              },
              {
                AND: [{ addressLine2: { not: null } }, { addressLine2: { not: "" } }],
              },
              {
                AND: [{ city: { not: null } }, { city: { not: "" } }],
              },
              {
                AND: [{ country: { not: null } }, { country: { not: "" } }],
              },
              {
                AND: [{ postalCode: { not: null } }, { postalCode: { not: "" } }],
              },
            ],
          },
        },
      },
    }),
  ]);

  return {
    items: items.map(serializeSupplier),
    totalCount,
    page: effectivePage,
    limit: pageSize,
    totalPages,
    summary: {
      registeredSuppliers,
      reachableSuppliers,
      backupContacts,
      addressProfiles,
    },
  };
}
