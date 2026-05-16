import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { hasAccountingAccess, requireAccountingUser } from "@/lib/auth/accounting";
import { prisma } from "@/lib/db";
import {
  ACCOUNTING_CLIENT_DEFAULT_CURRENCY,
  ACCOUNTING_CLIENT_PAGE_SIZE,
  type AccountingClientListPayload,
  normalizeCurrency,
  normalizeEmail,
  normalizeIsMerchant,
  normalizeMobile,
  normalizeOptionalText,
  normalizeText,
  normalizeTier,
  serializeAccountingClient,
} from "@/lib/accounting/clients";

async function authorize() {
  const currentUser = await requireAccountingUser();
  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), { status: 401 }),
    };
  }
  if (!hasAccountingAccess(currentUser, "customers")) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), { status: 403 }),
    };
  }
  return { currentUser };
}

function parsePositive(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

export async function GET(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = parsePositive(searchParams.get("page"), 1);
  const pageSize = Math.min(
    100,
    parsePositive(searchParams.get("pageSize"), ACCOUNTING_CLIENT_PAGE_SIZE)
  );
  const search = (searchParams.get("search") ?? "").trim();

  // Walk-in customer is a system row used by anonymous POS bills (per
  // accounting-theories.md § 7 Customer Treatment). It must never appear
  // in the customer-management list.
  const where: Prisma.AccountingClientWhereInput = {
    isWalkIn: false,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { mobile: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  try {
    const [items, total, goldCount, recentCount] = await Promise.all([
      prisma.accountingClient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.accountingClient.count({ where }),
      prisma.accountingClient.count({ where: { tier: "GOLD", isWalkIn: false } }),
      prisma.accountingClient.count({ where: { createdAt: { gte: monthStart }, isWalkIn: false } }),
    ]);

    const payload: AccountingClientListPayload = {
      items: items.map(serializeAccountingClient),
      total,
      goldCount,
      recentCount,
      page,
      pageSize,
    };

    return NextResponse.json(ok(payload));
  } catch (error) {
    console.error("[GET /api/accounting/clients]", error);
    return NextResponse.json(fail("Unable to load clients.", "INTERNAL_ERROR"), { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(fail("Invalid JSON body.", "BAD_REQUEST"), { status: 400 });
  }

  const name = normalizeText(body.name);
  if (!name) {
    return NextResponse.json(fail("Customer name is required.", "VALIDATION"), { status: 422 });
  }

  const mobile = normalizeMobile(body.mobile);
  if (!mobile) {
    return NextResponse.json(
      fail("Mobile must be 7-15 digits (numbers only).", "VALIDATION"),
      { status: 422 }
    );
  }

  const currency = normalizeCurrency(body.currency ?? ACCOUNTING_CLIENT_DEFAULT_CURRENCY);
  if (!currency) {
    return NextResponse.json(fail("Unsupported currency.", "VALIDATION"), { status: 422 });
  }

  const tier = normalizeTier(body.tier ?? "BRONZE");
  if (!tier) {
    return NextResponse.json(fail("Invalid loyalty tier.", "VALIDATION"), { status: 422 });
  }

  const emailResult = normalizeEmail(body.email);
  if (!emailResult.ok) {
    return NextResponse.json(fail("Invalid email address.", "VALIDATION"), { status: 422 });
  }

  const address = normalizeOptionalText(body.address);
  const isMerchant = normalizeIsMerchant(body.isMerchant);

  try {
    const created = await prisma.accountingClient.create({
      data: {
        name,
        mobile,
        email: emailResult.value,
        address,
        currency,
        tier,
        isMerchant,
        // isWalkIn is set only by the seed migration, never via the API.
        createdById: auth.currentUser.id,
      },
    });

    return NextResponse.json(ok(serializeAccountingClient(created), "Client created."));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        fail("A client with this mobile already exists.", "DUPLICATE_MOBILE"),
        { status: 409 }
      );
    }
    console.error("[POST /api/accounting/clients]", error);
    return NextResponse.json(fail("Unable to create client.", "INTERNAL_ERROR"), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(fail("Invalid JSON body.", "BAD_REQUEST"), { status: 400 });
  }

  const id = normalizeText(body.id);
  if (!id) {
    return NextResponse.json(fail("Client id is required.", "VALIDATION"), { status: 422 });
  }

  const name = normalizeText(body.name);
  if (!name) {
    return NextResponse.json(fail("Customer name is required.", "VALIDATION"), { status: 422 });
  }

  const mobile = normalizeMobile(body.mobile);
  if (!mobile) {
    return NextResponse.json(
      fail("Mobile must be 7-15 digits (numbers only).", "VALIDATION"),
      { status: 422 }
    );
  }

  const currency = normalizeCurrency(body.currency ?? ACCOUNTING_CLIENT_DEFAULT_CURRENCY);
  if (!currency) {
    return NextResponse.json(fail("Unsupported currency.", "VALIDATION"), { status: 422 });
  }

  const tier = normalizeTier(body.tier ?? "BRONZE");
  if (!tier) {
    return NextResponse.json(fail("Invalid loyalty tier.", "VALIDATION"), { status: 422 });
  }

  const emailResult = normalizeEmail(body.email);
  if (!emailResult.ok) {
    return NextResponse.json(fail("Invalid email address.", "VALIDATION"), { status: 422 });
  }

  const address = normalizeOptionalText(body.address);
  const isMerchant = normalizeIsMerchant(body.isMerchant);

  try {
    const existing = await prisma.accountingClient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(fail("Client not found.", "NOT_FOUND"), { status: 404 });
    }
    if (existing.isWalkIn) {
      // The walk-in row is a system row — never editable through the
      // customer-management UI.
      return NextResponse.json(
        fail("Walk-in customer cannot be edited.", "WALK_IN_LOCKED"),
        { status: 403 }
      );
    }

    const updated = await prisma.accountingClient.update({
      where: { id },
      data: { name, mobile, email: emailResult.value, address, currency, tier, isMerchant },
    });

    return NextResponse.json(ok(serializeAccountingClient(updated), "Client updated."));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        fail("A client with this mobile already exists.", "DUPLICATE_MOBILE"),
        { status: 409 }
      );
    }
    console.error("[PATCH /api/accounting/clients]", error);
    return NextResponse.json(fail("Unable to update client.", "INTERNAL_ERROR"), { status: 500 });
  }
}
