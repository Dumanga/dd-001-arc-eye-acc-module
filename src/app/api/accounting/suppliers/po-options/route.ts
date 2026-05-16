import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export type PoSupplierTax = {
  code: string;
  name: string;
  rate: string;
  method: "PERCENTAGE" | "FIXED_AMOUNT";
};

export type PoSupplierOption = {
  id: string;
  code: string;
  name: string;
  contact: string;
  city: string;
  currency: string;
  taxes: PoSupplierTax[];
};

const PAGE_SIZE = 20;

function formatPhone(dialCode: string, localNumber: string): string {
  const dial = dialCode.trim();
  const local = localNumber.trim();
  if (!dial && !local) return "";
  if (!dial) return local;
  return `${dial} ${local}`;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["suppliers"]);
    if ("error" in auth) {
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? String(PAGE_SIZE))));

    const where = query
      ? {
          OR: [
            { code: { contains: query } },
            { name: { contains: query } },
          ],
        }
      : undefined;

    const suppliers = await prisma.accountingSupplier.findMany({
      where,
      orderBy: [{ code: "asc" }, { name: "asc" }],
      skip,
      take: take + 1,
      select: {
        id: true,
        code: true,
        name: true,
        primaryPhoneDialCode: true,
        primaryPhoneLocalNumber: true,
        contactInfo: {
          select: { city: true },
        },
        salesInfo: {
          select: { currencyCode: true },
        },
        taxCodes: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          select: {
            taxCode: {
              select: {
                code: true,
                name: true,
                rate: true,
                calculation: true,
                taxType: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    const hasMore = suppliers.length > take;
    const page = suppliers.slice(0, take);

    const items: PoSupplierOption[] = page.map((s) => {
      const taxes: PoSupplierTax[] = s.taxCodes
        .filter(
          (link) =>
            link.taxCode.isActive &&
            (link.taxCode.taxType === "PURCHASE" || link.taxCode.taxType === "BOTH")
        )
        .slice(0, 2)
        .map((link) => ({
          code: link.taxCode.code,
          name: link.taxCode.name,
          rate: Number(link.taxCode.rate).toString(),
          method: link.taxCode.calculation,
        }));

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        contact: formatPhone(s.primaryPhoneDialCode, s.primaryPhoneLocalNumber),
        city: s.contactInfo?.city ?? "",
        currency: s.salesInfo?.currencyCode ?? "LKR",
        taxes,
      };
    });

    return NextResponse.json(ok({ items, hasMore }, "PO supplier options fetched."), {
      status: 200,
    });
  } catch (err) {
    console.error("[GET /api/accounting/suppliers/po-options]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
