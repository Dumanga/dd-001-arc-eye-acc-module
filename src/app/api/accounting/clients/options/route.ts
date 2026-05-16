import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type ClientOption = {
  id: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
};

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? String(PAGE_SIZE))));
    // Caller opt-ins for the special POS classification rows. Default
    // behaviour: skip merchants (they belong only in the SPLIT picker)
    // and skip the walk-in row (system customer, not pickable in any
    // back-office form). The Customer Return flow sets includeMerchants=true
    // when filing a return against a SPLIT POS bill.
    const includeMerchants = searchParams.get("includeMerchants") === "true";
    const includeWalkIn = searchParams.get("includeWalkIn") === "true";
    // `merchantsOnly=true` is a convenience flag for the POS SPLIT
    // merchant picker — equivalent to "show me ONLY isMerchant=true
    // rows". Overrides includeMerchants/includeWalkIn.
    const merchantsOnly = searchParams.get("merchantsOnly") === "true";

    const queryClause = query
      ? {
          OR: [
            { name: { contains: query } },
            { mobile: { contains: query } },
            { email: { contains: query } },
          ],
        }
      : {};

    const where = merchantsOnly
      ? { isMerchant: true, isWalkIn: false, ...queryClause }
      : {
          ...(includeMerchants ? {} : { isMerchant: false }),
          ...(includeWalkIn ? {} : { isWalkIn: false }),
          ...queryClause,
        };

    const clients = await prisma.accountingClient.findMany({
      where,
      // Pin walk-in to the top when it's in the result set (only ever
      // happens when includeWalkIn=true — POS-bill-cash customer
      // returns). Boolean(true) sorts after Boolean(false) in MySQL,
      // so `desc` puts walk-in first. Falls back to alphabetical for
      // the rest.
      orderBy: [{ isWalkIn: "desc" }, { name: "asc" }],
      skip,
      take: take + 1,
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        address: true,
        currency: true,
      },
    });

    const hasMore = clients.length > take;
    const page = clients.slice(0, take);

    const items: ClientOption[] = page.map((c) => ({
      id: c.id,
      name: c.name,
      contact: c.mobile || c.email || "",
      city: c.address ?? "",
      currency: c.currency || "LKR",
    }));

    return NextResponse.json(ok({ items, hasMore }, "Client options fetched."), { status: 200 });
  } catch (err) {
    console.error("[GET /api/accounting/clients/options]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
