import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { hasOperationAccess, requireOperationUser } from "@/lib/auth/operation";

function parseMonth(value: string | null) {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export async function GET(request: Request) {
  try {
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    const canViewCalendar =
      currentUser.role === "SUPER_ADMIN" ||
      hasOperationAccess(currentUser, "dashboard") ||
      hasOperationAccess(currentUser, "repairs");
    if (!canViewCalendar) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }
    if (currentUser.role !== "SUPER_ADMIN" && !currentUser.storeId) {
      return NextResponse.json(fail("Store assignment required.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const { searchParams } = new URL(request.url);
    const monthParam = parseMonth(searchParams.get("month"));
    if (!monthParam) {
      return NextResponse.json(
        fail("Month is required in YYYY-MM format.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const { year, month } = monthParam;
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const counts: Record<string, number> = {};
    const repairs = await prisma.repair.findMany({
      where: {
        ...(currentUser.role === "SUPER_ADMIN"
          ? {}
          : { storeId: currentUser.storeId as string }),
        estimatedDeliveryDate: {
          gte: start,
          lt: end,
        },
        status: {
          not: "DELIVERED",
        },
      },
      select: {
        estimatedDeliveryDate: true,
      },
    });

    for (const row of repairs) {
      const day = row.estimatedDeliveryDate.toISOString().slice(0, 10);
      counts[day] = (counts[day] ?? 0) + 1;
    }

    return NextResponse.json(
      ok(
        {
          month: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
          counts,
        },
        "Calendar counts fetched."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
