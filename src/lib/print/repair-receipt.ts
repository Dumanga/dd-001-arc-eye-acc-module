export type RepairReceiptLine = {
  name: string;
  amount: number;
};

export type RepairReceiptData = {
  copyType: "REPAIR" | "CUSTOMER";
  billNo: string;
  physicalBillNo?: string | null;
  description?: string | null;
  issuedAt: Date;
  estimatedDeliveryDate?: Date | string | null;
  clientName: string;
  clientMobile: string;
  brandName: string;
  storeName: string;
  intakeType: "WALK_IN" | "COURIER";
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  lines: RepairReceiptLine[];
  subtotal: number;
  total: number;
  advance: number;
  balance: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: number) {
  return `LKR ${value.toLocaleString()}`;
}

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatEstimatedDelivery(value?: Date | string | null) {
  const formattedDate = value ? formatDate(value) : "";
  return formattedDate ? `${formattedDate} - After 5:00 P.M` : "";
}

function statusLabel(
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED"
) {
  switch (status) {
    case "PROCESSING":
      return "Processing";
    case "REPAIR_COMPLETED":
      return "Repair Completed";
    case "DELIVERED":
      return "Delivered";
    default:
      return "Pending";
  }
}

function buildReceiptHtml(data: RepairReceiptData) {
  const isRepairCopy = data.copyType === "REPAIR";
  const physicalBillNo = data.physicalBillNo?.trim() ?? "";
  const physicalBillMeta = physicalBillNo
    ? `<div class="meta">Physical Bill No: ${escapeHtml(physicalBillNo)}</div>`
    : "";
  const description = data.description?.trim() ?? "";
  const repairDescriptionSection =
    isRepairCopy && description
      ? `
        <div class="rule"></div>
        <div class="repair-description-title">Description</div>
        <div class="repair-description-body">${escapeHtml(description)}</div>
      `
      : "";
  const repairLineRows = data.lines
    .map((line, index) => {
      const displayName =
        line.name.split(" - ").slice(1).join(" - ").trim() || line.name;
      return `
      <div class="line-row repair-row">
        <div class="line-name repair-name">${index + 1}. ${escapeHtml(displayName)}</div>
      </div>
    `;
    })
    .join("");
  const repairCodes = data.lines
    .map((line) => {
      const code = line.name.split(" - ")[0]?.trim();
      return code || line.name;
    })
    .filter(Boolean);

  const customerRepairsSection = `
    <div class="meta"><strong>Repairs</strong></div>
    <div class="meta">${escapeHtml(repairCodes.join(", "))}</div>
  `;
  const estimatedDeliveryValue = formatEstimatedDelivery(
    data.estimatedDeliveryDate
  );
  const repairCopyMeta = `
    <div class="repair-title-label">REPAIR BILL</div>
    <div class="repair-title-bill">${escapeHtml(data.billNo)}</div>
    <div class="rule"></div>
    <div class="repair-client">${escapeHtml(data.clientName)}</div>
    <div class="repair-mobile">${escapeHtml(data.clientMobile)}</div>
    <div class="repair-created"><strong>Created Date:</strong> ${escapeHtml(
      formatDate(data.issuedAt)
    )}</div>
    <div class="repair-delivery"><strong>Estimated Delivery:</strong> ${escapeHtml(
      estimatedDeliveryValue || "-"
    )}</div>
  `;
  const customerCopyHeader = `
    <img class="logo-img" src="/assets/icon.png" alt="Arc Eye" />
    <div class="center sub">REPAIR BILL</div>
    <div class="contact">doctorofbat@gmail.com</div>
    <div class="contact">+94 77 718 4814</div>
    <div class="rule"></div>
    <div class="meta">Bill: ${escapeHtml(data.billNo)}</div>
    ${physicalBillMeta}
    <div class="meta">${escapeHtml(formatDateTime(data.issuedAt))}</div>
    <div class="meta">Client: ${escapeHtml(data.clientName)}</div>
    <div class="meta">Mobile: ${escapeHtml(data.clientMobile)}</div>
    <div class="meta">Brand: ${escapeHtml(data.brandName)}</div>
    <div class="meta">Store: ${escapeHtml(data.storeName)}</div>
    <div class="meta">Intake: ${data.intakeType === "COURIER" ? "Courier" : "Walk-in"}</div>
    <div class="meta">Status: ${statusLabel(data.status)}</div>
    <div class="meta">Estimated Delivery: ${escapeHtml(estimatedDeliveryValue || "-")}</div>
  `;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Repair Bill ${escapeHtml(data.billNo)}</title>
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
        .logo { font-size: 20px; font-weight: 700; letter-spacing: 0.4px; }
        .sub { font-size: 12px; letter-spacing: 0.8px; margin-top: 2px; }
        .contact { text-align: center; font-size: 11px; margin-top: 1px; }
        .repair-title-label {
          font-size: 16px;
          font-weight: 700;
          text-align: center;
          margin: 0;
          line-height: 1.1;
          letter-spacing: 0.8px;
        }
        .repair-title-bill {
          font-size: 32px;
          font-weight: 700;
          text-align: center;
          margin: 1px 0 0 0;
          line-height: 1.05;
        }
        .repair-client {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          margin-top: 2px;
        }
        .repair-mobile {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.2;
          margin-top: 1px;
        }
        .repair-delivery {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.25;
          margin-top: 4px;
        }
        .repair-created {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.25;
          margin-top: 4px;
        }
        .rule {
          border-top: 1px dashed #000;
          margin: 8px 0;
          height: 0;
        }
        .meta { margin: 2px 0; }
        .line-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin: 2px 0;
        }
        .line-name { flex: 1; }
        .repair-name {
          font-size: 25px;
          font-weight: 700;
          line-height: 1.3;
        }
        .repair-row { margin: 7px 0; }
        .line-amount { white-space: nowrap; }
        .sum-row {
          display: flex;
          justify-content: space-between;
          margin: 2px 0;
          font-size: 13px;
        }
        .sum-row.total {
          font-weight: 700;
          margin-top: 4px;
        }
        .thanks {
          text-align: center;
          margin-top: 10px;
          font-size: 13px;
          letter-spacing: 0.5px;
        }
        .powered-by {
          text-align: center;
          margin-top: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #555;
          letter-spacing: 0.3px;
        }
        .repair-balance {
          font-size: 20px;
          font-weight: 700;
          margin: 5px 0;
        }
        .repair-description-title {
          font-size: 20px;
          font-weight: 700;
          margin: 2px 0 0 0;
        }
        .repair-description-body {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          margin: 2px 0;
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        ${isRepairCopy ? repairCopyMeta : customerCopyHeader}

        <div class="rule"></div>
        ${
          data.copyType === "CUSTOMER"
            ? customerRepairsSection
            : repairLineRows
        }
        <div class="rule"></div>

        ${
          isRepairCopy
            ? `<div class="repair-balance">Balance to be collected: ${money(
                data.balance
              )}</div>`
            : `
        <div class="sum-row"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
        <div class="sum-row total"><span>Total</span><span>${money(data.total)}</span></div>
        <div class="sum-row"><span>Advance</span><span>${money(data.advance)}</span></div>
        <div class="sum-row"><span>Balance</span><span>${money(data.balance)}</span></div>
        `
        }
        ${repairDescriptionSection}

        <div class="rule"></div>
        <div class="thanks">THANK YOU</div>
        <div class="powered-by">Powered by Dozen Digital Pvt Ltd</div>
      </div>
      <script>
        window.onload = function () {
          setTimeout(function () {
            window.print();
          }, 120);
        };
      </script>
    </body>
  </html>
  `;
}

export function printRepairReceipt(data: RepairReceiptData) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(buildReceiptHtml(data));
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1500);
  };

  iframe.onload = cleanup;
  setTimeout(cleanup, 4000);
}
