// GET /api/accounting/reports/supplier-payment-vouchers?dateRange=&supplierId=
//
// Mirror of the customer-payment-receipts report, supplier side.

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
    const supplierId = url.searchParams.get("supplierId")?.trim() ?? "";

    const where: Prisma.AccountingPaymentVoucherWhereInput = {
      status: "APPROVED",
      ...(supplierId ? { supplierId } : {}),
      ...(from || to
        ? {
            voucherDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const vouchers = await prisma.accountingPaymentVoucher.findMany({
      where,
      orderBy: { voucherDate: "asc" },
      select: {
        id: true,
        voucherNumber: true,
        voucherDate: true,
        paymentTotal: true,
        discountTotal: true,
        supplier: { select: { name: true } },
        payFromAccount: { select: { code: true, name: true } },
      },
    });

    const rows: string[][] = vouchers.map((v, idx) => {
      const total = Number(v.paymentTotal) + Number(v.discountTotal);
      return [
        String(idx + 1),
        v.voucherNumber,
        fmtDateSlt(v.voucherDate),
        v.supplier.name,
        `${v.payFromAccount.code} ${v.payFromAccount.name}`,
        fmtMoneyAlways(v.paymentTotal),
        fmtMoneyAlways(v.discountTotal),
        fmtMoneyAlways(total),
      ];
    });

    const totals = [
      { label: "Vouchers", value: String(vouchers.length) },
      {
        label: "Total Paid",
        value: fmtMoneyAlways(sumDecimals(vouchers.map((v) => v.paymentTotal))),
      },
      {
        label: "Total",
        value: fmtMoneyAlways(
          sumDecimals(vouchers.map((v) => Number(v.paymentTotal) + Number(v.discountTotal))),
        ),
        bold: true,
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Voucher No", "Date", "Supplier", "Cash A/C", "Allocated", "Discount", "Total"],
      align: ["center", "left", "left", "left", "left", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Supplier payment vouchers register generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT SUPPLIER-PAYMENT-VOUCHERS]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
