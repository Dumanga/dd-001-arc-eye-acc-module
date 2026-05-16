import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import { hasAccountingAccess, requireAccountingUser } from "@/lib/auth/accounting";

// Write-side gate. Mutating settings (form-ids, remarks, branches, users)
// requires the `settings` access flag — effectively super-admin-only today.
export async function authorizeAccountingSettingsAccess() {
  const currentUser = await requireAccountingUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }

  if (!hasAccountingAccess(currentUser, "settings")) {
    return {
      error: NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      }),
    };
  }

  return { currentUser };
}

// Read-side gate for settings endpoints that surface configuration data the
// transactional create forms depend on — form-id sequences (`RC-2026-0001`)
// and document remarks (default notes/terms text). Any authenticated
// accounting user (branch user or super admin) needs to read these so their
// create forms can pre-fill correctly. Mutations stay locked to
// `authorizeAccountingSettingsAccess` (settings flag = super-admin).
export async function authorizeAccountingSettingsReadAccess() {
  const currentUser = await requireAccountingUser();

  if (!currentUser) {
    return {
      error: NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      }),
    };
  }

  return { currentUser };
}
