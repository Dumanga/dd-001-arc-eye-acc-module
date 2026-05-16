// GET /api/accounting/pos/bills/history?storeId=&q=&method=&skip=&take=
//
// Returns COMPLETED POS bills at the cashier's branch for the
// in-screen history panel. Used by the "History" button in the POS
// top header — cashier can search/filter, view a summary, or
// re-print the receipt if the original print failed.
//
// Filters:
//   • storeId — branch scoping (super admin must specify; branch
//     users locked to their assigned branch)
//   • q — free-text match against billNo or customer name
//   • method — exact match on paymentMethod (CASH / CARD / MIXED / SPLIT)
//   • skip / take — pagination (default take=20, max 50)

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";

export type PosBillHistoryItem = {
  id: string;
  billNo: string;
  postedAt: string;
  customerId: string;
  customerName: string;
  customerIsWalkIn: boolean;
  merchantClientId: string | null;
  merchantName: string | null;
  paymentMethod: "CASH" | "CARD" | "MIXED" | "SPLIT";
  total: string;
  itemCount: number;
};

export type PosBillHistoryResponse = {
  items: PosBillHistoryItem[];
  total: number;
};

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";
    const query = url.searchParams.get("q")?.trim() ?? "";
    const methodRaw = url.searchParams.get("method")?.trim().toUpperCase() ?? "";
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? String(PAGE_SIZE))));

    const resolution = await resolveEffectiveStoreId(currentUser, requestedStoreId);
    if (!resolution.ok) {
      return NextResponse.json(fail(resolution.message, resolution.code), {
        status: resolution.status,
      });
    }
    const storeId = resolution.storeId;

    const allowedMethods = ["CASH", "CARD", "MIXED", "SPLIT"] as const;
    const methodFilter = (allowedMethods as readonly string[]).includes(methodRaw)
      ? (methodRaw as "CASH" | "CARD" | "MIXED" | "SPLIT")
      : null;

    const where: Prisma.AccountingPosBillWhereInput = {
      storeId,
      status: "COMPLETED",
      ...(methodFilter ? { paymentMethod: methodFilter } : {}),
      ...(query
        ? {
            OR: [
              { billNo: { contains: query } },
              { customer: { name: { contains: query } } },
              { merchantClient: { name: { contains: query } } },
            ],
          }
        : {}),
    };

    const [bills, total] = await Promise.all([
      prisma.accountingPosBill.findMany({
        where,
        orderBy: { postedAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          billNo: true,
          postedAt: true,
          customerId: true,
          merchantClientId: true,
          paymentMethod: true,
          total: true,
          customer: { select: { name: true, isWalkIn: true } },
          merchantClient: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.accountingPosBill.count({ where }),
    ]);

    const items: PosBillHistoryItem[] = bills.map((b) => ({
      id: b.id,
      billNo: b.billNo,
      postedAt: b.postedAt?.toISOString() ?? "",
      customerId: b.customerId,
      customerName: b.customer.name,
      customerIsWalkIn: b.customer.isWalkIn,
      merchantClientId: b.merchantClientId,
      merchantName: b.merchantClient?.name ?? null,
      paymentMethod: (b.paymentMethod ?? "CASH") as "CASH" | "CARD" | "MIXED" | "SPLIT",
      total: Number(b.total).toFixed(2),
      itemCount: b._count.lines,
    }));

    return NextResponse.json(
      ok<PosBillHistoryResponse>({ items, total }, "POS bill history fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[POS BILL HISTORY]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
