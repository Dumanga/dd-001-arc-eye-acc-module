import type { AccountingUser } from "@prisma/client";

// List-side branch scoping. Mirrors the create-side `resolveEffectiveStoreId`
// in store-resolution.ts but returns a Prisma where fragment instead of a
// concrete storeId, because list endpoints need to filter rather than write.
//
// Rules:
//   - Non-super-admin: locked to their assigned branch. Any `?storeId=`
//     query param is ignored (a branch user cannot peek into other branches).
//   - Super admin: defaults to "all branches" (no filter). When `?storeId=`
//     is supplied and resolves to an existing branch, the slice is applied.
//     A bogus `?storeId=` is treated as a 404, signalling the caller to
//     return an error response.
//
// Returns either a where fragment to spread into prisma.findMany or a
// rejection envelope the API can hand back to the client.

export type ListStoreScope =
  | { ok: true; where: { storeId?: string } }
  | { ok: false; status: number; message: string; code: string };

export function getListStoreFilter(
  user: Pick<AccountingUser, "role" | "storeId">,
  requestedStoreId: string | null | undefined
): ListStoreScope {
  if (user.role === "SUPER_ADMIN") {
    const requested = typeof requestedStoreId === "string" ? requestedStoreId.trim() : "";
    if (!requested) {
      return { ok: true, where: {} };
    }
    return { ok: true, where: { storeId: requested } };
  }

  if (!user.storeId) {
    return {
      ok: false,
      status: 403,
      message: "Your account is not assigned to a branch. Ask an admin to assign one.",
      code: "USER_NO_STORE",
    };
  }
  return { ok: true, where: { storeId: user.storeId } };
}

// Reusable Prisma include slice for "snapshot the branch on list rows".
// Spread this into any transactional doc's findMany include to surface a
// Branch column on the list endpoint. Consumers narrow the type via the
// findMany's own Include type — kept untyped here so it can be reused
// across all six doc-type Include shapes.
export const storeListInclude = {
  store: { select: { id: true, code: true, name: true } },
} as const;
