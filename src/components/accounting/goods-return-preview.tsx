"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Download, Loader2, Printer } from "lucide-react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type { GoodsReturnDetail } from "@/app/api/accounting/goods-returns/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
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

const RETURN_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  APPROVED: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = RETURN_STATUS_COLORS[status] ?? RETURN_STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${c.bg} ${c.text} ${c.border}`}
    >
      {label}
    </span>
  );
}

// ─── Reason chip pill ────────────────────────────────────────────────────────

const REASON_PILL: Record<string, string> = {
  DAMAGED: "bg-[#fdecec] text-[#a4302a] border-[#f3c4bb]",
  WRONG_ITEM: "bg-[#fff5e0] text-[#9b6f10] border-[#f0dfa1]",
  EXPIRED: "bg-[#f5edff] text-[#5b3196] border-[#e0cffa]",
  EXCESS: "bg-[#f1f5ff] text-[#3262c9] border-[#cee0f5]",
  OTHER: "bg-[#f5f0eb] text-[#7c6f65] border-[#e2d8cf]",
};

function ReasonPill({ reason, label }: { reason: string; label: string }) {
  const cls = REASON_PILL[reason] ?? REASON_PILL.OTHER;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Print window helper ─────────────────────────────────────────────────────

function openPrintWindow(returnNumber: string) {
  const printArea = document.getElementById("grr-print-area");
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
  <title>Goods Return — ${returnNumber}</title>
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
    body > div > #grr-content > div:first-child,
    body > div > #grr-footer-section > div:last-child {
      border-radius: 0 !important;
    }
    #grr-footer-section {
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
    const footerEl = win.document.getElementById("grr-footer-section");
    const contentEl = win.document.getElementById("grr-print-area");
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
  returnId: string;
  onBack: () => void;
  onApproved?: () => void;
};

export function GoodsReturnPreview({ returnId, onBack, onApproved }: Props) {
  const [grr, setGrr] = useState<GoodsReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/accounting/goods-returns/${returnId}`, {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then((r) => r.json())
      .then(
        (payload: {
          success: boolean;
          data: { goodsReturn: GoodsReturnDetail } | null;
          message?: string;
        }) => {
          if (cancelled) return;
          if (payload.success && payload.data) {
            setGrr(payload.data.goodsReturn);
          } else {
            setError(payload.message ?? "Failed to load goods return.");
          }
        }
      )
      .catch(() => {
        if (!cancelled) setError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [returnId, reloadCounter]);

  function handlePrint() {
    if (grr) openPrintWindow(grr.returnNumber);
  }

  async function handleApprove() {
    if (!grr || approving) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/accounting/goods-returns/${grr.id}/approve`, {
        method: "POST",
        headers: { "x-portal": "ACCOUNTING" },
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: { id: string; returnNumber: string } | null;
        message?: string;
      };
      if (payload.success && payload.data) {
        onApproved?.();
        setReloadCounter((c) => c + 1);
      } else {
        setApproveError(payload.message ?? "Failed to approve goods return.");
      }
    } catch {
      setApproveError("Network error while approving the return. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <SurfaceCard>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-[#786f69]">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
          Loading goods return…
        </div>
      </SurfaceCard>
    );
  }

  if (error || !grr) {
    return (
      <SurfaceCard>
        <div className="py-6">
          <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error ?? "Goods return not found."}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[#e2d8cf] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </SurfaceCard>
    );
  }

  const isApproved = grr.status === "APPROVED";
  const totalQtyNumber = Number(grr.totalQty);
  const totalValueNumber = Number(grr.totalValue);

  return (
    <>
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to return list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={grr.status} label={grr.statusLabel} />
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
          {!isApproved ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:opacity-70"
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
        id="grr-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#e2d8cf] bg-white shadow-sm"
      >
        <div id="grr-content">
          {/* Header */}
          <div className="flex items-center justify-between gap-6 rounded-t-3xl bg-gradient-to-br from-[#fff4eb] to-[#fff9f4] px-8 py-5">
            <div className="flex flex-col gap-0.5">
              <Image
                src="/assets/logo-dob.png"
                alt="Doctor of Bats"
                width={160}
                height={52}
                className="h-12 w-auto object-contain"
                priority
              />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c47f3a]">
                Goods Return
              </p>
              <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">{grr.returnNumber}</p>
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <StatusBadge status={grr.status} label={grr.statusLabel} />
              </div>
            </div>
          </div>

          <div className="h-px bg-[#f0ebe5]" />

          {/* Meta grid */}
          <div className="grid grid-cols-4 gap-4 px-8 py-4">
            <MetaField label="Return Date" value={formatDisplayDate(grr.returnDate)} />
            <MetaField label="Returned By" value={grr.returnedBy || "—"} />
            <MetaField label="Currency" value={grr.currency} />
            <MetaField label="Linked GRN" value={grr.goodsReceipt.grnNumber} />
            <MetaField label="GRN Date" value={formatDisplayDate(grr.goodsReceipt.receiptDate)} />
            {grr.reasonHeader ? (
              <MetaField label="Reason Summary" value={grr.reasonHeader} />
            ) : null}
          </div>

          {/* Supplier / From */}
          <div className="grid grid-cols-2 gap-4 px-8 pb-4">
            <AddressBlock
              title="Returning To"
              name={grr.supplier.name}
              lines={[
                grr.supplier.code,
                grr.supplier.addressLine1,
                grr.supplier.addressLine2,
                [grr.supplier.city, grr.supplier.country].filter(Boolean).join(", "),
                grr.supplier.phone ? `Tel: ${grr.supplier.phone}` : "",
                grr.supplier.email,
              ].filter(Boolean)}
            />
            <AddressBlock
              title="Returned From"
              name="Doctor of Bats — Main Branch"
              lines={["Stores Desk", "Colombo, Sri Lanka"]}
            />
          </div>

          {/* Line items */}
          <div className="px-8 pb-2">
            <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#faf6f2]">
                    <Th className="w-7 text-center">#</Th>
                    <Th>Product / Description</Th>
                    <Th className="text-right">UOM</Th>
                    <Th className="text-right">Received</Th>
                    <Th className="text-right">Returned</Th>
                    <Th className="text-left">Reason</Th>
                    <Th className="text-right">Unit Price</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {grr.lines.map((line, idx) => (
                    <tr key={line.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}>
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
                      <TdCompact className="text-right text-[#3f3b38]">
                        {line.receivedQty || "—"}
                      </TdCompact>
                      <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                        {line.returnQty}
                      </TdCompact>
                      <TdCompact>
                        <ReasonPill reason={line.reason} label={line.reasonLabel} />
                      </TdCompact>
                      <TdCompact className="text-right text-[#3f3b38]">
                        {formatMoney(line.unitPrice, grr.currency)}
                      </TdCompact>
                      <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                        {formatMoney(line.lineTotal, grr.currency)}
                      </TdCompact>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end px-8 pb-4 pt-3">
            <div className="w-full max-w-[280px] space-y-1.5 rounded-xl border border-[#ede8e3] bg-[#fdfaf7] px-5 py-3">
              <TotalRow label="Total Lines" value={String(grr.lines.length)} />
              <TotalRow label="Total Returned Qty" value={totalQtyNumber.toString()} />
              <div className="my-1 h-px bg-[#ede8e3]" />
              <TotalRow
                label="Return Value"
                value={formatMoney(totalValueNumber.toFixed(2), grr.currency)}
                bold
              />
            </div>
          </div>

          {/* Notes */}
          {grr.notes ? (
            <div className="mt-2 border-t border-[#f0ebe5] px-8 py-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Notes
              </p>
              <p className="whitespace-pre-line text-xs text-[#5f5750]">{grr.notes}</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div id="grr-footer-section">
          <div className="flex items-center justify-between rounded-b-3xl border-t border-[#f0ebe5] bg-[#faf6f2] px-8 py-3">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/logo-dob-bw.png"
                alt="Doctor of Bats"
                width={80}
                height={28}
                className="h-7 w-auto object-contain opacity-40"
              />
            </div>
            <p className="text-[11px] text-[#a2978c]">
              Generated{" "}
              {new Date(grr.createdAt).toLocaleDateString("en-LK", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}{" "}
              · {grr.returnNumber}
              {grr.approvedByName ? ` · Approved by ${grr.approvedByName}` : ""}
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
        {label}
      </p>
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
    <div className="rounded-2xl border border-[#ede8e3] bg-[#fdfaf7] px-5 py-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c47f3a]">
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
      className={`border-b border-[#ede8e3] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
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
    <td className={`border-b border-[#ede8e3] px-3 py-1.5 text-sm last:border-b-0 ${className}`}>
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
          bold ? "text-lg font-bold text-[#ff7a12]" : `font-medium text-[#3f3b38] ${className}`
        }`}
      >
        {value}
      </span>
    </div>
  );
}
