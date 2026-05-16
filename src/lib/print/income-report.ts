export type IncomeReportPrintRow = {
  billNo: string;
  storeName: string;
  clientName: string;
  totalAmount: number;
  receivedAmount: number;
  balance: number;
};

export type IncomeReportPrintData = {
  fromDate: string;
  toDate: string;
  generatedAt: Date;
  rows: IncomeReportPrintRow[];
  totals: {
    totalAmount: number;
    totalReceived: number;
    totalBalance: number;
  };
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function buildHtml(data: IncomeReportPrintData) {
  const bodyRows =
    data.rows.length === 0
      ? `
        <tr>
          <td colspan="6" class="empty">No repairs found for the selected date range.</td>
        </tr>
      `
      : data.rows
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.billNo)}</td>
          <td>${escapeHtml(row.storeName)}</td>
          <td>${escapeHtml(row.clientName)}</td>
          <td class="num">${money(row.totalAmount)}</td>
          <td class="num">${money(row.receivedAmount)}</td>
          <td class="num">${money(row.balance)}</td>
        </tr>
      `
          )
          .join("");

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Income Report</title>
      <style>
        @page {
          size: A4;
          margin: 12mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          color: #111827;
          font-family: "Segoe UI", Arial, sans-serif;
          font-size: 12px;
          background: #ffffff;
        }
        .page {
          width: 100%;
        }
        .header {
          border: 1px solid #d1d5db;
          border-radius: 12px;
          padding: 14px 16px;
          background: linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%);
        }
        .brand {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .brand img {
          height: 44px;
          width: auto;
        }
        .meta-title {
          font-size: 20px;
          font-weight: 700;
          margin: 8px 0 4px 0;
        }
        .meta-sub {
          color: #4b5563;
          font-size: 12px;
        }
        .meta-grid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .chip {
          border: 1px solid #d1d5db;
          border-radius: 10px;
          padding: 8px 10px;
          background: #ffffff;
        }
        .chip .label {
          color: #6b7280;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .chip .value {
          margin-top: 4px;
          font-size: 13px;
          font-weight: 600;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 14px;
        }
        th,
        td {
          border: 1px solid #d1d5db;
          padding: 8px 10px;
          text-align: left;
          vertical-align: top;
        }
        th {
          background: #f3f4f6;
          color: #374151;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .num {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .empty {
          text-align: center;
          color: #6b7280;
          padding: 16px;
        }
        tfoot td {
          background: #f9fafb;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="brand">
            <div>
              <div class="meta-title">Income Report</div>
              <div class="meta-sub">Doctor of Bat Operations</div>
            </div>
            <img src="/assets/logo-dob-bw.png" alt="Doctor of Bat logo" />
          </div>
          <div class="meta-grid">
            <div class="chip">
              <div class="label">From</div>
              <div class="value">${escapeHtml(formatDate(data.fromDate))}</div>
            </div>
            <div class="chip">
              <div class="label">To</div>
              <div class="value">${escapeHtml(formatDate(data.toDate))}</div>
            </div>
            <div class="chip">
              <div class="label">Generated at</div>
              <div class="value">${escapeHtml(formatDateTime(data.generatedAt))}</div>
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bill No</th>
              <th>Store</th>
              <th>Client Name</th>
              <th class="num">Total Amount</th>
              <th class="num">Received Amount</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Overall</td>
              <td class="num">${money(data.totals.totalAmount)}</td>
              <td class="num">${money(data.totals.totalReceived)}</td>
              <td class="num">${money(data.totals.totalBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 120);
        };
      </script>
    </body>
  </html>
  `;
}

export function printIncomeReport(data: IncomeReportPrintData) {
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
  doc.write(buildHtml(data));
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
