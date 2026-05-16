import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { hasOperationAccess, requireOperationUser } from "@/lib/auth/operation";

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeCode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_-]/g, "");
}

export async function GET(request: Request) {
  try {
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(currentUser, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const { searchParams } = new URL(request.url);
    const page = parseNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 10), 50);
    const search = (searchParams.get("search") ?? "").trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search.toUpperCase() } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.repairType.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.repairType.count({ where }),
    ]);

    return NextResponse.json(
      ok(
        {
          items,
          total,
          page,
          pageSize,
        },
        "Repair types fetched."
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
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(currentUser, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as {
      name?: unknown;
      code?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = normalizeCode(body.code);

    if (!name) {
      return NextResponse.json(
        fail("Repair type name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        fail("Repair type code is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Repair type name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (code.length > 30) {
      return NextResponse.json(
        fail("Repair type code must be 30 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const created = await prisma.repairType.create({
      data: { name, code },
    });

    return NextResponse.json(ok(created, "Repair type created."), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Repair type code already exists.", "DUPLICATE"),
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
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(currentUser, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as {
      id?: unknown;
      name?: unknown;
      code?: unknown;
      isActive?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = normalizeCode(body.code);
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : undefined;

    if (!id) {
      return NextResponse.json(
        fail("Repair type id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        fail("Repair type name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        fail("Repair type code is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        fail("Repair type name must be 80 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (code.length > 30) {
      return NextResponse.json(
        fail("Repair type code must be 30 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const updated = await prisma.repairType.update({
      where: { id },
      data: {
        name,
        code,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
    });

    return NextResponse.json(ok(updated, "Repair type updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Repair type code already exists.", "DUPLICATE"),
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
        fail("Repair type not found.", "NOT_FOUND"),
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
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(currentUser, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Repair type id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    await prisma.repairType.delete({ where: { id } });

    return NextResponse.json(ok(null, "Repair type deleted."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(
        fail("Repair type not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
