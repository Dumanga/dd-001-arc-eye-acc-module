"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, PencilLine, Plus, X } from "lucide-react";
import { AccountFormPanel } from "@/components/accounting/account-form-panel";
import { ChartOfAccountsBoard } from "@/components/accounting/chart-of-accounts-board";
import { AccountingPageIntro } from "@/components/accounting/accounting-ui";
import type { ApiResponse } from "@/lib/api/response";
import type {
  ChartOfAccountFormValues,
  ChartOfAccountRecord,
} from "@/lib/accounting/chart-of-accounts-types";

const FORM_ID = "chart-of-account-form";

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "view"; account: ChartOfAccountRecord }
  | { mode: "edit"; account: ChartOfAccountRecord };

async function requestJson<T>(input: string, init: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success || payload.data === null) {
    throw new Error(payload.message || "Request failed.");
  }

  return {
    ...payload,
    data: payload.data as T,
  };
}

function toFormValues(account: ChartOfAccountRecord): ChartOfAccountFormValues {
  return {
    accountCategoryId: account.categoryId,
    accountTypeId: account.typeId,
    accountSubtypeId: account.subtypeId,
    accountCode: account.code,
    accountName: account.name,
    currency: account.currencyCode ?? "LKR",
  };
}

function SuccessToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed right-5 top-5 z-[110] w-full max-w-sm">
      <div className="flex items-start gap-3 rounded-[24px] border border-[#bfe8cd] bg-[linear-gradient(180deg,#f5fff8_0%,#eafff0_100%)] px-4 py-3 shadow-[0_18px_42px_rgba(27,24,22,0.12)]">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#18a66a] text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#176947]">Success</p>
          <p className="mt-1 text-sm leading-6 text-[#2f5a43]">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#4e7b60] transition hover:bg-white/70"
          aria-label="Dismiss success message"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ErrorDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#120f0c]/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#f0d4ca] bg-[linear-gradient(180deg,#fffdfa_0%,#fff4f1_100%)] p-6 shadow-[0_24px_60px_rgba(18,15,12,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c45d34]">
              Request Failed
            </p>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-[#1f1d1c]">
              Unable to save account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#ead7cf] bg-white text-[#6f655d] transition hover:bg-[#fff7f2]"
            aria-label="Close error dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-7 text-[#7a6359]">{message}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChartOfAccountsScreen() {
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusCategoryId, setFocusCategoryId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    if (screenState.mode === "list") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [screenState]);

  function clearFeedback() {
    setServerError(null);
    setDialogError(null);
  }

  function openCreateMode() {
    clearFeedback();
    setScreenState({ mode: "create" });
  }

  function openViewMode(account: ChartOfAccountRecord) {
    clearFeedback();
    setFocusCategoryId(account.categoryId);
    setScreenState({ mode: "view", account });
  }

  function openEditMode(account: ChartOfAccountRecord) {
    clearFeedback();
    setFocusCategoryId(account.categoryId);
    setScreenState({ mode: "edit", account });
  }

  function goToList(categoryId?: string | null) {
    clearFeedback();
    if (typeof categoryId !== "undefined") {
      setFocusCategoryId(categoryId);
    }
    setScreenState({ mode: "list" });
  }

  async function handleCreate(form: ChartOfAccountFormValues) {
    setIsSubmitting(true);
    clearFeedback();

    try {
      const payload = await requestJson<ChartOfAccountRecord>("/api/accounting/chart-of-accounts", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setFocusCategoryId(payload.data.categoryId);
      setRefreshKey((current) => current + 1);
      setScreenState({ mode: "list" });
      setSuccessMessage(payload.message || "Account created successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create account.";
      setServerError(message);
      setDialogError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEdit(form: ChartOfAccountFormValues) {
    if (screenState.mode !== "edit") {
      return;
    }

    setIsSubmitting(true);
    clearFeedback();

    try {
      const payload = await requestJson<ChartOfAccountRecord>("/api/accounting/chart-of-accounts", {
        method: "PATCH",
        body: JSON.stringify({
          id: screenState.account.id,
          accountCode: form.accountCode,
          accountName: form.accountName,
        }),
      });

      setFocusCategoryId(payload.data.categoryId);
      setRefreshKey((current) => current + 1);
      setScreenState({ mode: "list" });
      setSuccessMessage(payload.message || "Account updated successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update account.";
      setServerError(message);
      setDialogError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const intro = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "ACCOUNTS/ CHART OF ACCOUNTS/ CREATE",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => goToList()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Creating..." : "Create Account"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "view") {
      return {
        eyebrow: "ACCOUNTS/ CHART OF ACCOUNTS/ VIEW",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => goToList(screenState.account.categoryId)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => openEditMode(screenState.account)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
            >
              <PencilLine className="h-4 w-4" />
              Edit Account
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "edit") {
      return {
        eyebrow: "ACCOUNTS/ CHART OF ACCOUNTS/ EDIT",
        action: (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => goToList(screenState.account.categoryId)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PencilLine className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ),
      };
    }

    return {
      eyebrow: "ACCOUNTS/ CHART OF ACCOUNTS",
      action: (
        <button
          type="button"
          onClick={openCreateMode}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Add Account
          <ArrowRight className="h-4 w-4" />
        </button>
      ),
    };
  })();

  return (
    <>
      <div ref={topSectionRef}>
        <AccountingPageIntro eyebrow={intro.eyebrow} action={intro.action} />
      </div>

      {screenState.mode === "list" ? (
        <ChartOfAccountsBoard
          focusCategoryId={focusCategoryId}
          refreshKey={refreshKey}
          onViewAccount={openViewMode}
          onEditAccount={openEditMode}
        />
      ) : (
        <AccountFormPanel
          key={screenState.mode === "create" ? "create" : `${screenState.mode}-${screenState.account.id}`}
          formId={FORM_ID}
          mode={screenState.mode}
          initialValues={
            screenState.mode === "create" ? undefined : toFormValues(screenState.account)
          }
          codeLocked={
            screenState.mode === "edit"
              ? Boolean(screenState.account.hasJournalEntries)
              : false
          }
          onSubmit={screenState.mode === "create" ? handleCreate : screenState.mode === "edit" ? handleEdit : undefined}
          serverError={serverError}
        />
      )}

      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

      {dialogError ? <ErrorDialog message={dialogError} onClose={() => setDialogError(null)} /> : null}
    </>
  );
}
