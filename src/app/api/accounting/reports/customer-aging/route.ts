// GET /api/accounting/reports/customer-aging?asOfDate=&customerId=&minBucket=
//
// Customer aging report. For each customer with outstanding
// receivable, surfaces the outstanding bucketed by days-past-due:
//
//   Current  → today ≤ dueDate (not yet due)
//   1-30     → 1-30 days past due
//   31-60    → 31-60 days past due
//   61-90    → 61-90 days past due
//   Over 90  → 90+ days past due
//
// Outstanding per invoice = invoice.total minus approved-CPR
// allocations (receivingAmount + discount) minus approved
// customer-return totalNet against that invoice.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

type Bucket = "current" | "b1to30" | "b31to60" | "b61to90" | "over90";

function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "b1to30";
  if (daysPastDue <= 60) return "b31to60";
  if (daysPastDue <= 90) return "b61to90";
  return "over90";
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const asOfRaw = url.searchParams.get("asOfDate")?.trim() ?? "";
    const customerId = url.searchParams.get("customerId")?.trim() ?? "";
    const minBucket = url.searchParams.get("minBucket")?.trim().toUpperCase() ?? "ALL";

    // Default = "latest" (no upper bound). Explicit asOfDate parses
    // the YYYY-MM-DD picker value. Defaulting to "today" by server
    // clock is brittle across timezones — when the server is on UTC
    // but the user is on SLT, today-SLT might be tomorrow-UTC and
    // entries posted "today" by the user would be invisible.
    let asOf: Date | undefined;
    if (asOfRaw) {
      const parsed = new Date(asOfRaw + "T23:59:59.999Z");
      if (!Number.isNaN(parsed.getTime())) asOf = parsed;
    }

    const where: Prisma.AccountingInvoiceWhereInput = {
      status: "APPROVED",
      ...(asOf ? { invoiceDate: { lte: asOf } } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const invoices = await prisma.accountingInvoice.findMany({
      where,
      select: {
        id: true,
        invoiceDate: true,
        dueDate: true,
        total: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
        paymentAllocations: {
          where: { receipt: { status: "APPROVED" } },
          select: { receivingAmount: true, discount: true },
        },
        customerReturns: {
          where: { status: "APPROVED" },
          select: { totalNet: true },
        },
      },
    });

    // Aggregate by customer
    type CustomerRow = {
      id: string;
      name: string;
      buckets: Record<Bucket, number>;
      total: number;
    };
    const byCustomer = new Map<string, CustomerRow>();

    for (const inv of invoices) {
      const paid = inv.paymentAllocations.reduce(
        (s, a) => s + Number(a.receivingAmount) + Number(a.discount),
        0,
      );
      const returned = inv.customerReturns.reduce((s, r) => s + Number(r.totalNet), 0);
      const outstanding = Number(inv.total) - paid - returned;
      if (outstanding <= 0.005) continue;

      const dueMs = inv.dueDate.getTime();
      // Effective "now" for aging: explicit asOf if the user picked
      // one, otherwise the server's current time. The default-to-now
      // here is fine because aging is a point-in-time view; the
      // filter pass above already includes every invoice regardless
      // of date.
      const asOfMs = asOf ? asOf.getTime() : Date.now();
      const daysPastDue = Math.max(
        0,
        Math.floor((asOfMs - dueMs) / (24 * 60 * 60 * 1000)),
      );
      // If asOf < dueDate this is "Current"; else bucket by days past due.
      const bucket: Bucket = asOfMs < dueMs ? "current" : bucketFor(daysPastDue);

      const existing =
        byCustomer.get(inv.customerId) ??
        ({
          id: inv.customerId,
          name: inv.customer.name,
          buckets: { current: 0, b1to30: 0, b31to60: 0, b61to90: 0, over90: 0 },
          total: 0,
        } satisfies CustomerRow);
      existing.buckets[bucket] += outstanding;
      existing.total += outstanding;
      byCustomer.set(inv.customerId, existing);
    }

    // Min bucket filter — drop customers whose outstanding is all in
    // bins below the threshold.
    const filtered = Array.from(byCustomer.values()).filter((c) => {
      if (minBucket === "OVER_30") {
        return c.buckets.b1to30 + c.buckets.b31to60 + c.buckets.b61to90 + c.buckets.over90 > 0;
      }
      if (minBucket === "OVER_60") {
        return c.buckets.b31to60 + c.buckets.b61to90 + c.buckets.over90 > 0;
      }
      return true;
    });

    // Sort by total desc so the worst payers float to the top.
    filtered.sort((a, b) => b.total - a.total);

    const rows: string[][] = filtered.map((c, idx) => [
      String(idx + 1),
      c.name,
      c.buckets.current > 0 ? fmtMoneyAlways(c.buckets.current) : "—",
      c.buckets.b1to30 > 0 ? fmtMoneyAlways(c.buckets.b1to30) : "—",
      c.buckets.b31to60 > 0 ? fmtMoneyAlways(c.buckets.b31to60) : "—",
      c.buckets.b61to90 > 0 ? fmtMoneyAlways(c.buckets.b61to90) : "—",
      c.buckets.over90 > 0 ? fmtMoneyAlways(c.buckets.over90) : "—",
      fmtMoneyAlways(c.total),
    ]);

    const grandTotal = filtered.reduce((s, c) => s + c.total, 0);
    const totals = [
      { label: "Customers", value: String(filtered.length) },
      { label: "Total Outstanding", value: fmtMoneyAlways(grandTotal), bold: true },
    ];

    const payload: ReportPayload = {
      columns: ["#", "Customer", "Current", "1-30", "31-60", "61-90", "Over 90", "Total"],
      align: ["center", "left", "right", "right", "right", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "Customer aging report generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT CUSTOMER-AGING]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
