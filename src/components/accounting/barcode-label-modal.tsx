"use client";

import { Loader2, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";

// Label dimensions match the customer's 36mm-wide thermal label
// printer roll. Height kept compact so name + barcode + price all
// fit comfortably with room to spare.
const LABEL_WIDTH_MM = 36;
const LABEL_HEIGHT_MM = 25;
const MAX_COPIES = 200;

// JsBarcode tuning for the 36mm-wide label. Narrower bars + shorter
// height keep the symbology readable while leaving vertical space
// for the name (above) and price (below).
const BARCODE_OPTS = {
  format: "CODE128" as const,
  displayValue: true,
  fontSize: 8,
  height: 36,
  margin: 2,
  width: 1.3,
};

type BarcodeLabelModalProps = {
  open: boolean;
  product: { itemCode: string; name: string; price?: string | null } | null;
  onClose: () => void;
};

// Render the price line shown below the barcode. Returns null for
// missing / zero values so the line collapses cleanly instead of
// printing "LKR 0.00" on a label.
function formatLabelPrice(price: string | null | undefined): string | null {
  if (!price) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `LKR ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BarcodeLabelModal({ open, product, onClose }: BarcodeLabelModalProps) {
  const [copies, setCopies] = useState("1");
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCopies("1");
    setError(null);
    setPrinting(false);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open || !product?.itemCode || !previewSvgRef.current) return;
    try {
      JsBarcode(previewSvgRef.current, product.itemCode, BARCODE_OPTS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to render barcode preview.");
    }
  }, [mounted, open, product?.itemCode]);

  if (!mounted || !open || !product) return null;

  const trimmedCode = product.itemCode.trim();
  const previewPrice = formatLabelPrice(product.price);

  function handlePrint() {
    if (!product) return;
    const code = product.itemCode.trim();
    if (!code) {
      setError("This product has no item code to encode.");
      return;
    }
    const n = Number.parseInt(copies, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter a number of copies between 1 and " + MAX_COPIES + ".");
      return;
    }
    if (n > MAX_COPIES) {
      setError("Maximum copies per print is " + MAX_COPIES + ".");
      return;
    }

    setError(null);
    setPrinting(true);

    try {
      const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(tempSvg, code, BARCODE_OPTS);
      const barcodeMarkup = tempSvg.outerHTML;

      const priceText = formatLabelPrice(product.price);
      const priceRow = priceText
        ? `<div class="price">${escapeHtml(priceText)}</div>`
        : "";

      const labels = Array.from({ length: n })
        .map(
          () => `
            <div class="label">
              <div class="name">${escapeHtml(product.name)}</div>
              <div class="barcode">${barcodeMarkup}</div>
              ${priceRow}
            </div>`,
        )
        .join("");

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument;
      if (!doc) {
        document.body.removeChild(iframe);
        setError("Unable to open the print frame.");
        setPrinting(false);
        return;
      }

      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Barcode labels - ${escapeHtml(code)}</title>
    <style>
      @page {
        size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;
        margin: 0;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #000;
        background: #fff;
      }
      .label {
        width: ${LABEL_WIDTH_MM}mm;
        height: ${LABEL_HEIGHT_MM}mm;
        padding: 1mm 1.5mm;
        page-break-after: always;
        page-break-inside: avoid;
        break-after: page;
        break-inside: avoid;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .label:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .name {
        font-size: 6.5pt;
        font-weight: 600;
        text-align: center;
        line-height: 1.1;
        max-height: 4mm;
        overflow: hidden;
        margin-bottom: 0.5mm;
        width: 100%;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .barcode {
        display: flex;
        align-items: center;
        justify-content: center;
        max-width: 100%;
        width: 100%;
      }
      .barcode svg {
        max-width: 100%;
        height: auto;
      }
      .price {
        margin-top: 0.5mm;
        font-size: 7pt;
        font-weight: 700;
        text-align: center;
        line-height: 1.1;
        width: 100%;
      }
    </style>
  </head>
  <body>
    ${labels}
  </body>
</html>`);
      doc.close();

      const finishPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          window.setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            setPrinting(false);
            onClose();
          }, 500);
        }
      };

      if (iframe.contentWindow?.document.readyState === "complete") {
        finishPrint();
      } else {
        iframe.onload = finishPrint;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate barcode.");
      setPrinting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="barcode-modal-title" className="text-lg font-semibold text-[#1f1d1c]">
              Download Barcode
            </h2>
            <p className="mt-1 text-sm text-[#7c6f65]">
              Generate Code 128 labels sized for a 36mm × 25mm thermal label printer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="rounded-full p-1 text-[#9b8f87] transition hover:bg-[#fff7f0] hover:text-[#1f1d1c] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#eadfd5] bg-[#fffaf5] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e7f72]">
            Item
          </p>
          <p className="mt-1 truncate text-sm font-medium text-[#1f1d1c]">{product.name}</p>
          <p className="mt-1 font-mono text-xs text-[#70665f]">{trimmedCode || "(no code)"}</p>
        </div>

        <div className="mt-4 flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#eadfd5] bg-white px-4 py-3">
          <p className="max-w-full truncate text-xs font-semibold text-[#1f1d1c]">
            {product.name}
          </p>
          <svg ref={previewSvgRef} aria-label="Barcode preview" />
          {previewPrice ? (
            <p className="text-xs font-bold text-[#1f1d1c]">{previewPrice}</p>
          ) : null}
        </div>

        <label className="mt-4 block">
          <span className="block text-sm font-medium text-[#1f1d1c]">Number of copies</span>
          <input
            type="number"
            min={1}
            max={MAX_COPIES}
            step={1}
            value={copies}
            onChange={(event) => setCopies(event.target.value)}
            disabled={printing}
            className="mt-1 h-11 w-full rounded-2xl border border-[#eadfd5] bg-white px-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
          />
          <span className="mt-1 block text-xs text-[#9b8f87]">Up to {MAX_COPIES} per print job.</span>
        </label>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-2 text-sm text-[#b94f37]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e2d8cf] bg-white px-4 py-2 text-sm font-semibold text-[#5f5750] transition hover:bg-[#fff7f0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)] transition hover:bg-[#ff8a2c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {printing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                Download / Print
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
