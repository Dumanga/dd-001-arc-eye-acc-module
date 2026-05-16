"use client";

import React from "react";
import Image from "next/image";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "@/components/accounting/accounting-ui";
import type { PoDetail } from "@/app/api/accounting/purchase-orders/[id]/route";

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

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  DRAFT:              { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  SENT:               { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200"  },
  PARTIALLY_RECEIVED: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200"},
  RECEIVED:           { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  CANCELLED:          { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200"   },
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${c.bg} ${c.text} ${c.border}`}
    >
      {label}
    </span>
  );
}

// ─── Print window helper ──────────────────────────────────────────────────────

function openPrintWindow(poNumber: string) {
  const printArea = document.getElementById("po-print-area");
  if (!printArea) return;

  // Collect all same-origin stylesheets (Tailwind compiled bundle)
  const styleText = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((r) => r.cssText);
      } catch {
        // Cross-origin sheet — skip
        return [];
      }
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Purchase Order — ${poNumber}</title>
  <style>
    ${styleText}

    /* ── Print-specific overrides ── */
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
    }
    /* Full-width page — no border / shadow / rounded on outer wrapper */
    body > div {
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
    }
    /* Remove rounding on printed header and footer bar */
    body > div > #po-content > div:first-child,
    body > div > #po-footer-section > div:last-child {
      border-radius: 0 !important;
    }
    /* Pin notes + footer bar to the bottom of every page */
    #po-footer-section {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      background: white !important;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
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

  // After render: reserve space for the fixed footer so content doesn't slide under it
  win.onload = () => {
    const footerEl = win.document.getElementById("po-footer-section");
    const contentEl = win.document.getElementById("po-print-area");
    if (footerEl && contentEl) {
      const fh = footerEl.getBoundingClientRect().height;
      // Pad the main wrapper so the last line of content is always above the fixed footer
      contentEl.style.paddingBottom = Math.ceil(fh) + "px";
    }
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  poId: string;
  onBack: () => void;
};

export function PurchaseOrderPreview({ poId, onBack }: Props) {
  const [po, setPo] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPurchaseOrder() {
      await Promise.resolve();
      if (cancelled) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/accounting/purchase-orders/${poId}`, {
          headers: { "x-portal": "ACCOUNTING" },
        });
        const payload = await response.json() as { success: boolean; data: { po: PoDetail } | null; message?: string };
        if (cancelled) return;

        if (payload.success && payload.data) {
          setPo(payload.data.po);
        } else {
          setError(payload.message ?? "Failed to load purchase order.");
        }
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPurchaseOrder();

    return () => { cancelled = true; };
  }, [poId]);

  function handlePrint() {
    if (po) openPrintWindow(po.poNumber);
  }

  if (loading) {
    return (
      <SurfaceCard>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-[#786f69]">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff7101]" />
          Loading purchase order…
        </div>
      </SurfaceCard>
    );
  }

  if (error || !po) {
    return (
      <SurfaceCard>
        <div className="py-6">
          <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
            {error ?? "Purchase order not found."}
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

  const hasDiscount = Number(po.discount) > 0;
  const hasTax = Number(po.totalTax) > 0;

  function formatTaxChip(tax: { code: string; rate: string; method: string }) {
    if (tax.method === "PERCENTAGE") {
      const rate = Number(tax.rate);
      const rateStr = Number.isFinite(rate)
        ? rate % 1 === 0
          ? rate.toString()
          : rate.toFixed(2).replace(/\.?0+$/, "")
        : tax.rate;
      return `${tax.code} ${rateStr}%`;
    }
    return `${tax.code} (flat)`;
  }

  return (
    <>
      {/* Screen action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to purchase orders
        </button>
        <div className="flex items-center gap-2">
          <StatusBadge status={po.status} label={po.statusLabel} />
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
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* ─── Printable document ─────────────────────────────────────── */}
      <div
        id="po-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#e2d8cf] bg-white shadow-sm"
      >
        {/* ── Content wrapper — grows so footer stays at page bottom ── */}
        <div id="po-content">

        {/* ── Header ──────────────────────────────────────────────── */}
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
              Purchase Order
            </p>
            <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">{po.poNumber}</p>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <StatusBadge status={po.status} label={po.statusLabel} />
            </div>
          </div>
        </div>

        {/* ── Divider line ────────────────────────────────────────── */}
        <div className="h-px bg-[#f0ebe5]" />

        {/* ── Meta grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4 px-8 py-4">
          <MetaField label="PO Date" value={formatDisplayDate(po.poDate)} />
          <MetaField label="Expected Delivery" value={formatDisplayDate(po.expectedDate)} />
          <MetaField label="Currency" value={po.currency} />
          <MetaField label="Buyer Reference" value={po.buyerCode || "—"} />
          {po.supplierRef && (
            <MetaField label="Supplier Ref." value={po.supplierRef} />
          )}
        </div>

        {/* ── Supplier / Ship-to — always 2 columns ───────────────── */}
        <div className="grid grid-cols-2 gap-4 px-8 pb-4">
          <AddressBlock
            title="Bill To / Ship From"
            name={po.supplier.name}
            lines={[
              po.supplier.addressLine1,
              po.supplier.addressLine2,
              [po.supplier.city, po.supplier.country].filter(Boolean).join(", "),
              po.supplier.phone ? `Tel: ${po.supplier.phone}` : "",
              po.supplier.email,
            ].filter(Boolean)}
          />
          <AddressBlock
            title="Deliver To"
            name="Doctor of Bats — Main Branch"
            lines={[
              "Receiving Desk",
              "Colombo, Sri Lanka",
            ]}
          />
        </div>

        {/* ── Line items ──────────────────────────────────────────── */}
        <div className="px-8 pb-2">
          <div className="overflow-hidden rounded-xl border border-[#ede8e3]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#faf6f2]">
                  <Th className="w-7 text-center">#</Th>
                  <Th>Product / Description</Th>
                  <Th className="text-right">UOM</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit Price</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line, idx) => (
                  <tr
                    key={line.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-[#fdfaf7]"}
                  >
                    <TdCompact className="text-center font-medium text-[#9a8f85]">
                      {idx + 1}
                    </TdCompact>
                    <TdCompact>
                      <p className="font-semibold text-[#1f1d1c] leading-tight">
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
                    <TdCompact className="text-right font-medium text-[#1f1d1c]">
                      {Number(line.quantity).toLocaleString("en-US")}
                    </TdCompact>
                    <TdCompact className="text-right text-[#3f3b38]">
                      {formatMoney(line.unitPrice, po.currency)}
                    </TdCompact>
                    <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                      {formatMoney(line.lineTotal, po.currency)}
                    </TdCompact>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Totals ──────────────────────────────────────────────── */}
        <div className="flex justify-end px-8 pb-4 pt-3">
          <div className="w-full max-w-[260px] space-y-1.5 rounded-xl border border-[#ede8e3] bg-[#fdfaf7] px-5 py-3">
            <TotalRow label="Subtotal" value={formatMoney(po.subtotal, po.currency)} />
            {hasDiscount && (
              <TotalRow
                label="Discount"
                value={`− ${formatMoney(po.totalDiscount, po.currency)}`}
                className="text-red-600"
              />
            )}
            {hasTax && (
              <>
                {po.taxBreakdown.map((tax, idx) => (
                  <div
                    key={`${tax.code}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm"
                    title={`${tax.name} on ${formatMoney(tax.base, po.currency)}`}
                  >
                    <span className="text-[#786f69]">{formatTaxChip(tax)}</span>
                    <span className="font-medium tabular-nums text-[#3f3b38]">
                      {formatMoney(tax.amount, po.currency)}
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="my-1 h-px bg-[#ede8e3]" />
            <TotalRow
              label="Grand Total"
              value={formatMoney(po.grandTotal, po.currency)}
              bold
            />
          </div>
        </div>

        {/* ── Notes & Terms — natural flow, below totals ───────────── */}
        {(po.notes || po.terms) && (
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#f0ebe5] px-8 py-4">
            {po.notes && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                  Notes
                </p>
                <p className="whitespace-pre-line text-xs text-[#5f5750]">{po.notes}</p>
              </div>
            )}
            {po.terms && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                  Terms & Conditions
                </p>
                <p className="whitespace-pre-line text-xs text-[#5f5750]">{po.terms}</p>
              </div>
            )}
          </div>
        )}

        </div>{/* end po-content */}

        {/* ── Footer bar — fixed to bottom of last page in print ───── */}
        <div id="po-footer-section">
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
              Generated {new Date(po.createdAt).toLocaleDateString("en-LK", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })} · {po.poNumber}
            </p>
          </div>
        </div>{/* end po-footer-section */}
      </div>
    </>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

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
      <span
        className={`text-sm ${bold ? "font-bold text-[#1f1d1c]" : "text-[#786f69]"}`}
      >
        {label}
      </span>
      <span
        className={`text-sm ${bold ? "text-lg font-bold text-[#ff7a12]" : `font-medium text-[#3f3b38] ${className}`}`}
      >
        {value}
      </span>
    </div>
  );
}
