// GET /api/accounting/reports/pos-sales-summary?dateRange=&storeId=&groupBy=
//
// Aggregated POS turnover. Groups COMPLETED bills by day, by tender
// method, or by cashier and surfaces bill count + per-method
// breakdown + grand total per group.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { getListStoreFilter } from "@/lib/accounting/store-scope";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import {
  fmtMoneyAlways,
  fmtDateSlt,
  parseDateRange,
  sumDecimals,
  type ReportPayload,
} from "@/lib/accounting/reports-shared";

type GroupBy = "DAY" | "METHOD" | "CASHIER";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const { from, to } = parseDateRange(url.searchParams.get("dateRange"));
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const groupByRaw = url.searchParams.get("groupBy")?.trim().toUpperCase() ?? "DAY";
    const groupBy: GroupBy = ["DAY", "METHOD", "CASHIER"].includes(groupByRaw)
      ? (groupByRaw as GroupBy)
      : "DAY";

    const scope = getListStoreFilter(
      currentUser,
      requestedStoreId === "ALL" ? "" : requestedStoreId,
    );
    if (!scope.ok) {
      return NextResponse.json(fail(scope.message, scope.code), {
        status: scope.status,
      });
    }

    const where: Prisma.AccountingPosBillWhereInput = {
      status: "COMPLETED",
      ...(scope.where.storeId ? { storeId: scope.where.storeId } : {}),
      ...(from || to
        ? {
            postedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const bills = await prisma.accountingPosBill.findMany({
      where,
      select: {
        postedAt: true,
        paymentMethod: true,
        total: true,
        cashier: { select: { displayName: true } },
      },
    });

    // Group helper
    type Bucket = {
      key: string;
      label: string;
      count: number;
      cash: number;
      card: number;
      mixed: number;
      split: number;
      total: number;
    };
    const buckets = new Map<string, Bucket>();

    function bucketKey(bill: (typeof bills)[number]): { key: string; label: string } {
      if (groupBy === "METHOD") {
        const m = bill.paymentMethod ?? "OTHER";
        return { key: m, label: m };
      }
      if (groupBy === "CASHIER") {
        return {
          key: bill.cashier.displayName,
          label: bill.cashier.displayName,
        };
      }
      // DAY — bucket by Asia/Colombo calendar day
      if (!bill.postedAt) return { key: "unknown", label: "—" };
      const sltDate = new Date(bill.postedAt.getTime());
      // toISOString gives UTC; for SL local-day grouping we use a
      // formatted string keyed on the en-CA locale (YYYY-MM-DD).
      const isoDate = sltDate.toLocaleDateString("en-CA", {
        timeZone: "Asia/Colombo",
      });
      return { key: isoDate, label: fmtDateSlt(sltDate) };
    }

    for (const b of bills) {
      const { key, label } = bucketKey(b);
      const existing =
        buckets.get(key) ??
        ({
          key,
          label,
          count: 0,
          cash: 0,
          card: 0,
          mixed: 0,
          split: 0,
          total: 0,
        } satisfies Bucket);
      existing.count += 1;
      const amt = Number(b.total);
      existing.total += amt;
      if (b.paymentMethod === "CASH") existing.cash += amt;
      else if (b.paymentMethod === "CARD") existing.card += amt;
      else if (b.paymentMethod === "MIXED") existing.mixed += amt;
      else if (b.paymentMethod === "SPLIT") existing.split += amt;
      buckets.set(key, existing);
    }

    const ordered = Array.from(buckets.values()).sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    );

    const rows: string[][] = ordered.map((b, idx) => [
      String(idx + 1),
      b.label,
      String(b.count),
      fmtMoneyAlways(b.cash),
      fmtMoneyAlways(b.card),
      fmtMoneyAlways(b.mixed),
      fmtMoneyAlways(b.split),
      fmtMoneyAlways(b.total),
    ]);

    const groupHeader = groupBy === "DAY" ? "Date" : groupBy === "METHOD" ? "Method" : "Cashier";

    const totals = [
      { label: "Bills", value: String(bills.length) },
      {
        label: "Total",
        value: fmtMoneyAlways(sumDecimals(bills.map((b) => b.total))),
        bold: true,
      },
    ];

    const payload: ReportPayload = {
      columns: ["#", groupHeader, "Bills", "Cash", "Card", "Mixed", "Split", "Total"],
      align: ["center", "left", "right", "right", "right", "right", "right", "right"],
      rows,
      totals,
    };

    return NextResponse.json(ok(payload, "POS sales summary generated."), {
      status: 200,
    });
  } catch (err) {
    console.error("[REPORT POS-SALES-SUMMARY]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
