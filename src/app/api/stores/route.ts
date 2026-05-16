import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import {
  hasAccountingAccess,
  requireAccountingUser,
} from "@/lib/auth/accounting";

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeStatus(value: unknown): "ACTIVE" | "PAUSED" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "PAUSED") {
    return normalized;
  }
  return null;
}

async function authorizeStoresAccess() {
  const currentUser = await requireAccountingUser();
  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }
  if (!hasAccountingAccess(currentUser, "settings")) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      }),
    };
  }

  return { currentUser };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeStoresAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const page = parseNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 10), 50);
    const search = (searchParams.get("search") ?? "").trim();
    const status = normalizeStatus(searchParams.get("status"));

    const where: Prisma.StoreWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { city: { contains: search } },
      ];
    }
    if (status) {
      where.status = status;
    }

    const [items, total, activeCount] = await Promise.all([
      prisma.store.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.store.count({ where }),
      prisma.store.count({ where: { status: "ACTIVE" } }),
    ]);

    return NextResponse.json(
      ok(
        {
          items: items.map((store) => ({
            ...store,
            staffCount: 0,
          })),
          total,
          activeCount,
          totalStaff: 0,
          page,
          pageSize,
        },
        "Stores fetched."
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
    const auth = await authorizeStoresAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      name?: unknown;
      code?: unknown;
      city?: unknown;
      status?: unknown;
      notes?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const status = normalizeStatus(body.status) ?? "ACTIVE";
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        fail("Store name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        fail("Store code is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!city) {
      return NextResponse.json(
        fail("City is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Store name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (code.length > 10) {
      return NextResponse.json(
        fail("Store code must be 10 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (city.length > 60) {
      return NextResponse.json(
        fail("City must be 60 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (notes && notes.length > 300) {
      return NextResponse.json(
        fail("Notes must be 300 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const created = await prisma.store.create({
      data: {
        name,
        code,
        city,
        status,
        notes,
      },
    });

    return NextResponse.json(ok(created, "Store created."), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Store code already exists.", "DUPLICATE"),
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
    const auth = await authorizeStoresAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      code?: unknown;
      city?: unknown;
      status?: unknown;
      notes?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const status = normalizeStatus(body.status);
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    if (!id) {
      return NextResponse.json(
        fail("Store id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        fail("Store name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        fail("Store code is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!city) {
      return NextResponse.json(
        fail("City is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        fail("Status is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Store name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (code.length > 10) {
      return NextResponse.json(
        fail("Store code must be 10 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (city.length > 60) {
      return NextResponse.json(
        fail("City must be 60 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (notes && notes.length > 300) {
      return NextResponse.json(
        fail("Notes must be 300 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const updated = await prisma.store.update({
      where: { id },
      data: {
        name,
        code,
        city,
        status,
        notes,
      },
    });

    return NextResponse.json(ok(updated, "Store updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Store code already exists.", "DUPLICATE"),
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
        fail("Store not found.", "NOT_FOUND"),
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
    const auth = await authorizeStoresAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Store id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    await prisma.store.delete({
      where: { id },
    });

    return NextResponse.json(ok(null, "Store deleted."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(
        fail("Store not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
