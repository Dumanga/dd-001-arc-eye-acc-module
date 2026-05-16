// Thermal receipt template for POS bills. Modeled on
// `src/lib/print/repair-receipt.ts` so it follows the same 72mm
// roll layout the operational system already prints to. Per
// pos-integration-flow.md § 3.12 / § 5.8.

export type PosReceiptLine = {
  productCode: string;
  productName: string;
  qty: string;
  unitPrice: string;
  discount: string; // line discount amount
  lineTotal: string;
  uomBase: string;
  // Serial number of the specific unit sold, when this line is a
  // serial-tracked item (productSerialId set) OR a voucher line
  // (voucherSerialId set). Null for everything else. Renders as a
  // monospace line under the product name on the thermal receipt.
  serialNumber: string | null;
};

export type PosReceiptPayment = {
  // Customer-facing label — "Cash", "Card", "Bank — SAMPATH …",
  // "Merchant — Visa Test Merchant", etc. Built by the caller because
  // it has the cash-account / merchant-name lookups already.
  label: string;
  amount: string;
};

export type PosReceiptData = {
  billNo: string;
  postedAt: Date;
  storeName: string;
  cashierName: string;
  customerName: string;
  customerIsWalkIn: boolean;
  paymentMethod: "CASH" | "CARD" | "MIXED" | "SPLIT";
  lines: PosReceiptLine[];
  subtotal: string;
  totalDiscount: string;
  total: string;
  payments: PosReceiptPayment[];
  // For SPLIT bills only — customer-facing reminder that the merchant
  // is settling later. Caller passes `null` for cash/card/mixed bills.
  splitMerchantName: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `LKR ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: Date) {
  // POS receipts always print Sri Lanka time (Asia/Colombo, UTC+5:30)
  // regardless of the server's locale or where the page is rendered —
  // a Colombo cashier should see Colombo time on the printout.
  return value.toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function renderPosBillReceipt(data: PosReceiptData): string {
  const lineRows = data.lines
    .map((line) => {
      const qtyN = Number(line.qty);
      const priceN = Number(line.unitPrice);
      const discountN = Number(line.discount);
      const safeQty = Number.isFinite(qtyN) ? qtyN : 0;
      const safePrice = Number.isFinite(priceN) ? priceN : 0;
      const qtyPriceLine = `${safeQty.toLocaleString("en-US", { maximumFractionDigits: 4 })} × ${safePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const discountLine =
        discountN > 0
          ? `<div class="line-discount">  Less ${money(discountN)}</div>`
          : "";
      const serialLine = line.serialNumber
        ? `<div class="line-serial">SN: ${escapeHtml(line.serialNumber)}</div>`
        : "";
      return `
        <div class="line">
          <div class="line-name">${escapeHtml(line.productName)}</div>
          ${serialLine}
          <div class="line-meta">
            <span class="qty">${escapeHtml(qtyPriceLine)}</span>
            <span class="amount">${money(line.lineTotal)}</span>
          </div>
          ${discountLine}
        </div>`;
    })
    .join("");

  const splitFootnote =
    data.paymentMethod === "SPLIT" && data.splitMerchantName
      ? `<div class="split-note">Settled via merchant: ${escapeHtml(
          data.splitMerchantName,
        )}</div>`
      : "";

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>POS Bill ${escapeHtml(data.billNo)}</title>
      <style>
        @page {
          size: 72mm auto;
          margin: 4mm 3mm;
        }
        * { box-sizing: border-box; }
        html, body {
          width: 66mm;
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: "Courier New", Courier, monospace;
          font-size: 12px;
          line-height: 1.35;
        }
        .receipt { width: 100%; }
        .center { text-align: center; }
        .logo-img {
          display: block;
          width: 34mm;
          max-width: 100%;
          margin: 0 auto 4px auto;
          object-fit: contain;
        }
        .header-title {
          font-size: 14px;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.6px;
          margin-top: 2px;
        }
        .company-name {
          font-size: 16px;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.8px;
          margin: 6px 0 2px 0;
        }
        .company-address {
          text-align: center;
          font-size: 11px;
          line-height: 1.35;
          margin: 0;
        }
        .company-phone {
          text-align: center;
          font-size: 11px;
          margin: 1px 0 6px 0;
        }
        .receipt-title {
          font-size: 13px;
          font-weight: 700;
          text-align: center;
          letter-spacing: 1.2px;
          margin: 4px 0 0 0;
        }
        .meta { margin: 2px 0; }
        .rule {
          border-top: 1px dashed #000;
          margin: 8px 0;
          height: 0;
        }
        .lines { margin: 4px 0; }
        .line { margin: 4px 0; }
        .line-name { font-weight: 700; line-height: 1.3; }
        .line-meta {
          display: flex;
          justify-content: space-between;
          margin-top: 1px;
        }
        .line-discount {
          font-size: 11px;
          color: #333;
        }
        .line-serial {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          font-weight: 700;
          margin: 1px 0 0 0;
        }
        .qty { white-space: nowrap; }
        .amount { white-space: nowrap; }
        .sum-row {
          display: flex;
          justify-content: space-between;
          margin: 2px 0;
          font-size: 12px;
        }
        .sum-row.total {
          font-weight: 700;
          font-size: 14px;
          margin-top: 4px;
        }
        .split-note {
          margin-top: 4px;
          padding: 4px;
          border: 1px dashed #000;
          font-size: 11px;
          line-height: 1.3;
        }
        .thanks {
          text-align: center;
          margin-top: 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .powered-by {
          text-align: center;
          margin-top: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #555;
          letter-spacing: 0.3px;
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <img class="logo-img" src="/assets/icon.png" alt="Arc Eye" />
        <div class="company-name">DOCTOR OF BAT</div>
        <div class="company-address">
          No 65, Thalawathugoda Road,<br />
          Pitakotte, Colombo
        </div>
        <div class="company-phone">+94 77 718 4814 | +94 77 611 5265</div>
        <div class="receipt-title">SALES RECEIPT</div>
        <div class="rule"></div>

        <div class="meta"><strong>Bill:</strong> <strong>${escapeHtml(data.billNo)}</strong></div>
        <div class="meta">${escapeHtml(formatDateTime(data.postedAt))}</div>
        <div class="meta"><strong>Branch:</strong> ${escapeHtml(data.storeName)}</div>
        <div class="meta"><strong>Cashier:</strong> ${escapeHtml(data.cashierName)}</div>
        <div class="meta"><strong>Customer:</strong> ${escapeHtml(
          data.customerIsWalkIn ? "Walk-in" : data.customerName,
        )}</div>

        <div class="rule"></div>
        <div class="lines">
          ${lineRows || '<div class="meta">No items.</div>'}
        </div>
        <div class="rule"></div>

        <div class="sum-row"><span>Subtotal</span><span class="amount">${money(data.subtotal)}</span></div>
        ${
          Number(data.totalDiscount) > 0
            ? `<div class="sum-row"><span>Discount</span><span class="amount">− ${money(data.totalDiscount)}</span></div>`
            : ""
        }
        <div class="sum-row total"><span>Total</span><span class="amount">${money(data.total)}</span></div>

        ${splitFootnote}

        <div class="rule"></div>
        <div class="thanks">Thank you — visit again!</div>
        <div class="powered-by">Powered by Dozen Digital Pvt Ltd</div>
      </div>
    </body>
  </html>`;
}
