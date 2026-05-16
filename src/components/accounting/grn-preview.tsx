"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Download, Loader2, Printer } from "lucide-react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import { useStoreInfo, getStoreAddressLines } from "@/lib/accounting/use-store-info";
import type { GrnDetail } from "@/app/api/accounting/goods-receipts/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Status badges ───────────────────────────────────────────────────────────

const GRN_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  APPROVED: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

const PO_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  SENT: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  PARTIALLY_RECEIVED: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  RECEIVED: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

function StatusBadge({
  status,
  label,
  palette,
}: {
  status: string;
  label: string;
  palette: Record<string, { bg: string; text: string; border: string }>;
}) {
  const c = palette[status] ?? palette.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${c.bg} ${c.text} ${c.border}`}
    >
      {label}
    </span>
  );
}

// ─── Print window helper ─────────────────────────────────────────────────────

function openPrintWindow(grnNumber: string) {
  const printArea = document.getElementById("grn-print-area");
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
  <title>Goods Receipt Note — ${grnNumber}</title>
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
    body > #grn-content > div:first-child,
    body > #grn-footer-section > div {
      border-radius: 0 !important;
    }
    #grn-footer-section {
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
    const footerEl = win.document.getElementById("grn-footer-section");
    const contentEl = win.document.getElementById("grn-print-area");
    if (footerEl && contentEl) {
      const fh = footerEl.getBoundingClientRect().height;
      contentEl.style.paddingBottom = Math.ceil(fh) + "px";
    }
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  grnId: string;
  onBack: () => void;
  onApproved?: (poStatus: string | null) => void;
};

export function GrnPreview({ grnId, onBack, onApproved }: Props) {
  const [grn, setGrn] = useState<GrnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const store = useStoreInfo();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/accounting/goods-receipts/${grnId}`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then((r) => r.json())
      .then((payload: { success: boolean; data: { grn: GrnDetail } | null; message?: string }) => {
        if (cancelled) return;
        if (payload.success && payload.data) {
          setGrn(payload.data.grn);
        } else {
          setError(payload.message ?? "Failed to load goods receipt.");
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
  }, [grnId, reloadCounter]);

  function handlePrint() {
    if (grn) openPrintWindow(grn.grnNumber);
  }

  async function handleApprove() {
    if (!grn || approving) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/accounting/goods-receipts/${grn.id}/approve`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; grnNumber: string; poStatus: string | null } | null;
        message?: string;
      };
      if (payload.success && payload.data) {
        onApproved?.(payload.data.poStatus);
        setReloadCounter((c) => c + 1);
      } else {
        setApproveError(payload.message ?? "Failed to approve goods receipt.");
      }
    } catch {
      setApproveError("Network error while approving the GRN. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <SurfaceCard>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-[#786f69]">
          <Loader2 className="h-5 w-5 animate-spin text-[#0891a8]" />
          Loading goods receipt…
        </div>
      </SurfaceCard>
    );
  }

  if (error || !grn) {
    return (
      <SurfaceCard>
        <div className="py-6">
          <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error ?? "Goods receipt not found."}
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

  const totalOrderedNumber = Number(grn.totalOrdered);
  const totalReceivedNumber = Number(grn.totalReceived);
  const variance = totalOrderedNumber ? totalReceivedNumber - totalOrderedNumber : 0;
  const isApproved = grn.status === "APPROVED";
  const hasAnyDiscount = grn.lines.some((line) => Number(line.discount ?? 0) > 0);

  return (
    <>
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to GRN list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={grn.status} label={grn.statusLabel} palette={GRN_STATUS_COLORS} />
          {grn.poStatus ? (
            <StatusBadge
              status={grn.poStatus}
              label={`PO: ${grn.poStatusLabel ?? grn.poStatus}`}
              palette={PO_STATUS_COLORS}
            />
          ) : null}
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

      {/* Printable area */}
      <div
        id="grn-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#cdeef3] bg-white shadow-sm"
      >
        <div id="grn-content">
          {/* Header */}
          <div className="flex items-center justify-between gap-6 rounded-t-3xl bg-gradient-to-br from-[#e0fafd] to-[#f1fdff] px-8 py-5">
            <div className="flex flex-col gap-0.5">
              <Image
                src="/assets/icon.png"
                alt="Arc Eye"
                width={160}
                height={52}
                className="h-12 w-auto object-contain"
                priority
              />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0891a8]">
                Goods Receipt Note
              </p>
              <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">{grn.grnNumber}</p>
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <StatusBadge status={grn.status} label={grn.statusLabel} palette={GRN_STATUS_COLORS} />
                {grn.openingBalanceMode ? (
                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                    Opening Balance
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="h-px bg-[#cdeef3]" />

          {/* Meta grid */}
          <div className="grid grid-cols-4 gap-4 px-8 py-4">
            <MetaField label="Receipt Date" value={formatDisplayDate(grn.receiptDate)} />
            <MetaField label="Received By" value={grn.receivedBy || "—"} />
            <MetaField label="Currency" value={grn.currency} />
            <MetaField label="Linked PO" value={grn.poNumber ?? "—"} />
            {grn.deliveryNoteRef ? (
              <MetaField label="Delivery Note" value={grn.deliveryNoteRef} />
            ) : null}
            {grn.vehicleRef ? (
              <MetaField label="Vehicle / Driver" value={grn.vehicleRef} />
            ) : null}
          </div>

          {/* Supplier / Receiver (or Opening Balance source) */}
          <div className="grid grid-cols-2 gap-4 px-8 pb-4">
            {grn.openingBalanceMode ? (
              <AddressBlock
                title="Opening Balance Source"
                name={grn.openingEquityAccount?.name ?? "—"}
                lines={[
                  grn.openingEquityAccount?.code
                    ? `Account: ${grn.openingEquityAccount.code}`
                    : "",
                  "No supplier — equity-funded opening stock.",
                ].filter(Boolean)}
              />
            ) : grn.supplier ? (
              <AddressBlock
                title="From Supplier"
                name={grn.supplier.name}
                lines={[
                  grn.supplier.addressLine1,
                  grn.supplier.addressLine2,
                  [grn.supplier.city, grn.supplier.country].filter(Boolean).join(", "),
                  grn.supplier.phone ? `Tel: ${grn.supplier.phone}` : "",
                  grn.supplier.email,
                ].filter(Boolean)}
              />
            ) : (
              <AddressBlock title="From Supplier" name="—" lines={[]} />
            )}
            <AddressBlock
              title="Received At"
              name={store?.name ?? "—"}
              lines={getStoreAddressLines(store)}
            />
          </div>

          {/* Line items */}
          <div className="px-4 pb-2">
            <div className="overflow-hidden rounded-xl border border-[#cdeef3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#e0fafd]">
                    <Th className="w-7 text-center">#</Th>
                    <Th>Product / Description</Th>
                    <Th className="text-right">UOM</Th>
                    <Th className="text-right">Ordered</Th>
                    <Th className="text-right">Received</Th>
                    <Th className="text-left">Cond.</Th>
                    <Th className="text-right">Unit Price</Th>
                    {hasAnyDiscount ? <Th className="text-right">Discount</Th> : null}
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {grn.lines.map((line, idx) => {
                    return (
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
                          {line.requiresSerial && line.serials.length > 0 ? (
                            <p className="mt-1 text-[10px] text-[#9a8f85]">
                              Serials: {line.serials.join(", ")}
                            </p>
                          ) : null}
                        </TdCompact>
                        <TdCompact className="text-right">
                          <span className="rounded bg-[#f5f0eb] px-1.5 py-0.5 text-[11px] font-medium text-[#786f69]">
                            {line.uomBase || line.uomName || "—"}
                          </span>
                        </TdCompact>
                        <TdCompact className="text-right text-[#3f3b38]">
                          {line.orderedQty || "—"}
                        </TdCompact>
                        <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                          {line.receivedQty}
                        </TdCompact>
                        <TdCompact>
                          <span className="text-[11px] font-medium text-[#3f3b38]">
                            {line.conditionLabel}
                          </span>
                        </TdCompact>
                        <TdCompact className="text-right text-[#3f3b38]">
                          {formatMoney(line.unitPrice, grn.currency)}
                        </TdCompact>
                        {hasAnyDiscount ? (
                          <TdCompact className="text-right text-[#3f3b38]">
                            {Number(line.discount) > 0
                              ? `− ${formatMoney(line.discount, grn.currency)}`
                              : "—"}
                          </TdCompact>
                        ) : null}
                        <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                          {formatMoney(line.lineTotal, grn.currency)}
                        </TdCompact>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end px-8 pb-4 pt-3">
            <div className="w-full max-w-[280px] space-y-1.5 rounded-xl border border-[#cdeef3] bg-[#f0fcff] px-5 py-3">
              <TotalRow label="Total Ordered" value={totalOrderedNumber ? totalOrderedNumber.toString() : "—"} />
              <TotalRow label="Total Received" value={totalReceivedNumber.toString()} />
              <TotalRow
                label="Variance"
                value={
                  totalOrderedNumber
                    ? variance === 0
                      ? "0"
                      : variance > 0
                        ? `+${variance}`
                        : `${variance}`
                    : "—"
                }
                className={
                  !totalOrderedNumber
                    ? ""
                    : variance === 0
                      ? "text-[#176d39]"
                      : variance < 0
                        ? "text-[#a4302a]"
                        : "text-[#9b6f10]"
                }
              />
              <div className="my-1 h-px bg-[#cdeef3]" />
              {Number(grn.totalDiscount) > 0 ? (
                <>
                  <TotalRow
                    label="Subtotal (gross)"
                    value={formatMoney(grn.grossValue, grn.currency)}
                  />
                  <TotalRow
                    label="Total Discount"
                    value={`− ${formatMoney(grn.totalDiscount, grn.currency)}`}
                    className="text-[#a4302a]"
                  />
                </>
              ) : null}
              <TotalRow label="Receipt Value" value={formatMoney(grn.receiptValue, grn.currency)} bold />
            </div>
          </div>

          {/* Notes */}
          {grn.notes ? (
            <div className="mt-2 border-t border-[#cdeef3] px-8 py-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Notes
              </p>
              <p className="whitespace-pre-line text-xs text-[#5f5750]">{grn.notes}</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div id="grn-footer-section">
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
              {new Date(grn.createdAt).toLocaleDateString("en-LK", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}{" "}
              · {grn.grnNumber}
              {grn.approvedByName ? ` · Approved by ${grn.approvedByName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-[#cdeef3] px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
    >
      {children}
    </th>
  );
}

function TdCompact({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-[#cdeef3] px-2 py-1.5 text-[11px] last:border-b-0 ${
        className.includes("text-right") ? "whitespace-nowrap" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

function TotalRow({
  label,
  value,
  bold = false,
  className = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-sm ${bold ? "font-bold text-[#1f1d1c]" : "text-[#786f69]"}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          bold ? "text-lg font-bold text-[#0891a8]" : `font-medium text-[#3f3b38] ${className}`
        }`}
      >
        {value}
      </span>
    </div>
  );
}
