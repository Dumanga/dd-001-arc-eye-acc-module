import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { hasAccountingAccess, requireAccountingUser } from "@/lib/auth/accounting";
import { hasOperationAccess, requireOperationUser } from "@/lib/auth/operation";
import { resolvePortal } from "@/lib/auth/session";

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeTier(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "BRONZE" || normalized === "SILVER" || normalized === "GOLD") {
    return normalized;
  }
  return null;
}

function normalizeMobile(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (!/^947\d{8}$/.test(digits)) {
    return null;
  }
  return digits;
}

async function authorizeClientsAccess(request: Request) {
  const portal = resolvePortal(request);

  if (portal === "ACCOUNTING") {
    const currentUser = await requireAccountingUser();
    if (!currentUser) {
      return {
        error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
          status: 401,
        }),
      };
    }
    if (!hasAccountingAccess(currentUser, "customers")) {
      return {
        error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
          status: 403,
        }),
      };
    }

    return { currentUser, portal };
  }

  const currentUser = await requireOperationUser();
  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }
  if (!hasOperationAccess(currentUser, "clients")) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      }),
    };
  }

  return { currentUser, portal };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeClientsAccess(request);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const page = parseNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 10), 50);
    const search = (searchParams.get("search") ?? "").trim();

    const isNumericSearch = /^\d+$/.test(search);
    const normalizedSearch = isNumericSearch ? search.replace(/\D/g, "") : search;
    const mobileSearch =
      isNumericSearch && normalizedSearch.startsWith("0")
        ? `94${normalizedSearch.slice(1)}`
        : normalizedSearch;

    const where = search
      ? isNumericSearch
        ? {
            mobile: {
              startsWith: mobileSearch,
            },
          }
        : {
            name: {
              contains: search,
            },
          }
      : {};

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [items, total, goldCount, recentCount] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.client.count({ where }),
      prisma.client.count({ where: { tier: "GOLD" } }),
      prisma.client.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return NextResponse.json(
      ok(
        {
          items,
          total,
          goldCount,
          recentCount,
          page,
          pageSize,
        },
        "Clients fetched."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeClientsAccess(request);
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      name?: unknown;
      mobile?: unknown;
      tier?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizeMobile(body.mobile) ?? "";
    const tier = normalizeTier(body.tier) ?? "BRONZE";

    if (!name) {
      return NextResponse.json(
        fail("Customer name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Customer name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!mobile) {
      return NextResponse.json(
        fail("Mobile number must be in 947XXXXXXXX format.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const created = await prisma.client.create({
      data: {
        name,
        mobile,
        tier,
      },
    });

    return NextResponse.json(ok(created, "Customer created."), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Mobile number already exists.", "DUPLICATE"),
        { status: 409 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeClientsAccess(request);
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      mobile?: unknown;
      tier?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizeMobile(body.mobile) ?? "";
    const tier = normalizeTier(body.tier);

    if (!id) {
      return NextResponse.json(
        fail("Customer id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        fail("Customer name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!mobile) {
      return NextResponse.json(
        fail("Mobile number must be in 947XXXXXXXX format.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!tier) {
      return NextResponse.json(
        fail("Loyalty tier is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Customer name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        name,
        mobile,
        tier,
      },
    });

    return NextResponse.json(ok(updated, "Customer updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Mobile number already exists.", "DUPLICATE"),
        { status: 409 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(
        fail("Customer not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authorizeClientsAccess(request);
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Customer id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    await prisma.client.delete({
      where: { id },
    });

    return NextResponse.json(ok(null, "Customer deleted."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(
        fail("Customer not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
