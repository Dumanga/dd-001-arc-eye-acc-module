"use client";

import React from "react";
import Image from "next/image";
import { ArrowLeft, Download, Printer } from "lucide-react";
import type { StockReportItem } from "@/app/api/accounting/inventory/stock-report/route";

// ─── Types ────────────────────────────────────────────────────────────────

export type StockReportStatusFilter = "HEALTHY" | "LOW" | "OUT";

const STATUS_LABEL: Record<StockReportStatusFilter, string> = {
  HEALTHY: "Healthy",
  LOW: "Low stock",
  OUT: "Out of stock",
};

type Props = {
  items: StockReportItem[];
  selectedStatuses: StockReportStatusFilter[];
  generatedAt: Date;
  onBack: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMoney(value: string, currency = "LKR"): string {
  const n = Number(value);
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function statusForQty(qty: number): StockReportStatusFilter {
  if (qty <= 0) return "OUT";
  if (qty <= 5) return "LOW";
  return "HEALTHY";
}

// ─── Print window helper ─────────────────────────────────────────────────

function openPrintWindow() {
  const printArea = document.getElementById("stock-report-print-area");
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
  <title>Stock Report</title>
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
    body > #report-content > div:first-child,
    body > #report-footer-section > div {
      border-radius: 0 !important;
    }
    #report-footer-section {
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
    const footerEl = win.document.getElementById("report-footer-section");
    const contentEl = win.document.getElementById("stock-report-print-area");
    if (footerEl && contentEl) {
      const fh = footerEl.getBoundingClientRect().height;
      contentEl.style.paddingBottom = Math.ceil(fh) + "px";
    }
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

// ─── Main component ──────────────────────────────────────────────────────

export function StockReportPreview({
  items,
  selectedStatuses,
  generatedAt,
  onBack,
}: Props) {
  const filteredItems = items.filter((item) =>
    selectedStatuses.includes(statusForQty(Number(item.totalQtyOnHand))),
  );

  const totals = filteredItems.reduce(
    (acc, item) => {
      acc.units += Number(item.totalQtyOnHand);
      acc.value += Number(item.totalStockValue);
      return acc;
    },
    { units: 0, value: 0 },
  );

  function handlePrint() {
    openPrintWindow();
  }

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
          Back to stock report
        </button>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {/* Printable area */}
      <div
        id="stock-report-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#cdeef3] bg-white shadow-sm"
      >
        <div id="report-content">
          {/* Header — same letterhead as invoice/GRN previews, no status badge */}
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
                Stock Report
              </p>
              <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">
                Inventory Snapshot
              </p>
              <p className="mt-1.5 text-xs text-[#7c6f65]">
                {formatDisplayDate(generatedAt)}
              </p>
            </div>
          </div>

          <div className="h-px bg-[#cdeef3]" />

          {/* Meta grid */}
          <div className="grid grid-cols-3 gap-4 px-8 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Filtered Statuses
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                {selectedStatuses.map((s) => STATUS_LABEL[s]).join(", ")}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Products in Report
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                {filteredItems.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                Generated
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                {generatedAt.toLocaleTimeString("en-LK", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Lines */}
          <div className="px-8 pb-2">
            <div className="overflow-hidden rounded-xl border border-[#cdeef3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#e0fafd]">
                    <Th className="w-7 text-center">#</Th>
                    <Th>Code / Product</Th>
                    <Th className="text-right">Type</Th>
                    <Th className="text-right">UOM</Th>
                    <Th className="text-right">On Hand</Th>
                    <Th className="text-right">Avg Cost</Th>
                    <Th className="text-right">Stock Value</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <TdCompact className="text-center text-[#9a8f85]" colSpan={8}>
                        No products match the selected statuses.
                      </TdCompact>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const qty = Number(item.totalQtyOnHand);
                      const status = statusForQty(qty);
                      return (
                        <tr
                          key={item.id}
                          className="bg-white"
                        >
                          <TdCompact className="text-center font-medium text-[#9a8f85]">
                            {idx + 1}
                          </TdCompact>
                          <TdCompact>
                            <p className="font-semibold leading-tight text-[#1f1d1c]">
                              {item.code}
                            </p>
                            <p className="text-[11px] text-[#9a8f85]">{item.name}</p>
                            {item.branchStock.length ? (
                              <p className="mt-0.5 text-[10px] text-[#9a8f85]">
                                {item.branchStock
                                  .map((b) => `${b.storeCode}: ${b.qtyOnHand}`)
                                  .join(" · ")}
                              </p>
                            ) : null}
                          </TdCompact>
                          <TdCompact className="text-right text-[10px]">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${
                                item.itemType === "VOUCHER"
                                  ? "border-violet-200 bg-violet-50 text-violet-700"
                                  : "border-blue-200 bg-blue-50 text-blue-700"
                              }`}
                            >
                              {item.itemType === "VOUCHER" ? "Voucher" : "Inventory"}
                            </span>
                          </TdCompact>
                          <TdCompact className="text-right text-[#3f3b38]">
                            {item.uomBase || "—"}
                          </TdCompact>
                          <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                            {item.totalQtyOnHand}
                          </TdCompact>
                          <TdCompact className="text-right text-[#3f3b38]">
                            {formatMoney(item.costPrice)}
                          </TdCompact>
                          <TdCompact className="text-right font-semibold text-[#1f1d1c]">
                            {formatMoney(item.totalStockValue)}
                          </TdCompact>
                          <TdCompact>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                status === "OUT"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : status === "LOW"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {STATUS_LABEL[status]}
                            </span>
                          </TdCompact>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          {filteredItems.length > 0 ? (
            <div className="flex justify-end px-8 pb-4 pt-3">
              <div className="w-full max-w-[320px] space-y-1.5 rounded-xl border border-[#cdeef3] bg-[#ecfcff] px-5 py-3">
                <TotalRow
                  label="Products"
                  value={String(filteredItems.length)}
                />
                <TotalRow
                  label="Total Units"
                  value={totals.units.toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })}
                />
                <div className="my-1 h-px bg-[#cdeef3]" />
                <TotalRow
                  label="Total Stock Value"
                  value={formatMoney(totals.value.toFixed(2))}
                  bold
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div id="report-footer-section">
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
              Generated {formatDisplayDate(generatedAt)} · Stock Report
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-[#cdeef3] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
    >
      {children}
    </th>
  );
}

function TdCompact({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-[#cdeef3] px-3 py-1.5 text-sm last:border-b-0 ${className}`}
    >
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
      <span
        className={`text-sm ${bold ? "font-bold text-[#1f1d1c]" : "text-[#786f69]"}`}
      >
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
