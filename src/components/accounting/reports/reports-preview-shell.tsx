"use client";

// Generic A4 letterhead preview shell. Any report inside the Reports
// hub renders into this — same letterhead pattern as
// stock-report-preview / invoice-preview / customer-payment-preview,
// kept consistent so all printed exports look like one document
// family.
//
// Takes a flat column/row data shape from the report catalog's
// SamplePreview type (or, eventually, the live API response),
// renders the header / meta band / table / totals card, and
// provides Print / Download PDF / Download Excel buttons in the
// action bar.

import React from "react";
import Image from "next/image";
import { ArrowLeft, Download, FileSpreadsheet, Printer } from "lucide-react";
import type { ReportDefinition } from "./reports-catalog-data";

type Props = {
  report: ReportDefinition;
  // Filter values that were used to generate this preview. Rendered
  // as a meta band above the table. (Caller is responsible for
  // formatting the values to display strings.)
  filterChips: Array<{ label: string; value: string }>;
  // Rendered when the report has report-specific meta (e.g.
  // "Customer: PW Client Alpha · Period: 01 May – 11 May").
  reportMeta?: Array<{ label: string; value: string }>;
  // Table columns left-to-right, with optional alignment.
  columns: string[];
  align?: Array<"left" | "right" | "center">;
  // Table rows of pre-formatted strings.
  rows: string[][];
  // Optional per-row visual style — used by grouped reports like
  // Journal Entries. Default is "normal" for any unspecified row.
  rowStyles?: Array<"normal" | "header" | "subtotal">;
  // Optional totals card (right-aligned at the bottom).
  totals?: Array<{ label: string; value: string; bold?: boolean }>;
  generatedAt: Date;
  onBack: () => void;
  onExportExcel?: () => void;
};

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function openPrintWindow() {
  const printArea = document.getElementById("report-print-area");
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
  <title>Report</title>
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
    const contentEl = win.document.getElementById("report-print-area");
    if (footerEl && contentEl) {
      const fh = footerEl.getBoundingClientRect().height;
      contentEl.style.paddingBottom = Math.ceil(fh) + "px";
    }
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
}

export function ReportsPreviewShell({
  report,
  filterChips,
  reportMeta,
  columns,
  align,
  rows,
  rowStyles,
  totals,
  generatedAt,
  onBack,
  onExportExcel,
}: Props) {
  const supportsExcel = report.exportFormats.includes("EXCEL");

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
          Back to filters
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPrintWindow}
            className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={openPrintWindow}
            className="inline-flex items-center gap-2 rounded-xl border border-[#cdeef3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f5750] transition hover:bg-[#ecfcff]"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
          {supportsExcel ? (
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f6b3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0c5530]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel
            </button>
          ) : null}
        </div>
      </div>

      {/* Printable area */}
      <div
        id="report-print-area"
        className="mx-auto max-w-4xl rounded-3xl border border-[#cdeef3] bg-white shadow-sm"
      >
        <div id="report-content">
          {/* Header — same letterhead as invoice/GRN previews */}
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
                {report.previewEyebrow}
              </p>
              <p className="mt-0.5 text-2xl font-bold text-[#1f1d1c]">
                {report.previewSubtitle}
              </p>
              <p className="mt-1.5 text-xs text-[#7c6f65]">
                {formatDisplayDate(generatedAt)}
              </p>
            </div>
          </div>

          <div className="h-px bg-[#cdeef3]" />

          {/* Filter / report meta band */}
          {filterChips.length > 0 ? (
            <div className="grid grid-cols-3 gap-4 px-8 py-4">
              {filterChips.slice(0, 6).map((chip) => (
                <div key={chip.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                    {chip.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                    {chip.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {reportMeta && reportMeta.length > 0 ? (
            <div className="border-t border-[#cdeef3]">
              <div className="grid grid-cols-3 gap-4 px-8 py-3">
                {reportMeta.map((m) => (
                  <div key={m.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a8f85]">
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#1f1d1c]">
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Lines */}
          <div className="px-8 pb-2 pt-2">
            <div className="overflow-hidden rounded-xl border border-[#cdeef3]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#e0fafd]">
                    {columns.map((col, idx) => (
                      <Th
                        key={col + idx}
                        className={
                          align?.[idx] === "right"
                            ? "text-right"
                            : align?.[idx] === "center"
                              ? "text-center"
                              : "text-left"
                        }
                      >
                        {col}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <TdCompact
                        className="text-center text-[#9a8f85]"
                        colSpan={columns.length}
                      >
                        No data for the selected filters.
                      </TdCompact>
                    </tr>
                  ) : (
                    rows.map((row, rIdx) => {
                      const style = rowStyles?.[rIdx] ?? "normal";
                      // Visual treatment per style:
                      //   header   — light-orange band, bold (group title for
                      //              grouped reports like Journal Entries)
                      //   subtotal — top border + bold (group footer / Dr=Cr
                      //              balance check)
                      //   normal   — striped alternating background
                      const rowClass =
                        style === "header"
                          ? "bg-[#e0fafd] font-semibold text-[#0891a8]"
                          : style === "subtotal"
                            ? "border-t border-[#cdeef3] bg-[#ecfcff] font-semibold text-[#1f1d1c]"
                            : "bg-white";
                      return (
                        <tr key={rIdx} className={rowClass}>
                          {row.map((cell, cIdx) => (
                            <TdCompact
                              key={cIdx}
                              className={
                                align?.[cIdx] === "right"
                                  ? "text-right tabular-nums"
                                  : align?.[cIdx] === "center"
                                    ? "text-center"
                                    : "text-left"
                              }
                            >
                              {cell}
                            </TdCompact>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          {totals && totals.length > 0 ? (
            <div className="flex justify-end px-8 pb-4 pt-3">
              <div className="w-full max-w-[360px] space-y-1.5 rounded-xl border border-[#cdeef3] bg-[#ecfcff] px-5 py-3">
                {totals.map((t, idx) => {
                  const isLastBold = t.bold;
                  return (
                    <React.Fragment key={t.label + idx}>
                      {isLastBold && idx > 0 ? (
                        <div className="my-1 h-px bg-[#cdeef3]" />
                      ) : null}
                      <div className="flex items-center justify-between gap-4">
                        <span
                          className={`text-sm ${isLastBold ? "font-bold text-[#1f1d1c]" : "text-[#786f69]"}`}
                        >
                          {t.label}
                        </span>
                        <span
                          className={`tabular-nums ${
                            isLastBold
                              ? "text-lg font-bold text-[#0891a8]"
                              : "text-sm font-medium text-[#3f3b38]"
                          }`}
                        >
                          {t.value}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
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
              Generated {formatDisplayDate(generatedAt)} · {report.previewSubtitle}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-[#cdeef3] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a8f85] ${className}`}
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
