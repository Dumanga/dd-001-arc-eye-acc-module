"use client";

import { CircleHelp, PencilLine, Plus, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import {
  DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY,
  UOM_DECIMAL_SCALE,
  deriveUomType,
  formatUomDecimal,
  getUomCategory,
  isUomFixedDecimal,
  normalizeUomName,
  parseUomDecimal,
  sortUomRecords,
  toUomNameLookup,
  type UomCategoryCode,
  type UomRecord,
} from "@/lib/accounting/uom-config";

type UomFormState = {
  name: string;
  ratioToBase: string;
  smallestAllowedQty: string;
  isActive: boolean;
};

type UomRowErrors = {
  name: string;
  ratioToBase: string;
  smallestAllowedQty: string;
};

type DecimalFieldKey = "ratioToBase" | "smallestAllowedQty";

const initialState: UomFormState = {
  name: "",
  ratioToBase: "",
  smallestAllowedQty: DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY,
  isActive: true,
};

const emptyErrors: UomRowErrors = {
  name: "",
  ratioToBase: "",
  smallestAllowedQty: "",
};

function buildSmallestQtyHint({
  unitName,
  ratioToBase,
  smallestAllowedQty,
  baseUnit,
}: {
  unitName?: string;
  ratioToBase?: string;
  smallestAllowedQty?: string;
  baseUnit?: string;
}) {
  const step = parseUomDecimal(smallestAllowedQty || "");
  const ratio = parseUomDecimal(ratioToBase || "");
  const label = unitName?.trim() || "this unit";
  const examples =
    step > 0
      ? [step, step * 2, step * 3].map((value) => formatUomDecimal(String(value)))
      : [];

  return {
    title: "Smallest Allowed Qty",
    lines:
      step > 0
        ? [
            `Minimum step for ${label}: ${formatUomDecimal(String(step))}`,
            `Allowed entries can move like ${examples.join(", ")}`,
            ratio > 0 && baseUnit
              ? `1 ${label} = ${formatUomDecimal(String(ratio))} ${baseUnit}`
              : "This controls the smallest entry step only.",
            "Enter values in exact 5-decimal format, for example 0.01000 or 2.00000.",
            "There is no fixed maximum here. It only defines the minimum step.",
          ]
        : [
            "This controls the smallest step users can enter for the unit.",
            `Default for new rows is ${DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY}, but users can change it.`,
            "Enter values in exact 5-decimal format.",
            "Example: 1.00000 means whole values only. 0.25000 means quarter steps.",
            "It does not define the maximum quantity. It only defines the minimum step.",
          ],
  };
}

function sanitizeDecimal(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const decimal = rest.join("").slice(0, UOM_DECIMAL_SCALE);

  return rest.length ? `${whole}.${decimal}` : whole;
}

function finalizeDecimalInput(value: string) {
  const cleaned = sanitizeDecimal(value).trim();

  if (!cleaned) {
    return "";
  }

  if (cleaned === ".") {
    return "";
  }

  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric)) {
    return cleaned;
  }

  return formatUomDecimal(cleaned, UOM_DECIMAL_SCALE);
}

function hasErrors(errors: UomRowErrors) {
  return Object.values(errors).some(Boolean);
}

function InlineTextField({
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  error?: string;
  maxLength?: number;
}) {
  return (
    <div className="grid gap-1">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
          error
            ? "border-[#efb39d] bg-[#fff8f5] text-[#1f1d1c] ring-2 ring-[#ffede5]"
            : "border-[#ddd4cc] bg-white text-[#1f1d1c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
        } placeholder:text-[#a2978c]`}
      />
      {error ? <p className="text-[11px] font-medium leading-4 text-[#c14d22]">{error}</p> : null}
    </div>
  );
}

function InfoHint({
  title,
  lines,
  align = "center",
}: {
  title: string;
  lines: string[];
  align?: "center" | "right";
}) {
  const panelPosition =
    align === "right"
      ? "right-0 top-full mt-2"
      : "left-1/2 top-full mt-2 -translate-x-1/2";

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={(event) => event.preventDefault()}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#ead7c6] bg-white text-[#9b6b3f] transition hover:border-[#ffba82] hover:text-[#b45b12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffe7d4]"
        aria-label={title}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        className={`pointer-events-none absolute z-10 w-[280px] rounded-[16px] border border-[#ecdccf] bg-white px-4 py-3 text-left text-xs leading-5 text-[#6f655d] opacity-0 shadow-[0_16px_30px_rgba(27,24,22,0.10)] transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${panelPosition}`}
      >
        <span className="block font-semibold text-[#1f1d1c]">{title}</span>
        {lines.map((line) => (
          <span key={line} className="mt-1 block">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

function StatusToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="inline-flex rounded-xl border border-[#e4d9d0] bg-[#fffaf4] p-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            value
              ? "bg-[#1f9f75] text-white shadow-[0_10px_20px_rgba(31,159,117,0.18)]"
              : "text-[#7a7068] hover:bg-white"
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            !value
              ? "bg-[#ff8a3d] text-white shadow-[0_10px_20px_rgba(255,122,18,0.18)]"
              : "text-[#7a7068] hover:bg-white"
          }`}
        >
          Inactive
        </button>
      </div>
    </div>
  );
}

function buildErrors(
  form: UomFormState,
  records: UomRecord[],
  ignoreId?: string
): UomRowErrors {
  const nextLookup = toUomNameLookup(form.name);
  const duplicateName = records.some(
    (item) => item.id !== ignoreId && toUomNameLookup(item.name) === nextLookup
  );
  const ratioValue = Number(form.ratioToBase);
  const smallestQtyValue = Number(form.smallestAllowedQty);

  return {
    name: !form.name.trim()
      ? "Enter unit name."
      : form.name.length > 80
        ? "Keep unit name within 80 characters."
        : duplicateName
          ? "This unit already exists in this category."
          : "",
    ratioToBase: !form.ratioToBase.trim()
      ? "Enter ratio."
      : !isUomFixedDecimal(form.ratioToBase)
        ? "Enter ratio with exactly 5 decimal places."
      : !Number.isFinite(ratioValue) || ratioValue <= 0
        ? "Ratio must be above zero."
        : ratioValue === 1
          ? "Ratio 1.00000 belongs to the base unit."
          : "",
    smallestAllowedQty: !form.smallestAllowedQty.trim()
      ? "Enter smallest qty."
      : !isUomFixedDecimal(form.smallestAllowedQty)
        ? "Enter smallest qty with exactly 5 decimal places."
      : !Number.isFinite(smallestQtyValue) || smallestQtyValue <= 0
        ? "Smallest qty must be above zero."
        : "",
  };
}

function normalizeForm(
  categoryCode: UomCategoryCode,
  form: UomFormState
): Omit<UomRecord, "id" | "createdAt" | "updatedAt" | "isSystem" | "addedBy" | "isBase"> {
  return {
    categoryCode,
    name: normalizeUomName(form.name),
    ratioToBase: formatUomDecimal(form.ratioToBase.trim(), UOM_DECIMAL_SCALE),
    smallestAllowedQty: formatUomDecimal(form.smallestAllowedQty.trim(), UOM_DECIMAL_SCALE),
    isActive: form.isActive,
  };
}

export function UomFormPanel({
  formId = "uom-create-form",
  categoryCode,
  existingUoms,
  currentUserName,
  serverError,
  isSubmitting = false,
  onCreate,
  onCreateAndNext,
  onUpdate,
}: {
  formId?: string;
  categoryCode: UomCategoryCode;
  existingUoms: UomRecord[];
  currentUserName: string;
  serverError?: string | null;
  isSubmitting?: boolean;
  onCreate?: (
    form: Omit<UomRecord, "id" | "createdAt" | "updatedAt" | "isSystem" | "addedBy" | "isBase">
  ) => Promise<boolean> | boolean;
  onCreateAndNext?: (
    form: Omit<UomRecord, "id" | "createdAt" | "updatedAt" | "isSystem" | "addedBy" | "isBase">
  ) => Promise<boolean> | boolean;
  onUpdate?: (
    id: string,
    form: Pick<UomRecord, "name" | "ratioToBase" | "smallestAllowedQty" | "isActive">
  ) => Promise<boolean> | boolean;
}) {
  const category = getUomCategory(categoryCode);
  const categoryUnits = useMemo(
    () => sortUomRecords(existingUoms.filter((item) => item.categoryCode === categoryCode)),
    [categoryCode, existingUoms]
  );

  const [draftRowOpen, setDraftRowOpen] = useState(true);
  const [draft, setDraft] = useState<UomFormState>(initialState);
  const [draftErrors, setDraftErrors] = useState<UomRowErrors>(emptyErrors);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UomFormState>(initialState);
  const [editErrors, setEditErrors] = useState<UomRowErrors>(emptyErrors);

  function finalizeDraftDecimalField(field: DecimalFieldKey) {
    setDraft((current) => ({
      ...current,
      [field]: finalizeDecimalInput(current[field]),
    }));
  }

  function finalizeEditDecimalField(field: DecimalFieldKey) {
    setEditForm((current) => ({
      ...current,
      [field]: finalizeDecimalInput(current[field]),
    }));
  }

  function validateDraft() {
    const errors = buildErrors(draft, categoryUnits);
    setDraftErrors(errors);
    return !hasErrors(errors);
  }

  function validateEdit() {
    if (!editingRowId) {
      return false;
    }

    const errors = buildErrors(editForm, categoryUnits, editingRowId);
    setEditErrors(errors);
    return !hasErrors(errors);
  }

  function startEditing(unit: UomRecord) {
    setEditingRowId(unit.id);
    setEditForm({
      name: unit.name,
      ratioToBase: formatUomDecimal(unit.ratioToBase, UOM_DECIMAL_SCALE),
      smallestAllowedQty: formatUomDecimal(unit.smallestAllowedQty, UOM_DECIMAL_SCALE),
      isActive: unit.isActive,
    });
    setEditErrors(emptyErrors);
  }

  function stopEditing() {
    setEditingRowId(null);
    setEditForm(initialState);
    setEditErrors(emptyErrors);
  }

  async function saveEdit() {
    if (!editingRowId || !validateEdit()) {
      return;
    }

    const wasSaved = await onUpdate?.(editingRowId, {
      name: normalizeUomName(editForm.name),
      ratioToBase: formatUomDecimal(editForm.ratioToBase.trim(), UOM_DECIMAL_SCALE),
      smallestAllowedQty: formatUomDecimal(editForm.smallestAllowedQty.trim(), UOM_DECIMAL_SCALE),
      isActive: editForm.isActive,
    });

    if (wasSaved === false) {
      return;
    }

    stopEditing();
  }

  function renderReadonlyRow(unit: UomRecord) {
    const isReference = unit.isBase || parseUomDecimal(unit.ratioToBase) === 1;

    return (
      <tr key={unit.id} className="border-t border-[#ece6df] bg-white transition hover:bg-[#fffaf4]">
        <td className="px-4 py-4 text-sm font-medium text-[#1f1d1c]">{unit.name}</td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">{deriveUomType(unit.ratioToBase)}</td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">{formatUomDecimal(unit.ratioToBase)}</td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              unit.isActive ? "bg-[#edf9f1] text-[#1b7a50]" : "bg-[#fff3e8] text-[#b56a16]"
            }`}
          >
            {unit.isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">{formatUomDecimal(unit.smallestAllowedQty)}</td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">{unit.isSystem ? "Default" : unit.addedBy}</td>
        <td className="px-4 py-4 text-sm">
          {isReference ? (
            <span className="inline-flex rounded-full bg-[#f3eee8] px-2.5 py-1 text-[11px] font-semibold text-[#8a7b6f]">
              Base locked
            </span>
          ) : (
            <button
              type="button"
              onClick={() => startEditing(unit)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#ead8c8] bg-white px-3 py-2 text-xs font-semibold text-[#6a5f56] transition hover:border-[#ffba82] hover:text-[#b45b12]"
            >
              <PencilLine className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </td>
      </tr>
    );
  }

  function renderEditableRow(unit: UomRecord) {
    return (
      <tr key={unit.id} className="border-t border-[#f0d9c6] bg-[#fff8f1] align-top">
        <td className="px-4 py-4">
          <InlineTextField
            value={editForm.name}
            onChange={(value) => {
              setEditForm((current) => ({ ...current, name: value }));
              setEditErrors((current) => ({ ...current, name: "" }));
            }}
            placeholder="Unit name"
            error={editErrors.name}
            maxLength={80}
          />
        </td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">
          <div className="rounded-xl border border-[#eadfd5] bg-white px-3 py-2.5 font-medium">
            {editForm.ratioToBase ? deriveUomType(editForm.ratioToBase) : "Waiting for ratio"}
          </div>
        </td>
        <td className="px-4 py-4">
          <InlineTextField
            value={editForm.ratioToBase}
            onChange={(value) => {
              const nextRatio = sanitizeDecimal(value);

              setEditForm((current) => ({
                ...current,
                ratioToBase: nextRatio,
              }));
              setEditErrors((current) => ({
                ...current,
                ratioToBase: "",
              }));
            }}
            placeholder="2.00000"
            onBlur={() => finalizeEditDecimalField("ratioToBase")}
            error={editErrors.ratioToBase}
            maxLength={16}
          />
        </td>
        <td className="px-4 py-4">
          <StatusToggle
            value={editForm.isActive}
            onChange={(value) => setEditForm((current) => ({ ...current, isActive: value }))}
          />
        </td>
        <td className="px-4 py-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <InlineTextField
                value={editForm.smallestAllowedQty}
                onChange={(value) => {
                  setEditForm((current) => ({ ...current, smallestAllowedQty: sanitizeDecimal(value) }));
                  setEditErrors((current) => ({ ...current, smallestAllowedQty: "" }));
                }}
                onBlur={() => finalizeEditDecimalField("smallestAllowedQty")}
                placeholder={DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY}
                error={editErrors.smallestAllowedQty}
                maxLength={16}
              />
            </div>
            <div className="shrink-0 pt-2">
              <InfoHint
                align="right"
                {...buildSmallestQtyHint({
                  unitName: editForm.name,
                  ratioToBase: editForm.ratioToBase,
                  smallestAllowedQty: editForm.smallestAllowedQty,
                  baseUnit: category?.baseUnit,
                })}
              />
            </div>
          </div>
        </td>
        <td className="px-4 py-4 text-sm text-[#1f1d1c]">{unit.isSystem ? "Default" : unit.addedBy}</td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void saveEdit();
              }}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1f9f75] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#177a5a] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Save className="h-3.5 w-3.5" />
              {isSubmitting ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={stopEditing}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-xs font-semibold text-[#655c55] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault();

        if (!draftRowOpen) {
          setDraftRowOpen(true);
          return;
        }

        if (!validateDraft()) {
          return;
        }

        const nativeEvent = event.nativeEvent as SubmitEvent;
        const submitter = nativeEvent.submitter as HTMLButtonElement | null;
        const intent = submitter?.dataset.intent ?? "create";
        const normalized = normalizeForm(categoryCode, draft);

        if (intent === "create-and-next") {
          const wasCreated = await onCreateAndNext?.(normalized);
          if (wasCreated === false) {
            return;
          }
          setDraft(initialState);
          setDraftErrors(emptyErrors);
          setDraftRowOpen(true);
          return;
        }

        await onCreate?.(normalized);
      }}
    >
      <SurfaceCard
        title={`${category?.name || "UOM"} Category Register`}
        description={`Use the table below to review the existing units under ${category?.name || "this category"}, then add one more row using the same base unit ${category?.baseUnit || "already fixed by the system"}.`}
      >
        <div className="grid gap-4">
          {serverError ? (
            <div className="rounded-[20px] border border-[#f0d4ca] bg-[linear-gradient(180deg,#fffdfa_0%,#fff4f1_100%)] px-4 py-3 text-sm text-[#8a5643]">
              {serverError}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#eadfd5] bg-[linear-gradient(135deg,#fffdfa_0%,#fff7f0_100%)] px-4 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#fff0e2] px-3 py-1 text-xs font-semibold text-[#b45b12]">
                  {category?.name || "Category"}
                </span>
                <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#315d9b]">
                  Base Unit: {category?.baseUnit || "Base"}
                </span>
                <span className="rounded-full bg-[#effaf3] px-3 py-1 text-xs font-semibold text-[#1b7a50]">
                  {categoryUnits.length} rows
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#736862]">
                Ratio `1.00000` belongs to the base unit, so every extra row should be bigger or smaller than that fixed reference.
              </p>
            </div>
            {draftRowOpen ? (
              <div className="rounded-[18px] border border-[#ffd8ba] bg-white px-4 py-3 text-sm text-[#8f5f35]">
                New row is ready at the bottom of the table.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDraftRowOpen(true)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(255,122,18,0.18)] transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Plus className="h-4 w-4" />
                Add New Row
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-[24px] border border-[#ddd8d1] shadow-[0_12px_28px_rgba(27,24,22,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse">
                <thead className="bg-[#faf6f1]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Unit of Measure</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Ratio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Active</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">
                      <span className="inline-flex items-center gap-2">
                        Smallest Allowed Qty
                        <InfoHint
                          title="Smallest Allowed Qty"
                          lines={[
                            "This controls the smallest step users can enter for that unit.",
                            "Enter values in exact 5-decimal format.",
                            "Example: 1.00000 means whole values only. 0.25000 means quarter steps.",
                            "It does not define the maximum quantity. It only defines the minimum step.",
                          ]}
                        />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Added By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8f7e72]">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {categoryUnits.map((unit) =>
                    editingRowId === unit.id ? renderEditableRow(unit) : renderReadonlyRow(unit)
                  )}

                  {draftRowOpen ? (
                    <tr className="border-t border-[#f0d9c6] bg-[#fff3e6] align-top">
                      <td className="px-4 py-4">
                        <InlineTextField
                          value={draft.name}
                          onChange={(value) => {
                            setDraft((current) => ({ ...current, name: value }));
                            setDraftErrors((current) => ({ ...current, name: "" }));
                          }}
                          placeholder="Enter unit name"
                          error={draftErrors.name}
                          maxLength={80}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm text-[#1f1d1c]">
                        <div className="rounded-xl border border-[#eadfd5] bg-white px-3 py-2.5 font-medium">
                          {draft.ratioToBase ? deriveUomType(draft.ratioToBase) : "Will calculate from ratio"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <InlineTextField
                          value={draft.ratioToBase}
                          onChange={(value) => {
                            const nextRatio = sanitizeDecimal(value);

                            setDraft((current) => ({
                              ...current,
                              ratioToBase: nextRatio,
                            }));
                            setDraftErrors((current) => ({
                              ...current,
                              ratioToBase: "",
                            }));
                          }}
                          onBlur={() => finalizeDraftDecimalField("ratioToBase")}
                          placeholder="2.00000"
                          error={draftErrors.ratioToBase}
                          maxLength={16}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <StatusToggle
                          value={draft.isActive}
                          onChange={(value) => setDraft((current) => ({ ...current, isActive: value }))}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <InlineTextField
                              value={draft.smallestAllowedQty}
                              onChange={(value) => {
                                setDraft((current) => ({ ...current, smallestAllowedQty: sanitizeDecimal(value) }));
                                setDraftErrors((current) => ({ ...current, smallestAllowedQty: "" }));
                              }}
                              onBlur={() => finalizeDraftDecimalField("smallestAllowedQty")}
                              placeholder={DEFAULT_NEW_UOM_SMALLEST_ALLOWED_QTY}
                              error={draftErrors.smallestAllowedQty}
                              maxLength={16}
                            />
                          </div>
                          <div className="shrink-0 pt-2">
                            <InfoHint
                              align="right"
                              {...buildSmallestQtyHint({
                                unitName: draft.name,
                                ratioToBase: draft.ratioToBase,
                                smallestAllowedQty: draft.smallestAllowedQty,
                                baseUnit: category?.baseUnit,
                              })}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#1f1d1c]">{currentUserName}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(initialState);
                            setDraftErrors(emptyErrors);
                            setDraftRowOpen(false);
                          }}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-xs font-semibold text-[#655c55] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <X className="h-3.5 w-3.5" />
                          Discard row
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[#ece6df] bg-[#fffaf5] px-4 py-3">
              <p className="text-sm text-[#756b64]">
                Existing rows stay visible for comparison. The base row remains locked, while the other rows can be edited here for now in the UI.
              </p>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </form>
  );
}
