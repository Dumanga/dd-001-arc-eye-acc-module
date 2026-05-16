import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import {
  hasAccountingAccess,
  requireAccountingUser,
  type AccountingAccessKey,
} from "@/lib/auth/accounting";

export async function authorizeAccountingAnyAccess(keys: AccountingAccessKey[]) {
  const currentUser = await requireAccountingUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }

  if (!keys.some((key) => hasAccountingAccess(currentUser, key))) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      }),
    };
  }

  return { currentUser };
}
