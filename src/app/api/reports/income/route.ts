import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import {
  hasOperationAccess,
  requireOperationUser,
} from "@/lib/auth/operation";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnlyRange(date: string) {
  const match = date.match(datePattern);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

export async function GET(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }

    if (!hasOperationAccess(user, "settings")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }
    if (user.role !== "SUPER_ADMIN" && !user.storeId) {
      return NextResponse.json(fail("Store assignment required.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const { searchParams } = new URL(request.url);
    const fromDate = (searchParams.get("from") ?? "").trim();
    const toDate = (searchParams.get("to") ?? "").trim();

    if (!fromDate || !toDate) {
      return NextResponse.json(
        fail("From date and To date are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const fromRange = parseDateOnlyRange(fromDate);
    const toRange = parseDateOnlyRange(toDate);
    if (!fromRange || !toRange) {
      return NextResponse.json(
        fail("Dates must be in YYYY-MM-DD format.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (fromRange.start.getTime() > toRange.start.getTime()) {
      return NextResponse.json(
        fail("From date cannot be later than To date.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const repairs = await prisma.repair.findMany({
      where: {
        ...(user.role === "SUPER_ADMIN" ? {} : { storeId: user.storeId as string }),
        createdAt: {
          gte: fromRange.start,
          lt: toRange.endExclusive,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        billNo: true,
        status: true,
        totalAmount: true,
        advanceAmount: true,
        store: {
          select: {
            name: true,
          },
        },
        client: {
          select: {
            name: true,
          },
        },
      },
    });

    const rows = repairs.map((repair) => {
      const receivedAmount =
        repair.status === "DELIVERED"
          ? repair.totalAmount
          : Math.min(repair.advanceAmount, repair.totalAmount);
      const balance = Math.max(0, repair.totalAmount - receivedAmount);
      return {
        id: repair.id,
        date: repair.createdAt.toISOString().slice(0, 10),
        billNo: repair.billNo,
        storeName: repair.store.name,
        clientName: repair.client.name,
        status: repair.status,
        totalAmount: repair.totalAmount,
        advanceAmount: repair.advanceAmount,
        receivedAmount,
        balance,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalAmount += row.totalAmount;
        acc.totalAdvance += row.advanceAmount;
        acc.totalReceived += row.receivedAmount;
        acc.totalBalance += row.balance;
        if (row.status === "DELIVERED") {
          acc.deliveredCount += 1;
        }
        return acc;
      },
      {
        totalAmount: 0,
        totalAdvance: 0,
        totalReceived: 0,
        totalBalance: 0,
        deliveredCount: 0,
      }
    );

    return NextResponse.json(
      ok(
        {
          fromDate,
          toDate,
          repairCount: rows.length,
          deliveredCount: totals.deliveredCount,
          rows,
          totals: {
            totalAmount: totals.totalAmount,
            totalAdvance: totals.totalAdvance,
            totalReceived: totals.totalReceived,
            totalBalance: totals.totalBalance,
          },
        },
        "Income report generated."
      ),
      { status: 200 }
    );
  } catch (error) {
    console.error("Income report GET error", error);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
