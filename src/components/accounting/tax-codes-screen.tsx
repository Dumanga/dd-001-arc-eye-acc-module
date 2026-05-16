"use client";

import { ArrowLeft, ArrowRight, CalendarClock, Loader2, PencilLine, Plus, ReceiptCent, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountingPageIntro, PremiumMetricGrid, SurfaceCard } from "@/components/accounting/accounting-ui";
import { TaxCodeFormPanel } from "@/components/accounting/tax-code-form-panel";
import type { ApiResponse } from "@/lib/api/response";
import type {
  TaxCodeAccountOption,
  TaxCodeFormValues,
  TaxCodeRecord,
  TaxCodesPayload,
} from "@/lib/accounting/tax-code-types";

const CREATE_FORM_ID = "tax-code-create-form";

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload.data as T;
}

function formatRate(taxCode: TaxCodeRecord) {
  return taxCode.calculation === "Percentage" ? `${taxCode.rate}%` : taxCode.rate;
}

function getTaxCodeStatusStyles(status: TaxCodeRecord["status"]) {
  if (status === "Active") {
    return {
      card: "border-[#cfe8da] bg-[radial-gradient(circle_at_top_left,rgba(234,250,240,0.95),transparent_34%),linear-gradient(180deg,#fffdfa_0%,#f7fdf9_100%)]",
      rail: "bg-[linear-gradient(180deg,#18a66a_0%,#a9e2c4_100%)]",
      badge: "border-[#c7e8d5] bg-[#effbf4] text-[#176947]",
      dot: "bg-[#18a66a]",
      note: "Visible in active assignment flows.",
    };
  }

  return {
    card: "border-[#f3d6c4] bg-[radial-gradient(circle_at_top_left,rgba(255,241,233,0.96),transparent_34%),linear-gradient(180deg,#fffdfa_0%,#fff6f1_100%)]",
    rail: "bg-[linear-gradient(180deg,#ff8a3d_0%,#ffd0b1_100%)]",
    badge: "border-[#f6d4be] bg-[#fff3ea] text-[#b45c1c]",
    dot: "bg-[#ff8a3d]",
    note: "Hidden from active assignment flows.",
  };
}

function toFormValues(record: TaxCodeRecord): TaxCodeFormValues {
  return {
    taxCode: record.taxCode,
    taxName: record.taxName,
    taxType: record.taxType,
    calculation: record.calculation,
    rate: record.rate,
    outputTaxAccount: record.outputTaxAccountId ?? "",
    inputTaxAccount: record.inputTaxAccountId ?? "",
    applicableOn: record.applicableOn,
    effectiveFrom: record.effectiveFrom,
    status: record.status,
  };
}

export function TaxCodesScreen({ initialData }: { initialData?: TaxCodesPayload }) {
  const [screenState, setScreenState] = useState<
    { mode: "list" } | { mode: "create" } | { mode: "edit"; item: TaxCodeRecord }
  >({ mode: "list" });
  const [items, setItems] = useState<TaxCodeRecord[]>(() => initialData?.items ?? []);
  const [loading, setLoading] = useState(() => !initialData);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadTaxCodes = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      const data = await requestJson<TaxCodesPayload>("/api/accounting/tax-codes");
      setItems(data.items);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load tax codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) {
      return;
    }

    void loadTaxCodes();
  }, [initialData, loadTaxCodes]);

  const metrics = useMemo(() => {
    const activeCount = items.filter((item) => item.status === "Active").length;
    const bothCount = items.filter((item) => item.taxType === "Both").length;
    const percentageCount = items.filter((item) => item.calculation === "Percentage").length;

    return [
      {
        label: "Active Codes",
        value: String(activeCount).padStart(2, "0"),
        detail: "Currently available in assignment flows.",
        icon: ReceiptCent,
        tone: "amber" as const,
      },
      {
        label: "Cross-use Codes",
        value: String(bothCount).padStart(2, "0"),
        detail: "Configured for both sales and purchase documents.",
        icon: ShieldCheck,
        tone: "blue" as const,
      },
      {
        label: "Percentage Based",
        value: String(percentageCount).padStart(2, "0"),
        detail: "Rate-driven codes for standard tax calculations.",
        icon: CalendarClock,
        tone: "green" as const,
      },
    ];
  }, [items]);

  async function handleCreate(form: TaxCodeFormValues) {
    setSaving(true);
    setFormError(null);

    try {
      await requestJson<TaxCodeRecord>("/api/accounting/tax-codes", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setScreenState({ mode: "list" });
      setFormError(null);
      await loadTaxCodes();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to create tax code.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(form: TaxCodeFormValues) {
    if (screenState.mode !== "edit") {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await requestJson<TaxCodeRecord>("/api/accounting/tax-codes", {
        method: "PATCH",
        body: JSON.stringify({
          id: screenState.item.id,
          taxName: form.taxName,
          status: form.status,
        }),
      });

      setScreenState({ mode: "list" });
      setFormError(null);
      await loadTaxCodes();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to update tax code.");
    } finally {
      setSaving(false);
    }
  }

  if (screenState.mode === "create" || screenState.mode === "edit") {
    const isEditMode = screenState.mode === "edit";
    const initialOutputTaxAccountOption: TaxCodeAccountOption | null =
      screenState.mode === "edit" &&
      screenState.item.outputTaxAccountId &&
      screenState.item.outputTaxAccount
        ? {
            id: screenState.item.outputTaxAccountId,
            label: screenState.item.outputTaxAccount,
          }
        : null;
    const initialInputTaxAccountOption: TaxCodeAccountOption | null =
      screenState.mode === "edit" &&
      screenState.item.inputTaxAccountId &&
      screenState.item.inputTaxAccount
        ? {
            id: screenState.item.inputTaxAccountId,
            label: screenState.item.inputTaxAccount,
          }
        : null;

    return (
      <>
        <AccountingPageIntro
          eyebrow={isEditMode ? "ACCOUNTS/ TAX CODES/ EDIT" : "ACCOUNTS/ TAX CODES/ CREATE"}
          title="Tax Codes"
          description={
            isEditMode
              ? "Update the tax name and activation status while keeping the original tax structure locked."
              : "Create a new tax setup with calculation rules, scope, effective date, and linked posting accounts."
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setScreenState({ mode: "list" });
                  setFormError(null);
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="submit"
                form={CREATE_FORM_ID}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isEditMode ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {saving ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Changes" : "Create Tax Code"}
              </button>
            </div>
          }
        />
        <TaxCodeFormPanel
          key={screenState.mode === "edit" ? `edit-${screenState.item.id}` : "create"}
          formId={CREATE_FORM_ID}
          mode={isEditMode ? "edit" : "create"}
          initialValues={isEditMode ? toFormValues(screenState.item) : undefined}
          initialOutputTaxAccountOption={initialOutputTaxAccountOption}
          initialInputTaxAccountOption={initialInputTaxAccountOption}
          existingTaxCodes={items.map((item) => item.taxCode)}
          onSubmit={isEditMode ? handleUpdate : handleCreate}
          serverError={formError}
        />
      </>
    );
  }

  return (
    <>
      <AccountingPageIntro
        eyebrow="ACCOUNTS/ TAX CODES"
        title="Tax Codes"
        description="Manage tax behavior across invoices, POS bills, purchase orders, and supplier-side entries with clean posting visibility."
        action={
          <button
            type="button"
            onClick={() => {
              setScreenState({ mode: "create" });
              setFormError(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            Add Tax Code
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      />

      <PremiumMetricGrid
        items={metrics}
        columns={3}
      />

      <SurfaceCard title="Tax code register" description="Live tax-code list aligned to the create-form fields and accounting posting behavior.">
        <div className="grid gap-3">
          {pageError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {pageError}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-10 text-sm text-[#786f69]">
              <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
              Loading tax codes...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
              <p className="text-base font-semibold text-[#1f1d1c]">No tax codes created yet.</p>
              <p className="mt-2 text-sm text-[#786f69]">Create the first tax code to start mapping tax behavior.</p>
            </div>
          ) : (
            items.map((taxCode) => (
              <div
                key={taxCode.id}
                className={`relative overflow-hidden rounded-[24px] border p-4 shadow-[0_12px_28px_rgba(27,24,22,0.04)] ${getTaxCodeStatusStyles(taxCode.status).card}`}
              >
                <div className={`absolute inset-y-0 left-0 w-1.5 ${getTaxCodeStatusStyles(taxCode.status).rail}`} />
                <div className="flex flex-col gap-4 pl-2 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#fff0e2] px-3 py-1 text-xs font-semibold text-[#b45b12]">
                        {taxCode.taxCode}
                      </span>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${getTaxCodeStatusStyles(taxCode.status).badge}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${getTaxCodeStatusStyles(taxCode.status).dot}`} />
                        {taxCode.status}
                      </span>
                      <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#315d9b]">
                        {taxCode.taxType}
                      </span>
                    </div>
                    <h3 className="mt-3 font-sans text-xl font-semibold text-[#1f1d1c]">{taxCode.taxName}</h3>
                    <p className="mt-1 text-sm text-[#7a7068]">
                      {taxCode.calculation} | {formatRate(taxCode)} | {taxCode.applicableOn}
                    </p>
                    <p className="mt-2 text-sm font-medium text-[#6f655d]">
                      {getTaxCodeStatusStyles(taxCode.status).note}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-[#5f5650] sm:grid-cols-2 xl:min-w-[330px]">
                    <div className="rounded-[18px] border border-[#eee4db] bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                        Effective From
                      </p>
                      <p className="mt-1 font-medium text-[#1f1d1c]">{taxCode.effectiveFrom}</p>
                    </div>
                    <div className="rounded-[18px] border border-[#eee4db] bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                        Calculation
                      </p>
                      <p className="mt-1 font-medium text-[#1f1d1c]">{taxCode.calculation}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-[#eee4db] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                      Output Tax Account (Sales)
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{taxCode.outputTaxAccount || "-"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eee4db] bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
                      Input Tax Account (Purchase)
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1f1d1c]">{taxCode.inputTaxAccount || "-"}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setScreenState({ mode: "edit", item: taxCode });
                      setFormError(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#ead8c8] bg-white px-3.5 py-2 text-sm font-semibold text-[#6a5f56] transition hover:border-[#ffba82] hover:text-[#b45b12]"
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </SurfaceCard>
    </>
  );
}
