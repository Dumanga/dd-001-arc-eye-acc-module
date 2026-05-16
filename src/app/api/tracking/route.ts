import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";

function normalizeToken(value: string | null) {
  if (!value) {
    return "";
  }
  return value.trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = normalizeToken(
      searchParams.get("trackingcode") ?? searchParams.get("token")
    );

    if (!token) {
      return NextResponse.json(
        fail("Invalid tracking id.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const repair = await prisma.repair.findFirst({
      where: { trackingTokenHash: tokenHash },
      include: {
        client: true,
        brand: true,
        store: true,
        items: {
          include: {
            repairType: true,
          },
        },
      },
    });

    if (!repair) {
      return NextResponse.json(
        fail("You do not have access or invalid tracking id.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    if (repair.status === "DELIVERED") {
      return NextResponse.json(
        fail("Tracking is not available for delivered repairs.", "DISABLED"),
        { status: 403 }
      );
    }

    return NextResponse.json(
      ok(
        {
          id: repair.id,
          billNo: repair.billNo,
          status: repair.status,
          intakeType: repair.intakeType,
          estimatedDeliveryDate: repair.estimatedDeliveryDate,
          totalAmount: repair.totalAmount,
          advanceAmount: repair.advanceAmount,
          description: repair.description,
          client: {
            name: repair.client.name,
            mobile: repair.client.mobile,
          },
          brand: {
            name: repair.brand.name,
          },
          store: {
            name: repair.store.name,
          },
          items: repair.items.map((item) => ({
            id: item.id,
            price: item.price,
            repairType: {
              id: item.repairType.id,
              name: item.repairType.name,
              code: item.repairType.code,
            },
          })),
        },
        "Tracking details fetched."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      fail("Unable to fetch tracking details right now.", "SERVER_ERROR"),
      { status: 500 }
    );
  }
}
