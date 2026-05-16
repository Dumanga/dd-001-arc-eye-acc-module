import type { AccountingUser } from "@prisma/client";
import { prisma } from "@/lib/db";

// Resolves the effective storeId (branch) for a transactional create call.
//   - Non-super-admin: must have AccountingUser.storeId set (the user's home
//     branch). bodyStoreId is ignored — branch users cannot create on behalf
//     of another branch.
//   - Super admin: AccountingUser.storeId is null by design. They MUST pass
//     bodyStoreId explicitly (Phase 5 surfaces this as the "Create on behalf
//     of [branch]" picker). The chosen store must exist and be ACTIVE.
//
// All transactional create-APIs (PO, GRN, GR, PV, QT, INV) resolve through
// this helper so the rejection messages and shape are consistent.
export type StoreResolution =
  | { ok: true; storeId: string }
  | { ok: false; status: number; message: string; code: string };

export async function resolveEffectiveStoreId(
  user: AccountingUser,
  bodyStoreId: string | null | undefined
): Promise<StoreResolution> {
  if (user.role === "SUPER_ADMIN") {
    const requested = typeof bodyStoreId === "string" ? bodyStoreId.trim() : "";
    if (!requested) {
      return {
        ok: false,
        status: 422,
        message: "Branch is required for this document — pick one.",
        code: "STORE_REQUIRED",
      };
    }
    const store = await prisma.store.findUnique({
      where: { id: requested },
      select: { id: true, status: true },
    });
    if (!store) {
      return {
        ok: false,
        status: 404,
        message: "Selected branch was not found.",
        code: "STORE_NOT_FOUND",
      };
    }
    if (store.status !== "ACTIVE") {
      return {
        ok: false,
        status: 422,
        message: "Selected branch is not active.",
        code: "STORE_INACTIVE",
      };
    }
    return { ok: true, storeId: store.id };
  }

  if (!user.storeId) {
    return {
      ok: false,
      status: 403,
      message: "Your account is not assigned to a branch. Ask an admin to assign one.",
      code: "USER_NO_STORE",
    };
  }
  return { ok: true, storeId: user.storeId };
}
