import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { hasAccountingAccess, requireAccountingUser } from "@/lib/auth/accounting";

const accountingAccessOptions = [
  "dashboard",
  "suppliers",
  "customers",
  "inventory",
  "accounts",
  "reports",
  "pos",
  "settings",
] as const;

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function sanitizeAccess<T extends readonly string[]>(value: unknown, allowed: T) {
  if (!Array.isArray(value)) {
    return [] as T[number][];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.toLowerCase().trim())
    .filter((entry): entry is T[number] =>
      (allowed as readonly string[]).includes(entry)
    );
}

function isValidProfileImageId(value: unknown) {
  return typeof value === "number" && value >= 1 && value <= 5;
}

async function authorizeUserAccess() {
  const currentUser = await requireAccountingUser();
  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }

  if (!hasAccountingAccess(currentUser, "settings") || currentUser.role !== "SUPER_ADMIN") {
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
    const auth = await authorizeUserAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const page = parseNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 10), 50);
    const search = (searchParams.get("search") ?? "").trim();

    const where: Prisma.AccountingUserWhereInput = search
      ? {
          OR: [
            {
              displayName: {
                contains: search,
              },
            },
            {
              username: {
                contains: search,
              },
            },
          ],
        }
      : {};

    const [items, total, superAdminCount, staffCount] = await Promise.all([
      prisma.accountingUser.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          profileImageId: true,
          createdAt: true,
          storeId: true,
          store: {
            select: {
              id: true,
              name: true,
            },
          },
          accessDashboard: true,
          accessSuppliers: true,
          accessCustomers: true,
          accessInventory: true,
          accessAccounts: true,
          accessReports: true,
          accessPos: true,
          accessSettings: true,
        },
      }),
      prisma.accountingUser.count({ where }),
      prisma.accountingUser.count({ where: { role: "SUPER_ADMIN" } }),
      prisma.accountingUser.count({
        where: { role: { in: ["CASHIER", "DATA_ENTRY", "SUPERVISOR"] } },
      }),
    ]);

    return NextResponse.json(
      ok(
        {
          items,
          total,
          superAdminCount,
          staffCount,
          page,
          pageSize,
        },
        "Users fetched."
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
    const auth = await authorizeUserAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      username?: unknown;
      displayName?: unknown;
      password?: unknown;
      role?: unknown;
      profileImageId?: unknown;
      access?: unknown;
      storeId?: unknown;
    };

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";

    if (!username || !displayName || !password) {
      return NextResponse.json(
        fail("Username, name, and password are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!isValidProfileImageId(body.profileImageId)) {
      return NextResponse.json(
        fail("Profile image must be selected.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        fail("Store assignment is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json(
        fail("Selected store is invalid.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const access = sanitizeAccess(body.access, accountingAccessOptions);

    if (!["CASHIER", "DATA_ENTRY", "SUPERVISOR"].includes(role)) {
      return NextResponse.json(
        fail("Role must be Cashier, Data Entry, or Supervisor.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (access.length === 0) {
      return NextResponse.json(
        fail("Select at least one access area.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (access.length === accountingAccessOptions.length) {
      return NextResponse.json(
        fail("All access cannot be selected. Use Super Admin instead.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const accountingRole = role as "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";
    const profileImageId = body.profileImageId as number;

    const created = await prisma.accountingUser.create({
      data: {
        username,
        displayName,
        passwordHash,
        role: accountingRole,
        profileImageId,
        storeId,
        accessDashboard: access.includes("dashboard"),
        accessSuppliers: access.includes("suppliers"),
        accessCustomers: access.includes("customers"),
        accessInventory: access.includes("inventory"),
        accessAccounts: access.includes("accounts"),
        accessReports: access.includes("reports"),
        accessPos: access.includes("pos"),
        accessSettings: access.includes("settings"),
      },
    });

    return NextResponse.json(ok({ id: created.id }, "User created."), {
      status: 201,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(fail("Username already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeUserAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      id?: unknown;
      username?: unknown;
      displayName?: unknown;
      password?: unknown;
      role?: unknown;
      profileImageId?: unknown;
      access?: unknown;
      storeId?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";

    if (!id) {
      return NextResponse.json(fail("User id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    if (!username || !displayName) {
      return NextResponse.json(
        fail("Username and name are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!isValidProfileImageId(body.profileImageId)) {
      return NextResponse.json(
        fail("Profile image must be selected.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        fail("Store assignment is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json(
        fail("Selected store is invalid.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const access = sanitizeAccess(body.access, accountingAccessOptions);

    if (!["CASHIER", "DATA_ENTRY", "SUPERVISOR"].includes(role)) {
      return NextResponse.json(
        fail("Role must be Cashier, Data Entry, or Supervisor.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (access.length === 0) {
      return NextResponse.json(
        fail("Select at least one access area.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    if (access.length === accountingAccessOptions.length) {
      return NextResponse.json(
        fail("All access cannot be selected. Use Super Admin instead.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const accountingRole = role as "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";
    const profileImageId = body.profileImageId as number;

    const updateData: Prisma.AccountingUserUpdateInput = {
      username,
      displayName,
      role: accountingRole,
      profileImageId,
      store: {
        connect: {
          id: storeId,
        },
      },
      accessDashboard: access.includes("dashboard"),
      accessSuppliers: access.includes("suppliers"),
      accessCustomers: access.includes("customers"),
      accessInventory: access.includes("inventory"),
      accessAccounts: access.includes("accounts"),
      accessReports: access.includes("reports"),
      accessPos: access.includes("pos"),
      accessSettings: access.includes("settings"),
    };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const existing = await prisma.accountingUser.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!existing) {
      return NextResponse.json(fail("User not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    if (existing.role === "SUPER_ADMIN") {
      return NextResponse.json(
        fail("Super Admin cannot be edited from this form.", "FORBIDDEN"),
        { status: 403 }
      );
    }

    await prisma.accountingUser.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(ok(null, "User updated."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(fail("Username already exists.", "DUPLICATE"), {
        status: 409,
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(fail("User not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authorizeUserAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(fail("User id is required.", "VALIDATION_ERROR"), {
        status: 400,
      });
    }

    const user = await prisma.accountingUser.findUnique({
      where: { id },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json(fail("User not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json(
        fail("Super Admin cannot be deleted.", "FORBIDDEN"),
        { status: 403 }
      );
    }

    await prisma.accountingUser.delete({
      where: { id },
    });

    return NextResponse.json(ok(null, "User deleted."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(fail("User not found.", "NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
