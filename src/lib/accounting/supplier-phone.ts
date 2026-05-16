import type { CountryCode } from "libphonenumber-js";
import { getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import {
  SUPPLIER_DEFAULT_COUNTRY_CODE,
  SUPPLIER_DEFAULT_DIAL_CODE,
} from "@/lib/accounting/supplier-types";

export type NormalizedPhoneValue = {
  countryCode: string;
  dialCode: string;
  localNumber: string;
  e164: string;
};

export function sanitizePhoneDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function normalizeDialCode(value: string) {
  return sanitizePhoneDigits(value);
}

export function formatDialCode(value: string) {
  const digits = normalizeDialCode(value);
  return digits ? `+${digits}` : "";
}

export function resolveDialCodeForCountry(countryCode: string) {
  try {
    return getCountryCallingCode(countryCode.trim().toUpperCase() as CountryCode);
  } catch {
    return countryCode.trim().toUpperCase() === SUPPLIER_DEFAULT_COUNTRY_CODE
      ? SUPPLIER_DEFAULT_DIAL_CODE
      : "";
  }
}

export function getLocalPhoneMaxLength(dialCode: string, countryCode: string) {
  if (countryCode.trim().toUpperCase() === SUPPLIER_DEFAULT_COUNTRY_CODE) {
    return 9;
  }

  return Math.max(4, 15 - normalizeDialCode(dialCode).length);
}

export function sanitizePhoneLocalPart(value: string, dialCode: string, countryCode: string) {
  let digits = sanitizePhoneDigits(value);
  const dialCodeDigits = normalizeDialCode(dialCode);
  const normalizedCountryCode = countryCode.trim().toUpperCase();

  if (dialCodeDigits && digits.startsWith(dialCodeDigits)) {
    digits = digits.slice(dialCodeDigits.length);
  }

  if (normalizedCountryCode === SUPPLIER_DEFAULT_COUNTRY_CODE && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, getLocalPhoneMaxLength(dialCodeDigits, normalizedCountryCode));
}

export function formatPhoneNumberDisplay(localNumber: string, dialCode: string, countryCode: string) {
  const normalizedLocalNumber = sanitizePhoneLocalPart(localNumber, dialCode, countryCode);

  return normalizedLocalNumber ? `${formatDialCode(dialCode)} ${normalizedLocalNumber}` : "Not added yet";
}

export function validateAndNormalizePhone(input: {
  countryCode: string;
  dialCode?: string | null;
  localNumber: string;
  requiredMessage: string;
  invalidMessage?: string;
  allowEmpty?: boolean;
}) {
  const countryCode = input.countryCode.trim().toUpperCase() || SUPPLIER_DEFAULT_COUNTRY_CODE;
  const dialCode = normalizeDialCode(
    input.dialCode || resolveDialCodeForCountry(countryCode) || SUPPLIER_DEFAULT_DIAL_CODE
  );
  const localNumber = sanitizePhoneLocalPart(input.localNumber, dialCode, countryCode);

  if (!localNumber) {
    return {
      error: input.allowEmpty ? "" : input.requiredMessage,
      value: null as NormalizedPhoneValue | null,
    };
  }

  if (countryCode === SUPPLIER_DEFAULT_COUNTRY_CODE && localNumber.length !== 9) {
    return {
      error: "Enter the remaining 9 digits after +94.",
      value: null as NormalizedPhoneValue | null,
    };
  }

  const e164 = `+${dialCode}${localNumber}`;
  const parsed = parsePhoneNumberFromString(e164);

  if (!parsed || !parsed.isValid()) {
    return {
      error:
        input.invalidMessage ||
        (countryCode === SUPPLIER_DEFAULT_COUNTRY_CODE
          ? "Enter a valid Sri Lankan phone number."
          : "Enter a valid phone number for the selected country."),
      value: null as NormalizedPhoneValue | null,
    };
  }

  return {
    error: "",
    value: {
      countryCode,
      dialCode,
      localNumber,
      e164,
    } satisfies NormalizedPhoneValue,
  };
}
