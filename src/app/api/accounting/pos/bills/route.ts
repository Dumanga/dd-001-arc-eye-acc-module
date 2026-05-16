// GET /api/accounting/pos/bills?storeId=<id>
//
// Returns the cashier's currently-active DRAFT bill (status=DRAFT,
// isHeld=false). Creates nothing — adding the first line via
// /api/accounting/pos/bills/lines is what spawns a new DRAFT row.
//
// Branch resolution mirrors the POS products endpoint (super admin
// must specify storeId; branch users locked to their assigned branch).

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";
import { findActiveDraft, serializeBill, sweepStaleActiveDrafts } from "@/lib/accounting/pos-bill";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAccountingAnyAccess(["pos"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId")?.trim() ?? "";

    const resolution = await resolveEffectiveStoreId(currentUser, requestedStoreId);
    if (!resolution.ok) {
      return NextResponse.json(fail(resolution.message, resolution.code), {
        status: resolution.status,
      });
    }
    const storeId = resolution.storeId;

    // Lazy auto-expiry sweep — pos-integration-flow.md § 8.5.
    await prisma.$transaction(async (tx) => {
      await sweepStaleActiveDrafts(tx);
    });

    const draft = await findActiveDraft(currentUser.id, storeId);
    return NextResponse.json(
      ok({ bill: draft ? serializeBill(draft) : null }, "POS bill loaded."),
      { status: 200 }
    );
  } catch (err) {
    console.error("[POS BILL GET]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
