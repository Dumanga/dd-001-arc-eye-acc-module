// GET /api/accounting/pos/holds?storeId=<id>
//
// Returns the current cashier's held DRAFT bills (status=DRAFT,
// isHeld=true) at the resolved store. Per pos-integration-flow.md
// § 5.6 — held bills are scoped per-user (each cashier sees only
// their own holds).

import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { resolveEffectiveStoreId } from "@/lib/accounting/store-resolution";
import { prisma } from "@/lib/db";
import { sweepStaleActiveDrafts } from "@/lib/accounting/pos-bill";

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

    const holds = await prisma.accountingPosBill.findMany({
      where: {
        cashierId: currentUser.id,
        storeId,
        status: "DRAFT",
        isHeld: true,
      },
      orderBy: { heldAt: "desc" },
      select: {
        id: true,
        billNo: true,
        heldAt: true,
        heldNote: true,
        total: true,
        customer: { select: { name: true, isWalkIn: true } },
        _count: { select: { lines: true } },
      },
    });

    return NextResponse.json(
      ok(
        {
          items: holds.map((h) => ({
            id: h.id,
            billNo: h.billNo,
            heldAt: h.heldAt?.toISOString() ?? null,
            heldNote: h.heldNote,
            total: Number(h.total).toFixed(2),
            customerName: h.customer.name,
            customerIsWalkIn: h.customer.isWalkIn,
            lineCount: h._count.lines,
          })),
        },
        "Holds loaded."
      ),
      { status: 200 }
    );
  } catch (err) {
    console.error("[POS HOLDS LIST]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
