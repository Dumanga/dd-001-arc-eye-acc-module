// GET /api/accounting/reports/customer-payment-receipts?dateRange=&customerId=
//
// Lists all APPROVED customer payment receipts (RC) in a date range,
// with the receiving account they hit and the allocated/discount/
// total figures from the receipt header.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  fmtDateSlt,
  parseDateRange,
  sumDecimals,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const customerId = url.searchParams.get("customerId")?.trim() ?? "";

    const where: Prisma.AccountingCustomerPaymentReceiptWhereInput = {
      status: "APPROVED",
      ...(customerId ? { customerId } : {}),
      ...(from || to
        ? {
            receiptDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const receipts = await prisma.accountingCustomerPaymentReceipt.findMany({
      where,
      orderBy: { receiptDate: "asc" },
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        receivingTotal: true,
        discountTotal: true,
        customer: { select: { name: true } },
        receiveToAccount: { select: { code: true, name: true } },
      },
    });

    const rows: string[][] = receipts.map((r, idx) => {
      const total = Number(r.receivingTotal) + Number(r.discountTotal);
      return [
        String(idx + 1),
        r.receiptNumber,
        fmtDateSlt(r.receiptDate),
        r.customer.name,
        `${r.receiveToAccount.code} ${r.receiveToAccount.name}`,
        fmtMoneyAlways(r.receivingTotal),
        fmtMoneyAlways(r.discountTotal),
        fmtMoneyAlways(total),
      ];
    });

    const totals = [
      { label: "Receipts", value: String(receipts.length) },
      {
        label: "Total Allocated",
        value: fmtMoneyAlways(sumDecimals(receipts.map((r) => r.receivingTotal))),
      },
      {
        label: "Total",
        value: fmtMoneyAlways(
          sumDecimals(receipts.map((r) => Number(r.receivingTotal) + Number(r.discountTotal))),
        ),
        bold: true,
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Receipt No", "Date", "Customer", "Cash A/C", "Allocated", "Discount", "Total"],
      align: ["center", "left", "left", "left", "left", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Customer payment receipts register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT CUSTOMER-PAYMENT-RECEIPTS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
