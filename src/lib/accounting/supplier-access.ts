import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import { hasAccountingAccess, requireAccountingUser } from "@/lib/auth/accounting";

export async function authorizeAccountingSupplierAccess() {
  const currentUser = await requireAccountingUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }

  if (!hasAccountingAccess(currentUser, "suppliers")) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      }),
    };
  }

  return { currentUser };
}
