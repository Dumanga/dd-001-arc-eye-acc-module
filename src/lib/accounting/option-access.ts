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

// Edit + Recall (unapprove) actions are super-admin-only. Branch users can
// create / approve documents through the normal flow but cannot tamper with
// a document after the fact — that audit-trail privilege is reserved for
// super admins. Use this for PATCH and POST /unapprove endpoints.
export async function authorizeAccountingSuperAdmin(keys: AccountingAccessKey[]) {
  const auth = await authorizeAccountingAnyAccess(keys);
  if ("error" in auth) return auth;
  if (auth.currentUser.role !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        fail("Only Super Admin can perform this action.", "FORBIDDEN"),
        { status: 403 }
      ),
    };
  }
  return auth;
}
