import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingAnyAccess } from "@/lib/accounting/option-access";
import { prisma } from "@/lib/db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAccountingAnyAccess(["customers"]);
    if ("error" in auth) return auth.error;
    const { currentUser } = auth;

    const { id } = await params;

    const quotation = await prisma.accountingQuotation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!quotation) {
      return NextResponse.json(fail("Quotation not found.", "NOT_FOUND"), { status: 404 });
    }
    if (quotation.status === "APPROVED") {
      return NextResponse.json(fail("Quotation is already approved.", "ALREADY_APPROVED"), { status: 409 });
    }
    if (quotation.status === "CANCELLED") {
      return NextResponse.json(fail("Cancelled quotations cannot be approved.", "INVALID_STATE"), { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const statusUpdate = await tx.accountingQuotation.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "APPROVED", approvedById: currentUser.id, approvedAt },
      });

      if (statusUpdate.count !== 1) {
        throw new Error("QT_APPROVAL_STATE_CHANGED");
      }

      const updated = await tx.accountingQuotation.findUniqueOrThrow({
        where: { id },
        select: { id: true, quotationNumber: true },
      });

      return { updated };
    });

    return NextResponse.json(
      ok(
        { id: result.updated.id, quotationNumber: result.updated.quotationNumber },
        "Quotation approved."
      ),
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "QT_APPROVAL_STATE_CHANGED") {
      return NextResponse.json(
        fail("Quotation approval state changed. Refresh and try again.", "INVALID_STATE"),
        { status: 409 }
      );
    }
    console.error("[QT APPROVE]", err);
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), { status: 500 });
  }
}
