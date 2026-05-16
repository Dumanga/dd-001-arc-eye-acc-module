import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import { authorizeAccountingSettingsReadAccess } from "@/lib/accounting/settings-access";

export async function GET() {
  try {
    const auth = await authorizeAccountingSettingsReadAccess();
    if ("error" in auth) {
      return auth.error;
    }

    const store = await prisma.store.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, code: true, city: true, notes: true },
    });

    return NextResponse.json(ok(store, "Store info fetched."), { status: 200 });
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
