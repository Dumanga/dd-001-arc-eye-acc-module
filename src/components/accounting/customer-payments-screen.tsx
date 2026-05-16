"use client";

import {
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TimerReset,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccountingPageIntro,
  DataTable,
  PremiumMetricGrid,
  StatusToast,
  SurfaceCard,
  type ToastState,
} from "@/components/accounting/accounting-ui";
import { BranchAwareCreateButton } from "@/components/accounting/branch-aware-create-button";
import { useViewerAndBranches } from "@/components/accounting/use-viewer-and-branches";
import {
  CustomerPaymentFormPanel,
  type CashAccountOption,
  type CustomerPaymentDraft,
  type InvoiceAllocation,
  type OnAccountAllocation,
} from "@/components/accounting/customer-payment-form-panel";
import { CustomerPaymentPreview } from "@/components/accounting/customer-payment-preview";
import { useOpenPreviewFromUrl } from "@/components/accounting/use-open-preview-from-url";
import type {
  CustomerPaymentListItem,
  CustomerPaymentKpis,
} from "@/app/api/accounting/customer-payments/route";

const PAYMENT_FORM_ID = "customer-payment-form";
const PAGE_SIZE = 10;
const FALLBACK_RECEIPT_NUMBER = "RC-2026-0001";

type FormIdConfigItem = {
  formType: string;
  code: string;
  yearToken: string;
  nextNumber: string;
};

type RemarkApiItem = {
  documentType: string;
  content: string;
};

function buildReceiptNumber(config: FormIdConfigItem | null): string {
  if (!config) return FALLBACK_RECEIPT_NUMBER;
  const parts = [config.code.trim(), config.yearToken.trim(), config.nextNumber.trim()].filter(Boolean);
  return parts.join("-") || FALLBACK_RECEIPT_NUMBER;
}

const METHOD_PILL_MAP: Record<string, string> = {
  CASH: "border-[#cfe7d6] bg-[#edf9f1] text-[#1c7b52]",
  BANK_TRANSFER: "border-[#d9e5f8] bg-[#f6f9ff] text-[#315d9b]",
  CHEQUE: "border-[#f3dec5] bg-[#fff7eb] text-[#a8731a]",
  ONLINE_TRANSFER: "border-[#e3d6f1] bg-[#f8f3ff] text-[#6b3fb3]",
};

type ScreenState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "preview"; receiptId: string };

function buildLocalDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialDraft(
  receiptNumber: string,
  notes: string,
  cashAccountId: string,
): CustomerPaymentDraft {
  return {
    receiptNumber,
    receiptDate: buildLocalDate(),
    customer: null,
    currency: "LKR",
    method: "Cash",
    cashAccountId,
    reference: "",
    collectedBy: "",
    notes,
    allocations: [],
  };
}

const METHOD_TO_API: Record<string, "CASH" | "BANK_TRANSFER" | "CHEQUE" | "ONLINE_TRANSFER"> = {
  Cash: "CASH",
  "Bank Transfer": "BANK_TRANSFER",
  Cheque: "CHEQUE",
  "Online Transfer": "ONLINE_TRANSFER",
};

function formatListDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function CustomerPaymentsScreen() {
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ mode: "list" });

  // Pending Forms inbox deep-links here with ?id=<receiptId>.
  useOpenPreviewFromUrl((receiptId) =>
    setScreenState({ mode: "preview", receiptId }),
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const {
    viewer,
    branches: activeBranches,
    loading: viewerLoading,
  } = useViewerAndBranches();
  const [draft, setDraft] = useState<CustomerPaymentDraft>(() =>
    createInitialDraft(FALLBACK_RECEIPT_NUMBER, "", ""),
  );
  const [createDataLoading, setCreateDataLoading] = useState(false);
  const [createDataError, setCreateDataError] = useState<string | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);

  const [receipts, setReceipts] = useState<CustomerPaymentListItem[]>([]);
  const [kpis, setKpis] = useState<CustomerPaymentKpis>({
    totalReceipts: 0,
    drafts: 0,
    approved: 0,
    approvedValueLkr: "0.00",
  });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/accounting/customer-payments", {
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: { items: CustomerPaymentListItem[]; kpis: CustomerPaymentKpis } | null;
      };
      if (payload.success && payload.data) {
        setReceipts(payload.data.items);
        setKpis(payload.data.kpis);
      } else {
        setListError(payload.message || "Failed to load receipts.");
      }
    } catch {
      setListError("Network error while loading receipts.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filteredReceipts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return receipts;
    return receipts.filter((item) => {
      const haystack = [
        item.receiptNumber,
        item.customerName,
        item.customerCity,
        item.methodLabel,
        item.collectedBy,
        item.reference,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [receipts, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredReceipts.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const pagedReceipts = filteredReceipts.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationSummary = filteredReceipts.length
    ? `Showing ${startIndex + 1}-${startIndex + pagedReceipts.length} of ${filteredReceipts.length} receipts`
    : "No receipts to show";

  const tableColumns = useMemo(
    () =>
      ["Receipt", "Customer", "Date", "Method", "Collected By", "Reference", "Receiving", "Discount", ""].map(
        (label) => ({ key: label || "actions", label }),
      ),
    [],
  );

  const tableRows = pagedReceipts.map((receipt) => ({
    Receipt: (
      <div className="flex flex-col">
        <span className="font-semibold text-[#1f1d1c]">{receipt.receiptNumber}</span>
        <span
          className={`mt-0.5 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            receipt.status === "APPROVED"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {receipt.statusLabel}
        </span>
      </div>
    ),
    Customer: (
      <div className="flex flex-col">
        <span className="font-medium text-[#1f1d1c]">{receipt.customerName}</span>
        {receipt.customerCity ? (
          <span className="text-xs text-[#8c8079]">{receipt.customerCity}</span>
        ) : null}
      </div>
    ),
    Date: formatListDate(receipt.receiptDate),
    Method: (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
          METHOD_PILL_MAP[receipt.method] ?? METHOD_PILL_MAP.CASH
        }`}
      >
        {receipt.methodLabel}
      </span>
    ),
    "Collected By": receipt.collectedBy,
    Reference: receipt.reference,
    Receiving: (
      <span className="font-semibold text-[#1f1d1c]">
        {receipt.currency} {receipt.receivingTotal}
      </span>
    ),
    Discount: (
      <span className="text-[#3f3b38]">
        {receipt.currency} {receipt.discountTotal}
      </span>
    ),
    actions: (
      <button
        type="button"
        onClick={() => setScreenState({ mode: "preview", receiptId: receipt.id })}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#d9e5f8] bg-[#f6f9ff] px-3 py-1.5 text-xs font-semibold text-[#315d9b] transition hover:bg-[#eef4ff]"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
    ),
  }));

  const paginationPages = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

  const metrics = useMemo(
    () => [
      {
        label: "Total Receipts",
        value: String(kpis.totalReceipts).padStart(2, "0"),
        detail: "All customer receipts on file.",
        icon: Wallet,
        tone: "amber" as const,
      },
      {
        label: "Drafts",
        value: String(kpis.drafts).padStart(2, "0"),
        detail: "Receipts awaiting approval.",
        icon: CalendarRange,
        tone: "blue" as const,
      },
      {
        label: "Approved",
        value: String(kpis.approved).padStart(2, "0"),
        detail: "Receipts approved and posted to ledger.",
        icon: TimerReset,
        tone: "violet" as const,
      },
      {
        label: "Approved (LKR)",
        value: `LKR ${kpis.approvedValueLkr}`,
        detail: "Total LKR value across approved receipts.",
        icon: Sparkles,
        tone: "green" as const,
      },
    ],
    [kpis],
  );

  async function loadCreateFormData() {
    setCreateDataLoading(true);
    setCreateDataError(null);
    try {
      const [formIdsRes, remarksRes, cashAccountsRes] = await Promise.all([
        fetch("/api/accounting/settings/form-ids", { headers: { "x-portal": "ACCOUNTING" } }),
        fetch("/api/accounting/settings/remarks", { headers: { "x-portal": "ACCOUNTING" } }),
        fetch(
          "/api/accounting/accounts/options?category=ASSET&type=CASH_AND_CASH_EQUIVALENTS&limit=50",
          { headers: { "x-portal": "ACCOUNTING" } },
        ),
      ]);
      const [formIdsPayload, remarksPayload, cashAccountsPayload] = await Promise.all([
        formIdsRes.json() as Promise<{
          success: boolean;
          message: string;
          data: { items: FormIdConfigItem[] } | null;
        }>,
        remarksRes.json() as Promise<{
          success: boolean;
          message: string;
          data: { items: RemarkApiItem[] } | null;
        }>,
        cashAccountsRes.json() as Promise<{
          success: boolean;
          message: string;
          data: { items: CashAccountOption[] } | null;
        }>,
      ]);

      const rcConfig =
        formIdsPayload.success && formIdsPayload.data
          ? formIdsPayload.data.items.find((i) => i.formType === "RC") ?? null
          : null;
      const receiptRemark =
        remarksPayload.success && remarksPayload.data
          ? remarksPayload.data.items.find((r) => r.documentType === "RECEIPT")?.content ?? ""
          : "";
      const loadedCashAccounts =
        cashAccountsPayload.success && cashAccountsPayload.data
          ? cashAccountsPayload.data.items
          : [];

      setCashAccounts(loadedCashAccounts);
      setDraft(
        createInitialDraft(
          buildReceiptNumber(rcConfig),
          receiptRemark,
          loadedCashAccounts[0]?.id ?? "",
        ),
      );
    } catch {
      setCreateDataError("Unable to load receipt configuration. Check your connection and try again.");
    } finally {
      setCreateDataLoading(false);
    }
  }

  function openCreateMode(storeIdParam?: string) {
    setPickedStoreId(storeIdParam ?? null);
    setDraft(createInitialDraft(FALLBACK_RECEIPT_NUMBER, "", ""));
    setScreenState({ mode: "create" });
    void loadCreateFormData();
    window.requestAnimationFrame(() => {
      topSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeCreateMode() {
    setScreenState({ mode: "list" });
    setSaving(false);
  }

  async function handleRecordPayment(currentDraft: CustomerPaymentDraft) {
    if (!currentDraft.customer) {
      setToast({ tone: "error", message: "Select a customer before recording the payment." });
      return;
    }
    if (!currentDraft.cashAccountId) {
      setToast({
        tone: "error",
        message: "Select a cash account before recording the payment.",
      });
      return;
    }
    if (currentDraft.allocations.length === 0) {
      setToast({
        tone: "error",
        message: "Add at least one invoice or on-account allocation before recording.",
      });
      return;
    }
    let totalReceiving = 0;
    for (const a of currentDraft.allocations) {
      const receiving = Number(a.receivingAmount) || 0;
      if (a.type === "invoice") {
        const discount = Number(a.discount) || 0;
        if (receiving + discount <= 0) {
          setToast({
            tone: "error",
            message: `Allocation against ${a.invoiceNumber} must have a positive receiving or discount amount.`,
          });
          return;
        }
        if (receiving + discount > a.remainingReceivable + 0.0001) {
          setToast({
            tone: "error",
            message: `Allocation against ${a.invoiceNumber} exceeds outstanding amount of ${a.remainingReceivable.toFixed(2)}.`,
          });
          return;
        }
      } else {
        if (receiving <= 0) {
          setToast({
            tone: "error",
            message: "On-account allocation must have a positive amount.",
          });
          return;
        }
      }
      totalReceiving += receiving;
    }
    if (totalReceiving <= 0) {
      setToast({
        tone: "error",
        message: "Total receiving must be greater than zero.",
      });
      return;
    }

    setSaving(true);
    try {
      const apiAllocations = currentDraft.allocations.map((a, idx) => {
        if (a.type === "invoice") {
          const inv = a as InvoiceAllocation;
          const receiving = Number(inv.receivingAmount) || 0;
          const discount = Number(inv.discount) || 0;
          return {
            invoiceId: inv.invoiceId,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            totalAmount: inv.totalAmount.toFixed(2),
            receivableAmount: (receiving + discount).toFixed(2),
            receivingAmount: receiving.toFixed(2),
            discount: discount.toFixed(2),
            description: "",
            notes: inv.notes ?? "",
            isOnAccount: false,
            lineOrder: idx,
          };
        }
        const oa = a as OnAccountAllocation;
        const receiving = Number(oa.receivingAmount) || 0;
        return {
          invoiceId: null,
          invoiceNumber: "",
          invoiceDate: null,
          totalAmount: "0",
          receivableAmount: receiving.toFixed(2),
          receivingAmount: receiving.toFixed(2),
          discount: "0",
          description: oa.description ?? "",
          notes: oa.notes ?? "",
          isOnAccount: true,
          lineOrder: idx,
        };
      });

      const res = await fetch("/api/accounting/customer-payments", {
        method: "POST",
        headers: {
          "x-portal": "ACCOUNTING",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiptNumber: currentDraft.receiptNumber,
          customerId: currentDraft.customer!.id,
          ...(pickedStoreId ? { storeId: pickedStoreId } : {}),
          receiveToAccountId: currentDraft.cashAccountId,
          receiptDate: currentDraft.receiptDate,
          method: METHOD_TO_API[currentDraft.method] ?? "CASH",
          currency: currentDraft.currency || "LKR",
          collectedBy: currentDraft.collectedBy ?? "",
          reference: currentDraft.reference ?? "",
          chequeNo: "",
          notes: currentDraft.notes ?? "",
          allocations: apiAllocations,
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: { id: string; receiptNumber: string } | null;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setToast({
          tone: "error",
          message: payload.message || "Failed to create payment receipt.",
        });
        return;
      }
      setToast({
        tone: "success",
        message: `Receipt ${payload.data.receiptNumber} created. Review and approve from preview.`,
      });
      setScreenState({ mode: "preview", receiptId: payload.data.id });
      void loadList();
    } catch {
      setToast({
        tone: "error",
        message: "Network error while creating the receipt.",
      });
    } finally {
      setSaving(false);
    }
  }

  const intro: {
    eyebrow: string;
    title?: string;
    action?: ReactNode;
  } = (() => {
    if (screenState.mode === "create") {
      return {
        eyebrow: "CUSTOMERS / PAYMENTS / RECORD",
        action: (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeCreateMode}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="submit"
              form={PAYMENT_FORM_ID}
              disabled={saving}
              className="rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Recording…" : "Record Payment"}
            </button>
          </div>
        ),
      };
    }

    if (screenState.mode === "preview") {
      return { eyebrow: "CUSTOMERS / PAYMENTS / PREVIEW" };
    }

    return {
      eyebrow: "CUSTOMERS / PAYMENTS",
      title: "Customer collections register with staff and reference traceability.",
      action: (
        <BranchAwareCreateButton
          label="Record Payment"
          viewer={viewer}
          branches={activeBranches}
          loading={viewerLoading}
          onCreate={openCreateMode}
        />
      ),
    };
  })();

  return (
    <>
      <div ref={topSectionRef}>
        <AccountingPageIntro
          eyebrow={intro.eyebrow}
          title={intro.title}
          action={intro.action}
        />
      </div>

      {screenState.mode === "list" ? (
        <>
          <PremiumMetricGrid items={metrics} />

          <SurfaceCard title="Receipt history">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by receipt number, customer, method, collector, or reference"
                    className="w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                    void loadList();
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm font-medium text-[#786f69] transition hover:bg-[#fff7f0]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {listError ? (
                <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {listError}
                </div>
              ) : null}

              {listLoading ? (
                <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading receipts…
                  </span>
                </div>
              ) : !filteredReceipts.length ? (
                <div className="rounded-2xl border border-dashed border-[#ddd8d1] bg-[#fcfbf9] px-4 py-10 text-center text-sm text-[#786f69]">
                  No receipts yet. Click Record Payment to create the first one.
                </div>
              ) : (
                <DataTable columns={tableColumns} rows={tableRows} />
              )}

              {filteredReceipts.length ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee5db] pt-3 text-xs text-[#7c6f65]">
                  <div>
                    <p>{paginationSummary}</p>
                    <p className="mt-1">
                      Page {effectivePage} of {totalPages}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={effectivePage === 1}
                      aria-label="Previous page"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                        effectivePage === 1
                          ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                          : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                      }`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {paginationPages.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        aria-label={`Page ${page}`}
                        aria-current={page === effectivePage ? "page" : undefined}
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
                          page === effectivePage
                            ? "bg-[#ff7a12] text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)]"
                            : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={effectivePage === totalPages}
                      aria-label="Next page"
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
                        effectivePage === totalPages
                          ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                          : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </SurfaceCard>
        </>
      ) : screenState.mode === "create" ? (
        <>
          {createDataLoading ? (
            <div className="rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3 text-sm text-[#a86721]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading receipt configuration…
              </span>
            </div>
          ) : null}
          {createDataError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {createDataError}
            </div>
          ) : null}
          <CustomerPaymentFormPanel
            formId={PAYMENT_FORM_ID}
            draft={draft}
            cashAccounts={cashAccounts}
            onChange={setDraft}
            onSubmit={handleRecordPayment}
          />
        </>
      ) : (
        <CustomerPaymentPreview
          receiptId={screenState.receiptId}
          onBack={() => {
            setScreenState({ mode: "list" });
            void loadList();
          }}
          onApproved={() => {
            void loadList();
            setToast({
              tone: "success",
              message: "Customer payment receipt approved.",
            });
          }}
        />
      )}

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}
