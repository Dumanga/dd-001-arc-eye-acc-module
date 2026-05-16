"use client";

import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ApiResponse } from "@/lib/api/response";
import currencies from "@/lib/accounting/data/currencies.json";
import type {
  AccountingAccountCategoryOption,
  AccountingAccountSubtypeOption,
  AccountingAccountTypeOption,
  ChartOfAccountFormValues,
  ChartOfAccountMode,
} from "@/lib/accounting/chart-of-accounts-types";

type SelectOption = {
  value: string;
  label: string;
};

type CurrencyRecord = {
  code: string;
  name: string;
};

type LoadState = {
  categories: boolean;
  types: boolean;
  subtypes: boolean;
};

type LoadErrors = {
  categories: string;
  types: string;
  subtypes: string;
};

const initialState: ChartOfAccountFormValues = {
  accountCategoryId: "",
  accountTypeId: "",
  accountSubtypeId: "",
  accountCode: "",
  accountName: "",
  currency: "LKR",
};

async function fetchLookup<T>(input: string, signal: AbortSignal) {
  const response = await fetch(input, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Failed to load lookup data.");
  }

  return payload.data;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-[#3f3a36]">
      {label}
      {required ? <span className="ml-1 text-[#ff7101]">*</span> : null}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? placeholder;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(320, openUpward ? spaceAbove - 12 : spaceBelow - 12));
      const top = openUpward ? Math.max(16, rect.top - Math.min(320, maxHeight) - 10) : rect.bottom + 10;

      setPanelStyle({
        left: rect.left,
        top,
        width: rect.width,
        maxHeight,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#a09388]"
            : open
              ? "border-[#ffba82] bg-white ring-4 ring-[#ffe7d4]"
              : "border-[#e2d8cf] bg-white text-[#1f1d1c] hover:border-[#d7cabe]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "text-[#1f1d1c]" : "text-[#a2978c]"}>{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180 text-[#ff7101]" : "text-[#9a8f85]"}`}
        />
      </button>

      {open && typeof document !== "undefined" && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[90] overflow-hidden rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fff9f3_100%)] shadow-[0_20px_48px_rgba(31,29,28,0.12)]"
              style={{
                left: panelStyle.left,
                top: panelStyle.top,
                width: panelStyle.width,
              }}
            >
              <div className="overflow-y-auto p-2" style={{ maxHeight: panelStyle.maxHeight }}>
                {options.map((option) => {
                  const isSelected = value === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${
                        isSelected
                          ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                          : "text-[#2d2926] hover:bg-[#fff7f0]"
                      }`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span>{option.label}</span>
                      {isSelected ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[#a2978c] ${
        disabled
          ? "cursor-not-allowed border-[#e6ddd5] bg-[#f6f2ed] text-[#887d73]"
          : "border-[#e2d8cf] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
      }`}
    />
  );
}

export function AccountFormPanel({
  formId = "chart-of-account-create-form",
  mode = "create",
  initialValues,
  onSubmit,
  showInsights = true,
  serverError,
  codeLocked = false,
}: {
  formId?: string;
  mode?: ChartOfAccountMode;
  initialValues?: Partial<ChartOfAccountFormValues>;
  onSubmit?: (form: ChartOfAccountFormValues) => void;
  showInsights?: boolean;
  serverError?: string | null;
  // Lock the account code field. Set true when the account already has
  // journal entries — historical rows snapshot the code, so changing it
  // here would create reporting ambiguity. The name remains editable.
  codeLocked?: boolean;
}) {
  const mergedInitialValues = {
    ...initialState,
    ...initialValues,
    currency: initialValues?.currency ?? "LKR",
  };
  const [form, setForm] = useState<ChartOfAccountFormValues>(mergedInitialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [categoryOptions, setCategoryOptions] = useState<AccountingAccountCategoryOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<AccountingAccountTypeOption[]>([]);
  const [subtypeOptions, setSubtypeOptions] = useState<AccountingAccountSubtypeOption[]>([]);
  const [loading, setLoading] = useState<LoadState>({
    categories: true,
    types: Boolean(mergedInitialValues.accountCategoryId),
    subtypes: Boolean(mergedInitialValues.accountTypeId),
  });
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({
    categories: "",
    types: "",
    subtypes: "",
  });

  const isViewMode = mode === "view";
  const disableClassificationFields = mode !== "create";
  const disableTextFields = mode === "view";

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    fetchLookup<AccountingAccountCategoryOption[]>("/api/accounting/account-categories", controller.signal)
      .then((items) => {
        if (isCurrent) {
          setCategoryOptions(items);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent && !(error instanceof DOMException && error.name === "AbortError")) {
          setLoadErrors((current) => ({
            ...current,
            categories: error instanceof Error ? error.message : "Unable to load account categories.",
          }));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading((current) => ({ ...current, categories: false }));
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!form.accountCategoryId) {
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;

    fetchLookup<AccountingAccountTypeOption[]>(
      `/api/accounting/account-types?categoryId=${encodeURIComponent(form.accountCategoryId)}`,
      controller.signal
    )
      .then((items) => {
        if (isCurrent) {
          setTypeOptions(items);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent && !(error instanceof DOMException && error.name === "AbortError")) {
          setLoadErrors((current) => ({
            ...current,
            types: error instanceof Error ? error.message : "Unable to load account types.",
          }));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading((current) => ({ ...current, types: false }));
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [form.accountCategoryId]);

  useEffect(() => {
    if (!form.accountTypeId) {
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;

    fetchLookup<AccountingAccountSubtypeOption[]>(
      `/api/accounting/account-subtypes?typeId=${encodeURIComponent(form.accountTypeId)}`,
      controller.signal
    )
      .then((items) => {
        if (isCurrent) {
          setSubtypeOptions(items);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent && !(error instanceof DOMException && error.name === "AbortError")) {
          setLoadErrors((current) => ({
            ...current,
            subtypes: error instanceof Error ? error.message : "Unable to load account subtypes.",
          }));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading((current) => ({ ...current, subtypes: false }));
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [form.accountTypeId]);

  const currencyOptions = useMemo<SelectOption[]>(() => {
    return Object.values(currencies as Record<string, CurrencyRecord>)
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((currency) => ({
        value: currency.code,
        label: `${currency.code} - ${currency.name}`,
      }));
  }, []);

  const categorySelectOptions = useMemo<SelectOption[]>(
    () => categoryOptions.map((category) => ({ value: category.id, label: category.name })),
    [categoryOptions]
  );

  const typeSelectOptions = useMemo<SelectOption[]>(
    () => typeOptions.map((type) => ({ value: type.id, label: type.name })),
    [typeOptions]
  );

  const subtypeSelectOptions = useMemo<SelectOption[]>(
    () => subtypeOptions.map((subtype) => ({ value: subtype.id, label: subtype.name })),
    [subtypeOptions]
  );

  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === form.accountCategoryId) ?? null,
    [categoryOptions, form.accountCategoryId]
  );

  const selectedType = useMemo(
    () => typeOptions.find((type) => type.id === form.accountTypeId) ?? null,
    [form.accountTypeId, typeOptions]
  );

  const selectedSubtype = useMemo(
    () => subtypeOptions.find((subtype) => subtype.id === form.accountSubtypeId) ?? null,
    [form.accountSubtypeId, subtypeOptions]
  );

  const selectedCurrencyLabel = useMemo(
    () => currencyOptions.find((option) => option.value === form.currency)?.label ?? form.currency,
    [currencyOptions, form.currency]
  );

  const contextMessage = useMemo(() => {
    if (selectedSubtype?.description) {
      return selectedSubtype.description;
    }

    if (selectedType?.description) {
      return selectedType.description;
    }

    if (selectedCategory?.description) {
      return selectedCategory.description;
    }

    if (selectedSubtype && selectedType && selectedCategory) {
      return `${selectedSubtype.name} is mapped under ${selectedType.name} in ${selectedCategory.name}.`;
    }

    if (selectedType && selectedCategory) {
      return `${selectedType.name} belongs to ${selectedCategory.name}.`;
    }

    if (selectedCategory) {
      return `${selectedCategory.name} is one of the core accounting categories.`;
    }

    return "";
  }, [selectedCategory, selectedSubtype, selectedType]);

  const codeTooLong = form.accountCode.length > 30;
  const nameTooLong = form.accountName.length > 120;
  const showCurrency = Boolean(selectedType?.requiresCurrency);

  const errors = {
    accountCategoryId: touched.accountCategoryId && !form.accountCategoryId ? "Account category is required." : "",
    accountTypeId: touched.accountTypeId && !form.accountTypeId ? "Account type is required." : "",
    accountSubtypeId: touched.accountSubtypeId && !form.accountSubtypeId ? "Account subtype is required." : "",
    accountCode:
      touched.accountCode && !form.accountCode
        ? "Account code is required."
        : codeTooLong
          ? "Account code must be 30 characters or fewer."
          : "",
    accountName:
      touched.accountName && !form.accountName
        ? "Account name is required."
        : nameTooLong
          ? "Account name must be 120 characters or fewer."
          : "",
    currency:
      touched.currency && showCurrency && !form.currency ? "Currency is required for this account type." : "",
  };

  const isValid =
    Boolean(form.accountCategoryId) &&
    Boolean(form.accountTypeId) &&
    Boolean(form.accountSubtypeId) &&
    Boolean(form.accountCode) &&
    Boolean(form.accountName) &&
    (!showCurrency || Boolean(form.currency)) &&
    !codeTooLong &&
    !nameTooLong;

  function updateField<K extends keyof ChartOfAccountFormValues>(
    key: K,
    value: ChartOfAccountFormValues[K]
  ) {
    if (key === "accountCategoryId") {
      setTypeOptions([]);
      setSubtypeOptions([]);
      setLoadErrors((current) => ({ ...current, types: "", subtypes: "" }));
      setLoading((current) => ({
        ...current,
        types: Boolean(value),
        subtypes: false,
      }));
    }

    if (key === "accountTypeId") {
      setSubtypeOptions([]);
      setLoadErrors((current) => ({ ...current, subtypes: "" }));
      setLoading((current) => ({
        ...current,
        subtypes: Boolean(value),
      }));
    }

    setForm((current) => {
      if (key === "accountCategoryId") {
        return {
          ...current,
          accountCategoryId: value as string,
          accountTypeId: "",
          accountSubtypeId: "",
          currency: "LKR",
        };
      }

      if (key === "accountTypeId") {
        const nextType = typeOptions.find((type) => type.id === value);

        return {
          ...current,
          accountTypeId: value as string,
          accountSubtypeId: "",
          currency: nextType?.requiresCurrency ? current.currency : "LKR",
        };
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      accountCategoryId: true,
      accountTypeId: true,
      accountSubtypeId: true,
      accountCode: true,
      accountName: true,
      currency: true,
    });

    if (!isValid || isViewMode) {
      return;
    }

    onSubmit?.(form);
  }

  const title =
    mode === "create" ? "Create a new ledger account" : mode === "edit" ? "Edit ledger account" : "View ledger account";
  const structureText =
    mode === "create"
      ? "Choose the accounting hierarchy and define the account before saving it to the chart."
      : mode === "edit"
        ? "Classification is locked after creation. Only the code and name can be adjusted here."
        : "Review the saved accounting structure and preview for this ledger account.";

  return (
    <div className="grid gap-6">
      <form
        id={formId}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)] shadow-[0_18px_42px_rgba(27,24,22,0.05)]"
      >
        <div className="grid gap-6 p-6">
          {serverError ? (
            <div className="rounded-[22px] border border-[#ffd7cf] bg-[linear-gradient(180deg,#fff8f6_0%,#fff1ee_100%)] px-4 py-3 text-sm text-[#9b4a2d]">
              {serverError}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[26px] border border-[#ece2d8] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7ef_100%)] p-5">
              <h3 className="font-sans text-xl font-semibold text-[#1f1d1c]">Account details</h3>
              <p className="mt-2 text-sm leading-6 text-[#766c64]">{structureText}</p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel label="Account Category" required />
                  <SelectField
                    value={form.accountCategoryId}
                    onChange={(value) => updateField("accountCategoryId", value)}
                    options={categorySelectOptions}
                    placeholder={loading.categories ? "Loading account categories..." : "Select account category"}
                    disabled={
                      loading.categories ||
                      categorySelectOptions.length === 0 ||
                      disableClassificationFields
                    }
                  />
                  {(loadErrors.categories || errors.accountCategoryId) ? (
                    <p className="mt-2 text-xs font-medium text-[#c75b1a]">
                      {loadErrors.categories || errors.accountCategoryId}
                    </p>
                  ) : null}
                </div>

                <div>
                  <FieldLabel label="Account Type" required />
                  <SelectField
                    value={form.accountTypeId}
                    onChange={(value) => updateField("accountTypeId", value)}
                    options={typeSelectOptions}
                    placeholder={
                      !form.accountCategoryId
                        ? "Select account category first"
                        : loading.types
                          ? "Loading account types..."
                          : "Select account type"
                    }
                    disabled={
                      !form.accountCategoryId ||
                      loading.types ||
                      typeSelectOptions.length === 0 ||
                      disableClassificationFields
                    }
                  />
                  {(loadErrors.types || errors.accountTypeId) ? (
                    <p className="mt-2 text-xs font-medium text-[#c75b1a]">{loadErrors.types || errors.accountTypeId}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2 md:items-start">
                <div>
                  <FieldLabel label="Account Subtype" required />
                  <SelectField
                    value={form.accountSubtypeId}
                    onChange={(value) => updateField("accountSubtypeId", value)}
                    options={subtypeSelectOptions}
                    placeholder={
                      !form.accountTypeId
                        ? "Select account type first"
                        : loading.subtypes
                          ? "Loading account subtypes..."
                          : "Select account subtype"
                    }
                    disabled={
                      !form.accountTypeId ||
                      loading.subtypes ||
                      subtypeSelectOptions.length === 0 ||
                      disableClassificationFields
                    }
                  />
                  {(loadErrors.subtypes || errors.accountSubtypeId) ? (
                    <p className="mt-2 text-xs font-medium text-[#c75b1a]">
                      {loadErrors.subtypes || errors.accountSubtypeId}
                    </p>
                  ) : null}
                </div>

                <div>
                  <FieldLabel label="Account Code" required />
                  <TextField
                    value={form.accountCode}
                    onChange={(value) => updateField("accountCode", value)}
                    placeholder="Enter account code"
                    maxLength={30}
                    disabled={disableTextFields || codeLocked}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className={errors.accountCode ? "font-medium text-[#c75b1a]" : "text-[#8c8076]"}>
                      {errors.accountCode ||
                        (codeLocked
                          ? "Code is locked because this account has journal entries. Edit the name instead."
                          : "Must remain unique across the chart of accounts.")}
                    </span>
                    <span className="text-[#9a8f85]">{form.accountCode.length}/30</span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <FieldLabel label="Account Name / Description" required />
                <TextField
                  value={form.accountName}
                  onChange={(value) => updateField("accountName", value)}
                  placeholder="Enter account name"
                  maxLength={120}
                  disabled={disableTextFields}
                />
                {errors.accountName ? (
                  <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.accountName}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-5">
              {showCurrency ? (
                <div className="rounded-[26px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#ffffff_0%,#fffaf4_100%)] p-5">
                  <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">Currency</h3>
                  <p className="mt-2 text-sm leading-6 text-[#7a7068]">
                    Currency is attached only to account types that require cash-equivalent tracking.
                  </p>
                  <div className="mt-5">
                    <FieldLabel label="Currency" required={selectedType?.requiresCurrency} />
                    <SelectField
                      value={form.currency}
                      onChange={(value) => updateField("currency", value)}
                      options={currencyOptions}
                      placeholder="Select currency"
                      disabled={mode !== "create"}
                    />
                    {errors.currency ? (
                      <p className="mt-2 text-xs font-medium text-[#c75b1a]">{errors.currency}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-[26px] border border-dashed border-[#eadfd5] bg-[#fcfaf7] p-5">
                  <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">Currency</h3>
                  <p className="mt-2 text-sm leading-6 text-[#7a7068]">
                    Currency remains hidden unless the selected account type requires it.
                  </p>
                </div>
              )}

              <div className="rounded-[26px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fff8f0_100%)] p-5">
                <h3 className="font-sans text-lg font-semibold text-[#1f1d1c]">Preview</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Category</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{selectedCategory?.name || "Not selected"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Type</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{selectedType?.name || "Not selected"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Subtype</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{selectedSubtype?.name || "Not selected"}</p>
                  </div>
                  {showCurrency ? (
                    <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Currency</p>
                      <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{selectedCurrencyLabel}</p>
                    </div>
                  ) : null}
                  <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Display</p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                      {form.accountCode || "----"} {form.accountName || title}
                    </p>
                  </div>
                  {contextMessage ? (
                    <div className="rounded-[18px] border border-[#eee3d8] bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">Context</p>
                      <p className="mt-1 text-sm leading-6 text-[#736861]">{contextMessage}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {showInsights ? (
        <section className="relative overflow-hidden rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(135deg,#fffaf5_0%,#fff4e8_52%,#fff0e1_100%)] p-6 shadow-[0_18px_42px_rgba(27,24,22,0.05)]">
          <div className="absolute right-[-2rem] top-[-2rem] h-32 w-32 rounded-full bg-[#ffd9bb]/65 blur-3xl" />
          <div className="relative grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#ffd9bb] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#ff7101]">
                <Sparkles className="h-3.5 w-3.5" />
                Account Setup
              </p>
              <h2 className="mt-3 font-sans text-[2rem] font-semibold tracking-[-0.04em] text-[#1f1d1c]">
                {title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#72675f]">
                Use this workspace to define the account hierarchy, code, and display name without leaving the Chart of Accounts screen.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/70 bg-white/85 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                  Structure
                </p>
                <p className="mt-2 text-base font-semibold text-[#1f1d1c]">Database-backed hierarchy</p>
                <p className="mt-1 text-sm leading-6 text-[#7a7068]">
                  Category, type, and subtype are loaded from the seeded accounting foundation tables.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/85 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8e7f72]">
                  Edit Rule
                </p>
                <p className="mt-2 text-base font-semibold text-[#1f1d1c]">Code and name only</p>
                <p className="mt-1 text-sm leading-6 text-[#7a7068]">
                  Once an account is created, only the code and name remain editable in this flow.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
