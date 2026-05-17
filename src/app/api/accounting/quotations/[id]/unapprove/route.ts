import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingSuperAdmin } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

// Recall (unapprove) a quotation. Super-admin only. Quotations don't post
// to the GL, so this is a pure status flip: APPROVED → DRAFT. After recall
// the user can edit the quotation (PATCH) and re-approve.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingSuperAdmin(["customers"]);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const quotation = await prisma.accountingQuotation.findUnique({
      where: { id },
      select: { id: true, status: true, quotationNumber: true },
    });
    if (!quotation) {
      return NextResponse.json(fail("Quotation not found.", "NOT_FOUND"), { status: 404 });
    }
    if (quotation.status !== "APPROVED") {
      return NextResponse.json(
        fail("Only APPROVED quotations can be recalled.", "INVALID_STATE"),
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const statusUpdate = await tx.accountingQuotation.updateMany({
        where: { id, status: "APPROVED" },
        data: {
          status: "DRAFT",
          approvedById: null,
          approvedAt: null,
        },
      });

      if (statusUpdate.count !== 1) {
        throw new Error("QT_RECALL_STATE_CHANGED");
      }

      return tx.accountingQuotation.findUniqueOrThrow({
        where: { id },
        select: { id: true, quotationNumber: true },
      });
    });

    return NextResponse.json(
      ok({ id: result.id, quotationNumber: result.quotationNumber }, "Quotation recalled to DRAFT."),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "QT_RECALL_STATE_CHANGED") {
      return NextResponse.json(
        fail("Quotation status changed. Refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }
    console.error("[QT RECALL]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
