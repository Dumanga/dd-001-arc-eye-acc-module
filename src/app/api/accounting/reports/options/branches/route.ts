// GET /api/accounting/reports/options/branches
//
// Returns the list of branches the current user can choose from for
// the reports filter. Branch users see only their own assigned
// branch (so the picker effectively has one option). Super admins
// see every ACTIVE store.
//
// The reports hub always also offers an "ALL" option client-side;
// this endpoint returns only the real stores.

import { NextResponse } from "next/server";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export type ReportBranchOption = {
  id: string;
  code: string;
  name: string;
};

export async function GET() {
  try {
    const auth = await authorizeAccountingAnyAccess(["reports"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    let stores: Array<{ id: string; code: string; name: string }>;
    if (currentUser.role === "SUPER_ADMIN") {
      stores = await prisma.store.findMany({
        where: { status: "ACTIVE" },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      });
    } else if (currentUser.storeId) {
      stores = await prisma.store.findMany({
        where: { id: currentUser.storeId },
        select: { id: true, code: true, name: true },
      });
    } else {
      stores = [];
    }

    const items: ReportBranchOption[] = stores;
    return NextResponse.json(
      ok({ items, isSuperAdmin: currentUser.role === "SUPER_ADMIN" }, "Branches fetched."),
      { status: 200 },
    );
  } catch (err) {
    console.error("[REPORT OPTIONS BRANCHES]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
