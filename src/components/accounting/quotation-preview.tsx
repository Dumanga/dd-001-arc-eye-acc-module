"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Download, Loader2, Printer } from "lucide-react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import {
  CompanyContactDivider,
  CompanyContactRow,
} from "@/components/accounting/company-contact-row";
import { useStoreInfo, getStoreAddressLines } from "@/lib/accounting/use-store-info";
import type { QuotationDetail } from "@/app/api/accounting/quotations/[id]/route";

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

function formatMoney(value: string, currency: string): string {
  const n = Number(value);
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const QT_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  APPROVED: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const c = QT_STATUS_COLORS[status] ?? QT_STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${c.bg} ${c.text} ${c.border}`}
    >
      {label}
    </span>
  );
}

function openPrintWindow(quotationNumber: string) {
  const printArea = document.getElementById("quotation-print-area");
  if (!printArea) return;

  const styleText = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quotation — ${quotationNumber}</title>
  <style>
    ${styleText}
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body { margin: 0; padding: 0; background: white; }
    body > div {
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
    }
    body > #quotation-content > div:first-child,
    body > #quotation-footer-section > div {
      border-radius: 0 !important;
    }
    #quotation-footer-section {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      background: white !important;
    }
    @page { size: A4 portrait; margin: 0; }
  </style>
</head>
<body>
  ${printArea.innerHTML}
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();

  win.onload = () => {
    const footerEl = win.document.getElementById("quotation-footer-section");
    const contentEl = win.document.getElementById("quotation-print-area");
    if (footerEl && contentEl) {
      const fh = footerEl.getBoundingClientRect().height;
      contentEl.style.paddingBottom = Math.ceil(fh) + "px";
    }
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

type Props = {
  quotationId: string;
  onBack: () => void;
  onApproved?: () => void;
  // Super-admin-only Edit + Recall hooks. The screen wrapper passes these
  // through when the viewer is a SUPER_ADMIN; otherwise the buttons stay
  // hidden in the UI.
  onEdit?: () => void;
  onRecalled?: () => void;
  viewerRole?: "SUPER_ADMIN" | "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";
};

export function QuotationPreview({
  quotationId,
  onBack,
  onApproved,
  onEdit,
  onRecalled,
  viewerRole,
}: Props) {
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [recalling, setRecalling] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  const store = useStoreInfo();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/accounting/quotations/${quotationId}`)
      .then((r) => r.json())
      .then((payload: { success: boolean; data: { quotation: QuotationDetail } | null; message?: string }) => {
        if (cancelled) return;
        if (payload.success && payload.data) {
          setQuotation(payload.data.quotation);
        } else {
          setError(payload.message ?? "Failed to load quotation.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quotationId, reloadCounter]);

  function handlePrint() {
    if (quotation) openPrintWindow(quotation.quotationNumber);
  }

  async function handleRecall() {
    if (!quotation || recalling) return;
    if (!window.confirm(`Recall ${quotation.quotationNumber} back to DRAFT? You can edit it after recall.`)) return;
    setRecalling(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/accounting/quotations/${quotation.id}/unapprove`, {
        method: "POST",
      });
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (payload.success) {
        onRecalled?.();
        setReloadCounter((c) => c + 1);
      } else {
        setApproveError(payload.message ?? "Failed to recall quotation.");
      }
    } catch {
      setApproveError("Network error while recalling the quotation. Please try again.");
    } finally {
      setRecalling(false);
    }
  }

  async function handleApprove() {
    if (!quotation || approving) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/accounting/quotations/${quotation.id}/approve`, {
        method: "POST",
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; quotationNumber: string } | null;
        message?: string;
      };
      if (payload.success && payload.data) {
        onApproved?.();
        setReloadCounter((c) => c + 1);
      } else {
        setApproveError(payload.message ?? "Failed to approve quotation.");
      }
    } catch {
      setApproveError("Network error while approving the quotation. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <SurfaceCard>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-[#786f69]">
          <Loader2 className="h-5 w-5 animate-spin text-[#0891a8]" />
          Loading quotation…
        </div>
      </SurfaceCard>
    );
  }

  if (error || !quotation) {
    return (
      <SurfaceCard>
        <div className="py-6">
          <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error ?? "Quotation not found."}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[#cdeef3] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#5f5750] transition hover:bg-[#ecfcff]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </SurfaceCard>
    );
  }

  const isApproved = quotation.status === "APPROVED";
  const subtotalNumber = Number(quotation.subtotal);
  const discountNumber = Number(quotation.discount);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to quotation list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={quotation.status} label={quotation.statusLabel} />
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
          {viewerRole === "SUPER_ADMIN" && quotation.status === "DRAFT" && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#0891a8] transition hover:bg-[#ecfcff]"
            >
              Edit
            </button>
          ) : null}
          {viewerRole === "SUPER_ADMIN" && quotation.status === "APPROVED" ? (
            <button
              type="button"
              onClick={handleRecall}
              disabled={recalling}
              className="inline-flex items-center gap-2 rounded-xl border border-[#f3c4bb] bg-white px-4 py-2.5 text-sm font-semibold text-[#b94f37] transition hover:bg-[#fff3f0] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {recalling ? "Recalling…" : "Recall"}
            </button>
          ) : null}
          {!isApproved ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0891a8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e7490] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <CheckCircle2 className="h-4 w-4" />
              {approving ? "Approving…" : "Approve"}
            </button>
          ) : null}
        </div>
      </div>

      {approveError ? (
        <div className="mb-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37] print:hidden">
          {approveError}
        </div>
      ) : null}

      <div
        id="quotation-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#cdeef3] bg-white shadow-sm"
      >
        <div id="quotation-content">
          <div className="rounded-t-3xl bg-gradient-to-br from-[#e0fafd] to-[#f1fdff]">
            <div className="flex items-center justify-between gap-6 px-8 pt-5 pb-4">
              <Image
                src="/assets/icon.png"
                alt="Arc Eye"
                width={160}
                height={52}
                className="h-12 w-auto object-contain"
                priority
              />
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0891a8]">
                  Quotation
                </p>
                <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">{quotation.quotationNumber}</p>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <StatusBadge status={quotation.status} label={quotation.statusLabel} />
                </div>
              </div>
            </div>
            <CompanyContactDivider />
            <CompanyContactRow />
          </div>

          <div className="h-px bg-[#cdeef3]" />

          <div className="grid grid-cols-4 gap-4 px-8 py-4">
            <MetaField label="Quotation Date" value={formatDisplayDate(quotation.quotationDate)} />
            <MetaField label="Valid Until" value={formatDisplayDate(quotation.validUntil)} />
            <MetaField label="Currency" value={quotation.currency} />
            <MetaField label="Prepared By" value={quotation.preparedBy || quotation.createdByName || "—"} />
            {quotation.customerRef ? (
              <MetaField label="Customer Ref" value={quotation.customerRef} />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 px-8 pb-4">
            <AddressBlock
              title="Billed To"
              name={quotation.customer.name}
              lines={[
                quotation.customer.address ?? "",
                quotation.customer.mobile ? `Tel: ${quotation.customer.mobile}` : "",
                quotation.customer.email,
              ].filter(Boolean) as string[]}
            />
            <AddressBlock
              title="From"
              name={store?.name ?? "—"}
              lines={getStoreAddressLines(store)}
            />
          </div>

          <div className="px-8 pb-2">
            <div className="overflow-hidden rounded-xl border border-[#cdeef3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#e0fafd]">
                    <Th className="w-7 text-center">#</Th>
                    <Th>Product / Description</Th>
                    <Th className="text-right">UOM</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit Price</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.lines.map((line, idx) => (
                    <tr key={line.id} className="bg-white">
                      <TdCompact className="text-center font-medium text-[#9a8f85]">
                        {idx + 1}
                      </TdCompact>
                      <TdCompact>
                        <p className="font-semibold leading-tight text-[#1f1d1c]">
                          {line.productName}
                        </p>
                        <p className="text-[11px] text-[#9a8f85]">
                          {line.productCode}
                          {line.description && line.description !== line.productName
                            ? ` · ${line.description}`
                            : ""}
                        </p>
                      </TdCompact>
                      <TdCompact className="text-right">
                        <span className="rounded bg-[#f5f0eb] px-1.5 py-0.5 text-[11px] font-medium text-[#786f69]">
                          {line.uomBase || line.uomName || "—"}
                        </span>
                      </TdCompact>
                      <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                        {line.quantity}
                      </TdCompact>
                      <TdCompact className="text-right text-[#3f3b38]">
                        {formatMoney(line.unitPrice, quotation.currency)}
                      </TdCompact>
                      <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                        {formatMoney(line.lineTotal, quotation.currency)}
                      </TdCompact>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end px-8 pb-4 pt-3">
            <div className="w-full max-w-[280px] space-y-1.5 rounded-xl border border-[#cdeef3] bg-[#ecfcff] px-5 py-3">
              <TotalRow
                label="Subtotal"
                value={formatMoney(subtotalNumber.toFixed(2), quotation.currency)}
              />
              {discountNumber > 0 ? (
                <TotalRow
                  label="Discount"
                  value={`- ${formatMoney(discountNumber.toFixed(2), quotation.currency)}`}
                />
              ) : null}
              <div className="my-1 h-px bg-[#cdeef3]" />
              <TotalRow label="Total" value={formatMoney(quotation.total, quotation.currency)} bold />
            </div>
          </div>

          {quotation.terms ? (
            <div className="mt-2 border-t border-[#cdeef3] px-8 py-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Terms &amp; Summary
              </p>
              <p className="whitespace-pre-line text-xs text-[#5f5750]">{quotation.terms}</p>
            </div>
          ) : null}

          {quotation.notes ? (
            <div className="border-t border-[#cdeef3] px-8 py-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Notes
              </p>
              <p className="whitespace-pre-line text-xs text-[#5f5750]">{quotation.notes}</p>
            </div>
          ) : null}
        </div>

        <div id="quotation-footer-section">
          <div className="flex items-center justify-between rounded-b-3xl border-t border-[#cdeef3] bg-[#e0fafd] px-8 py-3">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/icon.png"
                alt="Arc Eye"
                width={80}
                height={28}
                className="h-7 w-auto object-contain opacity-40"
              />
            </div>
            <p className="text-[11px] text-[#a2978c]">
              Generated{" "}
              {new Date(quotation.createdAt).toLocaleDateString("en-LK", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}{" "}
              · {quotation.quotationNumber}
              {quotation.approvedByName ? ` · Approved by ${quotation.approvedByName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">{value}</p>
    </div>
  );
}

function AddressBlock({
  title,
  name,
  lines,
}: {
  title: string;
  name: string;
  lines: string[];
}) {
  return (
    <div className="rounded-2xl border border-[#cdeef3] bg-[#ecfcff] px-5 py-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0891a8]">
        {title}
      </p>
      <p className="text-sm font-bold text-[#1f1d1c]">{name}</p>
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-[#786f69]">
          {line}
        </p>
      ))}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-[#cdeef3] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
    >
      {children}
    </th>
  );
}

function TdCompact({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-[#cdeef3] px-3 py-1.5 text-sm last:border-b-0 ${className}`}>
      {children}
    </td>
  );
}

function TotalRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm ${bold ? "font-bold text-[#1f1d1c]" : "text-[#786f69]"}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          bold ? "text-lg font-bold text-[#0891a8]" : "font-medium text-[#3f3b38]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
