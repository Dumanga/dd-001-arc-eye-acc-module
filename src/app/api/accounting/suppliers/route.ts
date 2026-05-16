import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingSupplierAccess } from "@/lib/accounting/supplier-access";
import { validateAndNormalizePhone } from "@/lib/accounting/supplier-phone";
import {
  SUPPLIER_DEFAULT_COUNTRY_CODE,
  SUPPLIER_DEFAULT_CURRENCY,
  SUPPLIER_LIST_PAGE_SIZE,
  type SupplierListSort,
  type SupplierBankAccount,
  type SupplierFormValues,
  type SupplierSalesContact,
} from "@/lib/accounting/supplier-types";
import { getSuppliersPayload, serializeSupplier, supplierInclude } from "@/lib/accounting/suppliers";
import { prisma } from "@/lib/db";

type SupplierRequestBody = Partial<SupplierFormValues> & {
  id?: string;
  taxCode?: unknown;
};

type NormalizedSupplierInput = {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  email: string;
  primaryMobileCountryCode: string;
  primaryMobile: string;
  alternateMobileCountryCode: string;
  alternateMobile: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  currency: string;
  tinNumber: string;
  taxCodeIds: string[];
  internalNotes: string;
  salesContacts: SupplierSalesContact[];
  bankAccounts: SupplierBankAccount[];
};

type ValidatedSalesContact = {
  name: string;
  email: string;
  designation: string;
  phone: NonNullable<ReturnType<typeof validateAndNormalizePhone>["value"]>;
};

type ValidatedSupplierInput = NormalizedSupplierInput & {
  primaryPhone: NonNullable<ReturnType<typeof validateAndNormalizePhone>["value"]>;
  alternatePhone: ReturnType<typeof validateAndNormalizePhone>["value"];
  normalizedSalesContacts: ValidatedSalesContact[];
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeCountryCode(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function normalizeTaxCodeIds(value: unknown, legacyValue?: unknown) {
  const sourceValues = Array.isArray(value) ? value : legacyValue ? [legacyValue] : [];
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const item of sourceValues) {
    const normalizedValue = normalizeText(item);

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return normalizedValues;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeBankAccounts(value: unknown): SupplierBankAccount[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = typeof item === "object" && item !== null ? item : {};

    return {
      accountNumber: normalizeText("accountNumber" in record ? record.accountNumber : ""),
      bankName: normalizeText("bankName" in record ? record.bankName : ""),
      branchName: normalizeText("branchName" in record ? record.branchName : ""),
    } satisfies SupplierBankAccount;
  });
}

function normalizeSalesContacts(value: unknown): SupplierSalesContact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = typeof item === "object" && item !== null ? item : {};

    return {
      name: normalizeText("name" in record ? record.name : ""),
      email: normalizeEmail("email" in record ? record.email : ""),
      designation: normalizeText("designation" in record ? record.designation : ""),
      mobileCountryCode: normalizeCountryCode("mobileCountryCode" in record ? record.mobileCountryCode : ""),
      mobile: normalizeText("mobile" in record ? record.mobile : ""),
    } satisfies SupplierSalesContact;
  });
}

function normalizeSupplierInput(body: SupplierRequestBody): NormalizedSupplierInput {
  return {
    supplierId: normalizeText(body.id),
    supplierCode: normalizeText(body.supplierCode).toUpperCase(),
    supplierName: normalizeText(body.supplierName),
    email: normalizeEmail(body.email),
    primaryMobileCountryCode: normalizeCountryCode(body.primaryMobileCountryCode) || SUPPLIER_DEFAULT_COUNTRY_CODE,
    primaryMobile: normalizeText(body.primaryMobile),
    alternateMobileCountryCode:
      normalizeCountryCode(body.alternateMobileCountryCode) || SUPPLIER_DEFAULT_COUNTRY_CODE,
    alternateMobile: normalizeText(body.alternateMobile),
    addressLine1: normalizeText(body.addressLine1),
    addressLine2: normalizeText(body.addressLine2),
    city: normalizeText(body.city),
    country: normalizeText(body.country),
    postalCode: normalizeText(body.postalCode),
    currency: normalizeText(body.currency).toUpperCase() || SUPPLIER_DEFAULT_CURRENCY,
    tinNumber: normalizeText(body.tinNumber).toUpperCase(),
    taxCodeIds: normalizeTaxCodeIds(body.taxCodes, body.taxCode),
    internalNotes: normalizeText(body.internalNotes),
    salesContacts: normalizeSalesContacts(body.salesContacts),
    bankAccounts: normalizeBankAccounts(body.bankAccounts),
  };
}

function validateSupplierInput(input: NormalizedSupplierInput): ValidatedSupplierInput {
  if (!input.supplierCode) {
    throw new Error("Supplier code is required.");
  }

  if (/\s/.test(input.supplierCode)) {
    throw new Error("Spaces are not allowed in the supplier code.");
  }

  if (input.supplierCode.length > 30) {
    throw new Error("Supplier code must be 30 characters or fewer.");
  }

  if (!input.supplierName) {
    throw new Error("Supplier name is required.");
  }

  if (input.supplierName.length > 120) {
    throw new Error("Supplier name must be 120 characters or fewer.");
  }

  if (!input.email) {
    throw new Error("Supplier email address is required.");
  }

  if (input.email.length > 120 || !isValidEmail(input.email)) {
    throw new Error("Enter a valid supplier email address.");
  }

  const primaryPhone = validateAndNormalizePhone({
    countryCode: input.primaryMobileCountryCode,
    localNumber: input.primaryMobile,
    requiredMessage: "Supplier phone number is required.",
    invalidMessage:
      input.primaryMobileCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE
        ? "Enter a valid Sri Lankan supplier phone number."
        : "Enter a valid supplier phone number for the selected country.",
  });

  if (primaryPhone.error || !primaryPhone.value) {
    throw new Error(primaryPhone.error || "Supplier phone number is required.");
  }

  const alternatePhone = validateAndNormalizePhone({
    countryCode: input.alternateMobileCountryCode,
    localNumber: input.alternateMobile,
    requiredMessage: "Alternate phone number is required.",
    allowEmpty: true,
  });

  if (alternatePhone.error) {
    throw new Error(alternatePhone.error);
  }

  if (input.addressLine1.length > 120 || input.addressLine2.length > 120) {
    throw new Error("Address lines must be 120 characters or fewer.");
  }

  if (input.city.length > 80 || input.country.length > 80) {
    throw new Error("City and country must be 80 characters or fewer.");
  }

  if (input.postalCode.length > 20) {
    throw new Error("Postal code must be 20 characters or fewer.");
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("Select a valid currency code.");
  }

  if (input.tinNumber.length > 40) {
    throw new Error("TIN number must be 40 characters or fewer.");
  }

  if (input.internalNotes.length > 500) {
    throw new Error("Internal notes must be 500 characters or fewer.");
  }

  for (const [index, contact] of input.salesContacts.entries()) {
    if (!contact.name || !contact.designation || !contact.email || !contact.mobile) {
      throw new Error(`Sales contact ${index + 1} is incomplete.`);
    }

    if (contact.name.length > 120 || contact.designation.length > 120 || contact.email.length > 120) {
      throw new Error(`Sales contact ${index + 1} exceeds the supported length.`);
    }

    if (!isValidEmail(contact.email)) {
      throw new Error(`Sales contact ${index + 1} email address is invalid.`);
    }
  }

  for (const [index, account] of input.bankAccounts.entries()) {
    if (!account.accountNumber || !account.bankName || !account.branchName) {
      throw new Error(`Bank account ${index + 1} is incomplete.`);
    }

    if (
      account.accountNumber.length > 40 ||
      account.bankName.length > 120 ||
      account.branchName.length > 120
    ) {
      throw new Error(`Bank account ${index + 1} exceeds the supported length.`);
    }
  }

  const normalizedSalesContacts = input.salesContacts.map((contact, index) => {
    const validatedPhone = validateAndNormalizePhone({
      countryCode: contact.mobileCountryCode || SUPPLIER_DEFAULT_COUNTRY_CODE,
      localNumber: contact.mobile,
      requiredMessage: `Sales contact ${index + 1} phone number is required.`,
    });

    if (validatedPhone.error || !validatedPhone.value) {
      throw new Error(validatedPhone.error || `Sales contact ${index + 1} phone number is required.`);
    }

    return {
      name: contact.name,
      email: contact.email,
      designation: contact.designation,
      phone: validatedPhone.value,
    };
  });

  return {
    ...input,
    primaryPhone: primaryPhone.value,
    alternatePhone: alternatePhone.value,
    normalizedSalesContacts,
  };
}

async function ensureTaxCodesAvailable(taxCodeIds: string[]) {
  if (!taxCodeIds.length) {
    return;
  }

  const taxCodes = await prisma.taxCode.findMany({
    where: {
      id: {
        in: taxCodeIds,
      },
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (taxCodes.length !== taxCodeIds.length) {
    throw new Error("One or more selected tax codes are not available.");
  }
}

function buildCreateSupplierData(input: ValidatedSupplierInput): Prisma.AccountingSupplierCreateInput {
  return {
    code: input.supplierCode,
    name: input.supplierName,
    email: input.email,
    primaryPhoneCountryCode: input.primaryPhone.countryCode,
    primaryPhoneDialCode: input.primaryPhone.dialCode,
    primaryPhoneLocalNumber: input.primaryPhone.localNumber,
    internalNotes: input.internalNotes || null,
    contactInfo: {
      create: {
        addressLine1: input.addressLine1 || null,
        addressLine2: input.addressLine2 || null,
        city: input.city || null,
        country: input.country || null,
        postalCode: input.postalCode || null,
        alternatePhoneCountryCode: input.alternatePhone?.countryCode || null,
        alternatePhoneDialCode: input.alternatePhone?.dialCode || null,
        alternatePhoneLocalNumber: input.alternatePhone?.localNumber || null,
      },
    },
    salesInfo: {
      create: {
        currencyCode: input.currency,
        tinNumber: input.tinNumber || null,
      },
    },
    taxCodes: input.taxCodeIds.length
      ? {
          create: input.taxCodeIds.map((taxCodeId, index) => ({
            taxCodeId,
            displayOrder: index,
          })),
        }
      : undefined,
    salesContacts: input.normalizedSalesContacts.length
      ? {
          create: input.normalizedSalesContacts.map((contact, index) => ({
            name: contact.name,
            email: contact.email,
            designation: contact.designation,
            phoneCountryCode: contact.phone.countryCode,
            phoneDialCode: contact.phone.dialCode,
            phoneLocalNumber: contact.phone.localNumber,
            displayOrder: index,
          })),
        }
      : undefined,
    bankAccounts: input.bankAccounts.length
      ? {
          create: input.bankAccounts.map((account, index) => ({
            accountNumber: account.accountNumber,
            bankName: account.bankName,
            branchName: account.branchName,
            displayOrder: index,
          })),
        }
      : undefined,
  };
}

function buildUpdateSupplierData(input: ValidatedSupplierInput): Prisma.AccountingSupplierUpdateInput {
  return {
    code: input.supplierCode,
    name: input.supplierName,
    email: input.email,
    primaryPhoneCountryCode: input.primaryPhone.countryCode,
    primaryPhoneDialCode: input.primaryPhone.dialCode,
    primaryPhoneLocalNumber: input.primaryPhone.localNumber,
    internalNotes: input.internalNotes || null,
    contactInfo: {
      upsert: {
        create: {
          addressLine1: input.addressLine1 || null,
          addressLine2: input.addressLine2 || null,
          city: input.city || null,
          country: input.country || null,
          postalCode: input.postalCode || null,
          alternatePhoneCountryCode: input.alternatePhone?.countryCode || null,
          alternatePhoneDialCode: input.alternatePhone?.dialCode || null,
          alternatePhoneLocalNumber: input.alternatePhone?.localNumber || null,
        },
        update: {
          addressLine1: input.addressLine1 || null,
          addressLine2: input.addressLine2 || null,
          city: input.city || null,
          country: input.country || null,
          postalCode: input.postalCode || null,
          alternatePhoneCountryCode: input.alternatePhone?.countryCode || null,
          alternatePhoneDialCode: input.alternatePhone?.dialCode || null,
          alternatePhoneLocalNumber: input.alternatePhone?.localNumber || null,
        },
      },
    },
    salesInfo: {
      upsert: {
        create: {
          currencyCode: input.currency,
          tinNumber: input.tinNumber || null,
        },
        update: {
          currencyCode: input.currency,
          tinNumber: input.tinNumber || null,
        },
      },
    },
    taxCodes: {
      deleteMany: {},
      ...(input.taxCodeIds.length
        ? {
            create: input.taxCodeIds.map((taxCodeId, index) => ({
              taxCodeId,
              displayOrder: index,
            })),
          }
        : {}),
    },
    salesContacts: {
      deleteMany: {},
      ...(input.normalizedSalesContacts.length
        ? {
            create: input.normalizedSalesContacts.map((contact, index) => ({
              name: contact.name,
              email: contact.email,
              designation: contact.designation,
              phoneCountryCode: contact.phone.countryCode,
              phoneDialCode: contact.phone.dialCode,
              phoneLocalNumber: contact.phone.localNumber,
              displayOrder: index,
            })),
          }
        : {}),
    },
    bankAccounts: {
      deleteMany: {},
      ...(input.bankAccounts.length
        ? {
            create: input.bankAccounts.map((account, index) => ({
              accountNumber: account.accountNumber,
              bankName: account.bankName,
              branchName: account.branchName,
              displayOrder: index,
            })),
          }
        : {}),
    },
  };
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSupplierSort(value: string | null): SupplierListSort {
  switch (value) {
    case "name-asc":
    case "name-desc":
    case "code-asc":
      return value;
    default:
      return "latest";
  }
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingSupplierAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const payload = await getSuppliersPayload({
      page: parsePositiveInt(searchParams.get("page"), 1),
      limit: parsePositiveInt(searchParams.get("limit"), SUPPLIER_LIST_PAGE_SIZE),
      query: normalizeText(searchParams.get("query")),
      sort: parseSupplierSort(searchParams.get("sort")),
    });
    return NextResponse.json(ok(payload, "Suppliers fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAccountingSupplierAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as SupplierRequestBody;
    const normalizedInput = normalizeSupplierInput(body);
    const validatedInput = validateSupplierInput(normalizedInput);
    await ensureTaxCodesAvailable(validatedInput.taxCodeIds);

    const created = await prisma.accountingSupplier.create({
      data: buildCreateSupplierData(validatedInput),
      include: supplierInclude,
    });

    return NextResponse.json(ok(serializeSupplier(created), "Supplier created."), { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(fail("Supplier code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json(fail(error.message, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAccountingSupplierAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as SupplierRequestBody;
    const normalizedInput = normalizeSupplierInput(body);

    if (!normalizedInput.supplierId) {
      return NextResponse.json(fail("Supplier id is required for updates.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const validatedInput = validateSupplierInput(normalizedInput);
    await ensureTaxCodesAvailable(validatedInput.taxCodeIds);

    const updated = await prisma.accountingSupplier.update({
      where: {
        id: validatedInput.supplierId,
      },
      data: buildUpdateSupplierData(validatedInput),
      include: supplierInclude,
    });

    return NextResponse.json(ok(serializeSupplier(updated), "Supplier updated."), { status: 200 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(fail("Supplier code already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(fail("Supplier not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json(fail(error.message, "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
