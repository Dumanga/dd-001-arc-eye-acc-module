import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { hasOperationAccess, requireOperationUser } from "@/lib/auth/operation";

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requireOperationUser();
    if (!currentUser) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(currentUser, "brands")) {
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
          name: {
            contains: search,
          },
        }
      : {};

    const [items, total, latestBrand] = await Promise.all([
      prisma.brand.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.brand.count({ where }),
      prisma.brand.findFirst({
        orderBy: { createdAt: "desc" },
        select: { name: true, createdAt: true },
      }),
    ]);

    return NextResponse.json(
      ok(
        {
          items,
          total,
          latestBrandName: latestBrand?.name ?? null,
          latestBrandCreatedAt: latestBrand?.createdAt ?? null,
          page,
          pageSize,
        },
        "Brands fetched."
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
    if (!hasOperationAccess(currentUser, "brands")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as { name?: unknown };

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        fail("Brand name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 60) {
      return NextResponse.json(
        fail("Brand name must be 60 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const created = await prisma.brand.create({
      data: { name },
    });

    return NextResponse.json(ok(created, "Brand created."), { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Brand name already exists.", "DUPLICATE"),
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
    if (!hasOperationAccess(currentUser, "brands")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as { id?: unknown; name?: unknown };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Brand id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        fail("Brand name is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (name.length > 60) {
      return NextResponse.json(
        fail("Brand name must be 60 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json(ok(updated, "Brand updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Brand name already exists.", "DUPLICATE"),
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
        fail("Brand not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
