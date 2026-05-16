import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import {
  canAccessStore,
  hasOperationAccess,
  requireOperationUser,
} from "@/lib/auth/operation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  buildRepairCreatedMessage,
  buildRepairRescheduledMessage,
  buildRepairStatusMessage,
  buildRepairUpdatedMessage,
  buildTrackingUrl,
} from "@/lib/sms/messages";
import { sendTextLkSms } from "@/lib/sms/textlk";

const statusOrder = [
  "PENDING",
  "PROCESSING",
  "REPAIR_COMPLETED",
  "DELIVERED",
] as const;

const intakeTypeMap = {
  "Walk-in": "WALK_IN",
  "Courier": "COURIER",
} as const;

type RepairStatus = (typeof statusOrder)[number];

const MAX_AUDIT_VALUE_LENGTH = 240;

function parseNumber(value: string | null, fallback: number) {
  const num = value ? Number(value) : fallback;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function generateTrackingToken() {
  const raw = crypto.randomBytes(6).toString("hex");
  return raw.slice(0, 10);
}

function normalizeStatus(value: unknown): RepairStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if ((statusOrder as readonly string[]).includes(normalized)) {
    return normalized as RepairStatus;
  }
  return null;
}

function extractTrackingTokenFromSmsMessage(message: string | null | undefined) {
  if (!message) {
    return null;
  }
  const explicitToken = message.match(/Tracking token:\s*([A-Za-z0-9]+)/i);
  if (explicitToken?.[1]) {
    return explicitToken[1];
  }
  const shortUrlToken = message.match(/\/t\/([A-Za-z0-9]+)/i);
  if (shortUrlToken?.[1]) {
    return shortUrlToken[1];
  }
  const queryToken = message.match(/[?&]token=([A-Za-z0-9]+)/i);
  if (queryToken?.[1]) {
    return queryToken[1];
  }
  const legacyQueryToken = message.match(/[?&]trackingcode=([A-Za-z0-9]+)/i);
  return legacyQueryToken?.[1] ?? null;
}

function getBaseUrlForTracking(request: Request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured;
  }
  return new URL(request.url).origin;
}

function toAuditValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= MAX_AUDIT_VALUE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_AUDIT_VALUE_LENGTH - 3)}...`;
}

function buildItemsAuditSummary(items: Array<{ repairTypeId: string; price: number }>) {
  const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
  const uniqueTypeCount = new Set(items.map((item) => item.repairTypeId)).size;
  return toAuditValue(
    `Items updated: ${items.length} lines, ${uniqueTypeCount} types, total ${totalAmount}.`
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(user, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const { searchParams } = new URL(request.url);
    const page = parseNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 10), 50);
    const search = (searchParams.get("search") ?? "").trim();
    const status = normalizeStatus(searchParams.get("status"));
    const storeId = (searchParams.get("storeId") ?? "").trim();
    const excludeDelivered = searchParams.get("excludeDelivered") === "1";

    const where: Prisma.RepairWhereInput = {};
    if (search) {
      where.OR = [
        {
          billNo: {
            contains: search,
          },
        },
        {
          client: {
            name: {
              contains: search,
            },
          },
        },
        {
          client: {
            mobile: {
              contains: search,
            },
          },
        },
        {
          brand: {
            name: {
              contains: search,
            },
          },
        },
      ];
    }
    if (status) {
      where.status = status;
    } else if (excludeDelivered) {
      where.status = { not: "DELIVERED" };
    }
    if (storeId) {
      if (!canAccessStore(user, storeId)) {
        return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
          status: 403,
        });
      }
      where.storeId = storeId;
    } else if (user.role !== "SUPER_ADMIN") {
      if (!user.storeId) {
        return NextResponse.json(fail("Store assignment required.", "FORBIDDEN"), {
          status: 403,
        });
      }
      where.storeId = user.storeId;
    }

    const [items, total] = await Promise.all([
      prisma.repair.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: true,
          brand: true,
          store: true,
          items: { include: { repairType: true } },
          smsOutbox: {
            where: { type: "REPAIR_CREATED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { message: true },
          },
        },
      }),
      prisma.repair.count({ where }),
    ]);

    const shapedItems = items.map((item) => {
      const trackingToken = extractTrackingTokenFromSmsMessage(
        item.smsOutbox[0]?.message
      );
      return {
        ...item,
        trackingToken,
        smsOutbox: undefined,
      };
    });

    return NextResponse.json(
      ok(
        {
          items: shapedItems,
          total,
          page,
          pageSize,
        },
        "Repairs fetched."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(user, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const smsRateLimit = checkRateLimit(request, {
      keyPrefix: "sms-repair-create",
      windowMs: 10 * 60 * 1000,
      maxRequests: 30,
    });
    if (!smsRateLimit.allowed) {
      return NextResponse.json(
        fail("Too many SMS requests. Try again later.", "RATE_LIMITED"),
        {
          status: 429,
          headers: {
            "Retry-After": String(smsRateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as {
      clientId?: unknown;
      brandId?: unknown;
      intakeType?: unknown;
      storeId?: unknown;
      physicalBillNo?: unknown;
      totalAmount?: unknown;
      advanceAmount?: unknown;
      estimatedDeliveryDate?: unknown;
      description?: unknown;
      items?: unknown;
      repairTypeId?: unknown;
    };

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    const intakeRaw = typeof body.intakeType === "string" ? body.intakeType.trim() : "";
    const intakeType = intakeTypeMap[intakeRaw as keyof typeof intakeTypeMap];
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const physicalBillNoRaw =
      typeof body.physicalBillNo === "string" ? body.physicalBillNo.trim() : "";
    const physicalBillNo = physicalBillNoRaw || null;
    const advanceAmount =
      typeof body.advanceAmount === "number" ? body.advanceAmount : 0;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const estimatedDeliveryDate =
      typeof body.estimatedDeliveryDate === "string"
        ? body.estimatedDeliveryDate.trim()
        : "";
    const rawItems = Array.isArray(body.items) ? body.items : null;
    const primaryRepairTypeId =
      typeof body.repairTypeId === "string" ? body.repairTypeId.trim() : "";

    if (!clientId || !brandId || !storeId || !intakeType) {
      return NextResponse.json(
        fail("Client, brand, store, and intake type are required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    if (!canAccessStore(user, storeId)) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }
    if (
      !Number.isFinite(advanceAmount) ||
      advanceAmount < 0
    ) {
      return NextResponse.json(
        fail("Advance amount must be zero or more.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    if (!estimatedDeliveryDate) {
      return NextResponse.json(
        fail("Estimated delivery date is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json(
        fail("At least one repair item is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const parsedItems = rawItems
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const repairTypeId =
          typeof record.repairTypeId === "string" ? record.repairTypeId.trim() : "";
        const price =
          typeof record.price === "number"
            ? record.price
            : typeof record.price === "string"
              ? Number(record.price)
              : NaN;
        if (!repairTypeId || !Number.isFinite(price) || price < 0) {
          return null;
        }
        return { repairTypeId, price: Math.round(price) };
      })
      .filter((item): item is { repairTypeId: string; price: number } => Boolean(item));

    if (parsedItems.length === 0) {
      return NextResponse.json(
        fail("Each repair item must include type and price.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const totalAmount = parsedItems.reduce((sum, item) => sum + item.price, 0);
    if (advanceAmount > totalAmount) {
      return NextResponse.json(
        fail("Advance amount cannot exceed total amount.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    if (physicalBillNo && physicalBillNo.length > 50) {
      return NextResponse.json(
        fail("Physical bill no must be 50 characters or fewer.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const dateMatch = estimatedDeliveryDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return NextResponse.json(
        fail("Estimated delivery date must be YYYY-MM-DD.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    const dateOnly = new Date(
      Date.UTC(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3])
      )
    );

    const [client, brand, store, repairTypes] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.brand.findUnique({ where: { id: brandId } }),
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.repairType.findMany({
        where: { id: { in: parsedItems.map((item) => item.repairTypeId) } },
        select: { id: true },
      }),
    ]);

    if (!client || !brand || !store) {
      return NextResponse.json(
        fail("Client, brand, or store is invalid.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }
    const validTypeIds = new Set(repairTypes.map((type) => type.id));
    if (parsedItems.some((item) => !validTypeIds.has(item.repairTypeId))) {
      return NextResponse.json(
        fail("Selected repair type is invalid.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const trackingToken = generateTrackingToken();
    const trackingTokenHash = crypto
      .createHash("sha256")
      .update(trackingToken)
      .digest("hex");
    const trackingUrl = buildTrackingUrl(
      getBaseUrlForTracking(request),
      trackingToken
    );

    const created = await prisma.$transaction(async (tx) => {
      const sequence = await tx.repairBillSequence.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, nextNumber: 1 },
      });
      const billNo = `RB${sequence.nextNumber}`;
      await tx.repairBillSequence.update({
        where: { id: 1 },
        data: { nextNumber: { increment: 1 } },
      });

      const repair = await tx.repair.create({
        data: {
          billNo,
          physicalBillNo,
          clientId,
          brandId,
          intakeType,
          storeId,
          repairTypeId: primaryRepairTypeId || parsedItems[0]?.repairTypeId,
          totalAmount,
          advanceAmount,
          estimatedDeliveryDate: dateOnly,
          description,
          trackingTokenHash,
          createdById: user.id,
        },
      });
      const smsMessage = buildRepairCreatedMessage({
        billNo,
        trackingUrl,
      });
      await tx.repairItem.createMany({
        data: parsedItems.map((item) => ({
          repairId: repair.id,
          repairTypeId: item.repairTypeId,
          price: item.price,
        })),
      });

      const smsOutbox = await tx.smsOutbox.create({
        data: {
          repairId: repair.id,
          recipient: client.mobile,
          message: smsMessage,
          type: "REPAIR_CREATED",
          status: "PENDING",
          scheduledFor: new Date(),
        },
      });

      await tx.repairAudit.create({
        data: {
          repairId: repair.id,
          eventType: "REPAIR_CREATED",
          oldValue: null,
          newValue: toAuditValue(
            `Repair created with status ${repair.status} and estimated date ${repair.estimatedDeliveryDate.toISOString().slice(0, 10)}.`
          ),
          performedById: user.id,
        },
      });

      return {
        repair,
        smsOutboxId: smsOutbox.id,
        smsRecipient: client.mobile,
        smsMessage,
      };
    });

    const smsSendResult = await sendTextLkSms({
      phoneNumber: created.smsRecipient,
      message: created.smsMessage,
    });

    if (smsSendResult.success) {
      await prisma.$transaction([
        prisma.smsOutbox.update({
          where: { id: created.smsOutboxId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerResponse: smsSendResult.providerResponse,
          },
        }),
        prisma.repairAudit.create({
          data: {
            repairId: created.repair.id,
            eventType: "SMS_SENT",
            oldValue: null,
            newValue: toAuditValue(smsSendResult.providerResponse),
            performedById: user.id,
          },
        }),
      ]);

      return NextResponse.json(
        ok(
          { ...created.repair, smsStatus: "SENT" },
          "Repair created and SMS sent."
        ),
        { status: 201 }
      );
    }

    await prisma.$transaction([
      prisma.smsOutbox.update({
        where: { id: created.smsOutboxId },
        data: {
          status: "FAILED",
          providerResponse: smsSendResult.providerResponse,
        },
      }),
      prisma.repairAudit.create({
        data: {
          repairId: created.repair.id,
          eventType: "SMS_FAILED",
          oldValue: null,
          newValue: toAuditValue(
            smsSendResult.errorMessage ?? smsSendResult.providerResponse
          ),
          performedById: user.id,
        },
      }),
    ]);

    return NextResponse.json(
      ok(
        { ...created.repair, smsStatus: "FAILED" },
        "Repair created, but SMS sending failed."
      ),
      { status: 201 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2002"
    ) {
      return NextResponse.json(
        fail("Bill number already exists.", "DUPLICATE"),
        { status: 409 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(user, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const smsRateLimit = checkRateLimit(request, {
      keyPrefix: "sms-repair-update",
      windowMs: 10 * 60 * 1000,
      maxRequests: 40,
    });
    if (!smsRateLimit.allowed) {
      return NextResponse.json(
        fail("Too many SMS requests. Try again later.", "RATE_LIMITED"),
        {
          status: 429,
          headers: {
            "Retry-After": String(smsRateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as {
      id?: unknown;
      brandId?: unknown;
      intakeType?: unknown;
      storeId?: unknown;
      physicalBillNo?: unknown;
      totalAmount?: unknown;
      advanceAmount?: unknown;
      description?: unknown;
      status?: unknown;
      estimatedDeliveryDate?: unknown;
      isPostponed?: unknown;
      items?: unknown;
      repairTypeId?: unknown;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    const intakeRaw = typeof body.intakeType === "string" ? body.intakeType.trim() : "";
    const intakeType = intakeTypeMap[intakeRaw as keyof typeof intakeTypeMap];
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const hasPhysicalBillNoField = Object.prototype.hasOwnProperty.call(
      body,
      "physicalBillNo"
    );
    const hasAdvanceAmountField = Object.prototype.hasOwnProperty.call(
      body,
      "advanceAmount"
    );
    const physicalBillNoRaw =
      typeof body.physicalBillNo === "string" ? body.physicalBillNo.trim() : "";
    const physicalBillNo = physicalBillNoRaw || null;
    const advanceAmount =
      hasAdvanceAmountField && typeof body.advanceAmount === "number"
        ? body.advanceAmount
        : null;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const nextStatus = normalizeStatus(body.status);
    const isPostponed = typeof body.isPostponed === "boolean" ? body.isPostponed : null;
    const estimatedDeliveryDate =
      typeof body.estimatedDeliveryDate === "string"
        ? body.estimatedDeliveryDate.trim()
        : "";
    const rawItems = Array.isArray(body.items) ? body.items : null;
    const primaryRepairTypeId =
      typeof body.repairTypeId === "string" ? body.repairTypeId.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Repair id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const repair = await prisma.repair.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!repair) {
      return NextResponse.json(fail("Repair not found.", "NOT_FOUND"), {
        status: 404,
      });
    }
    if (!canAccessStore(user, repair.storeId)) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const updateData: Record<string, unknown> = {};
    const audits: Array<{ eventType: string; oldValue: string | null; newValue: string | null }> = [];

    if (brandId && brandId !== repair.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return NextResponse.json(
          fail("Selected brand is invalid.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
      updateData.brandId = brandId;
      audits.push({
        eventType: "BRAND_CHANGED",
        oldValue: repair.brandId,
        newValue: brandId,
      });
    }

    if (storeId && storeId !== repair.storeId) {
      if (!canAccessStore(user, storeId)) {
        return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
          status: 403,
        });
      }
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return NextResponse.json(
          fail("Selected store is invalid.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
      updateData.storeId = storeId;
      audits.push({
        eventType: "STORE_CHANGED",
        oldValue: repair.storeId,
        newValue: storeId,
      });
    }

    if (intakeType && intakeType !== repair.intakeType) {
      updateData.intakeType = intakeType;
      audits.push({
        eventType: "INTAKE_CHANGED",
        oldValue: repair.intakeType,
        newValue: intakeType,
      });
    }

    if (hasAdvanceAmountField) {
      if (
        advanceAmount === null ||
        !Number.isFinite(advanceAmount) ||
        advanceAmount < 0
      ) {
        return NextResponse.json(
          fail("Advance amount must be zero or more.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
    }

    if (description !== null && description !== repair.description) {
      updateData.description = description;
      audits.push({
        eventType: "DESCRIPTION_UPDATED",
        oldValue: repair.description ?? "",
        newValue: description,
      });
    }

    if (hasPhysicalBillNoField) {
      if (physicalBillNo && physicalBillNo.length > 50) {
        return NextResponse.json(
          fail("Physical bill no must be 50 characters or fewer.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
      if ((repair.physicalBillNo ?? null) !== physicalBillNo) {
        updateData.physicalBillNo = physicalBillNo;
        audits.push({
          eventType: "PHYSICAL_BILL_NO_UPDATED",
          oldValue: repair.physicalBillNo ?? "",
          newValue: physicalBillNo ?? "",
        });
      }
    }

    let parsedItems: Array<{ repairTypeId: string; price: number }> | null = null;
    if (rawItems) {
      parsedItems = rawItems
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const record = item as Record<string, unknown>;
          const repairTypeId =
            typeof record.repairTypeId === "string"
              ? record.repairTypeId.trim()
              : "";
          const price =
            typeof record.price === "number"
              ? record.price
              : typeof record.price === "string"
                ? Number(record.price)
                : NaN;
          if (!repairTypeId || !Number.isFinite(price) || price < 0) {
            return null;
          }
          return { repairTypeId, price: Math.round(price) };
        })
        .filter(
          (item): item is { repairTypeId: string; price: number } => Boolean(item)
        );

      if (parsedItems.length === 0) {
        return NextResponse.json(
          fail("Each repair item must include type and price.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }

      const typeIds = parsedItems.map((item) => item.repairTypeId);
      const repairTypes = await prisma.repairType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true },
      });
      const validTypeIds = new Set(repairTypes.map((type) => type.id));
      if (parsedItems.some((item) => !validTypeIds.has(item.repairTypeId))) {
        return NextResponse.json(
          fail("Selected repair type is invalid.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }

      const totalAmount = parsedItems.reduce((sum, item) => sum + item.price, 0);
      const effectiveAdvanceAmount = advanceAmount ?? repair.advanceAmount;
      if (effectiveAdvanceAmount > totalAmount) {
        return NextResponse.json(
          fail("Advance amount cannot exceed total amount.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }

      if (totalAmount !== repair.totalAmount) {
        updateData.totalAmount = totalAmount;
        audits.push({
          eventType: "TOTAL_UPDATED",
          oldValue: String(repair.totalAmount),
          newValue: String(totalAmount),
        });
      }
      if (hasAdvanceAmountField && advanceAmount !== repair.advanceAmount) {
        updateData.advanceAmount = advanceAmount;
        audits.push({
          eventType: "ADVANCE_UPDATED",
          oldValue: String(repair.advanceAmount),
          newValue: String(advanceAmount),
        });
      }
      if (primaryRepairTypeId) {
        updateData.repairTypeId = primaryRepairTypeId;
      } else if (parsedItems[0]?.repairTypeId) {
        updateData.repairTypeId = parsedItems[0].repairTypeId;
      }
    } else if (hasAdvanceAmountField && advanceAmount !== repair.advanceAmount) {
      updateData.advanceAmount = advanceAmount;
      audits.push({
        eventType: "ADVANCE_UPDATED",
        oldValue: String(repair.advanceAmount),
        newValue: String(advanceAmount),
      });
    }

    if (nextStatus && nextStatus !== repair.status) {
      const currentIndex = statusOrder.indexOf(repair.status);
      const nextIndex = statusOrder.indexOf(nextStatus);
      const allowed = nextIndex === currentIndex + 1;
      if (!allowed) {
        return NextResponse.json(
          fail("Invalid status transition.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
      updateData.status = nextStatus;
      audits.push({
        eventType: "STATUS_CHANGED",
        oldValue: repair.status,
        newValue: nextStatus,
      });
    }

    if (estimatedDeliveryDate) {
      const dateMatch = estimatedDeliveryDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        return NextResponse.json(
          fail("Estimated delivery date must be YYYY-MM-DD.", "VALIDATION_ERROR"),
          { status: 400 }
        );
      }
      const dateOnly = new Date(
        Date.UTC(
          Number(dateMatch[1]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[3])
        )
      );
      if (dateOnly.getTime() !== repair.estimatedDeliveryDate.getTime()) {
        updateData.estimatedDeliveryDate = dateOnly;
        updateData.isPostponed = true;
        audits.push({
          eventType: "RESCHEDULED",
          oldValue: repair.estimatedDeliveryDate.toISOString(),
          newValue: dateOnly.toISOString(),
        });
      }
    } else if (isPostponed !== null) {
      updateData.isPostponed = isPostponed;
      audits.push({
        eventType: "POSTPONED_FLAG",
        oldValue: String(repair.isPostponed),
        newValue: String(isPostponed),
      });
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        fail("No changes provided.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const statusChangedTo = (updateData.status as RepairStatus | undefined) ?? null;
    const isRescheduled =
      statusChangedTo === null &&
      Object.prototype.hasOwnProperty.call(updateData, "estimatedDeliveryDate");

    await prisma.$transaction(async (tx) => {
      await tx.repair.update({
        where: { id },
        data: updateData,
      });

      if (parsedItems) {
        await tx.repairItem.deleteMany({ where: { repairId: id } });
        await tx.repairItem.createMany({
          data: parsedItems.map((item) => ({
            repairId: id,
            repairTypeId: item.repairTypeId,
            price: item.price,
          })),
        });
        audits.push({
          eventType: "ITEMS_UPDATED",
          oldValue: null,
          newValue: buildItemsAuditSummary(parsedItems),
        });
      }

      for (const audit of audits) {
        await tx.repairAudit.create({
          data: {
            repairId: id,
            eventType: audit.eventType,
            oldValue: audit.oldValue,
            newValue: audit.newValue,
            performedById: user.id,
          },
        });
      }
    });

    const recentSmsMessages = await prisma.smsOutbox.findMany({
      where: {
        repairId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { message: true },
    });

    const existingTrackingToken =
      recentSmsMessages
        .map((entry) => extractTrackingTokenFromSmsMessage(entry.message))
        .find((token) => Boolean(token)) ?? null;

    const needsTrackingLink =
      statusChangedTo === "PROCESSING" ||
      statusChangedTo === "REPAIR_COMPLETED" ||
      statusChangedTo === null;

    if (needsTrackingLink && !existingTrackingToken) {
      await prisma.repairAudit.create({
        data: {
          repairId: id,
          eventType: "SMS_SKIPPED",
          oldValue: null,
          newValue: toAuditValue(
            statusChangedTo === null
              ? "Tracking token not found for update SMS."
              : `Tracking token not found for ${statusChangedTo} status SMS.`
          ),
          performedById: user.id,
        },
      });
      return NextResponse.json(
        ok(
          null,
          statusChangedTo === null
            ? "Repair updated, but SMS skipped due to missing tracking token."
            : "Status updated, but SMS skipped due to missing tracking token."
        ),
        { status: 200 }
      );
    }

    const trackingUrl =
      existingTrackingToken !== null
        ? buildTrackingUrl(getBaseUrlForTracking(request), existingTrackingToken)
        : null;

    const statusSmsNext =
      statusChangedTo === "PROCESSING" ||
      statusChangedTo === "REPAIR_COMPLETED" ||
      statusChangedTo === "DELIVERED"
        ? statusChangedTo
        : null;

    const smsMessage =
      statusSmsNext !== null
        ? buildRepairStatusMessage({
            billNo: repair.billNo,
            nextStatus: statusSmsNext,
            trackingUrl: trackingUrl ?? undefined,
          })
        : isRescheduled
          ? buildRepairRescheduledMessage({
              billNo: repair.billNo,
              trackingUrl: trackingUrl ?? "",
            })
          : buildRepairUpdatedMessage({
              billNo: repair.billNo,
              trackingUrl: trackingUrl ?? "",
            });

    const smsType =
      statusChangedTo === "PROCESSING"
        ? "REPAIR_STARTED"
        : statusChangedTo === "REPAIR_COMPLETED"
          ? "REPAIR_COMPLETED"
          : statusChangedTo === "DELIVERED"
            ? "REPAIR_DELIVERED"
            : isRescheduled
              ? "REPAIR_RESCHEDULED"
              : "REPAIR_UPDATED";

    const smsOutbox = await prisma.smsOutbox.create({
      data: {
        repairId: id,
        recipient: repair.client.mobile,
        message: smsMessage,
        type: smsType,
        status: "PENDING",
        scheduledFor: new Date(),
      },
    });

    const smsSendResult = await sendTextLkSms({
      phoneNumber: repair.client.mobile,
      message: smsMessage,
    });

    if (smsSendResult.success) {
      await prisma.$transaction([
        prisma.smsOutbox.update({
          where: { id: smsOutbox.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerResponse: smsSendResult.providerResponse,
          },
        }),
        prisma.repairAudit.create({
          data: {
            repairId: id,
            eventType: "SMS_SENT",
            oldValue: null,
            newValue: toAuditValue(smsSendResult.providerResponse),
            performedById: user.id,
          },
        }),
      ]);

      return NextResponse.json(
        ok(
          null,
          statusChangedTo === null
            ? "Repair updated and SMS sent."
            : "Status updated and SMS sent."
        ),
        { status: 200 }
      );
    }

    await prisma.$transaction([
      prisma.smsOutbox.update({
        where: { id: smsOutbox.id },
        data: {
          status: "FAILED",
          providerResponse: smsSendResult.providerResponse,
        },
      }),
      prisma.repairAudit.create({
        data: {
          repairId: id,
          eventType: "SMS_FAILED",
          oldValue: null,
          newValue: toAuditValue(
            smsSendResult.errorMessage ?? smsSendResult.providerResponse
          ),
          performedById: user.id,
        },
      }),
    ]);

    return NextResponse.json(
      ok(
        null,
        statusChangedTo === null
          ? "Repair updated, but SMS sending failed."
          : "Status updated, but SMS sending failed."
      ),
      { status: 200 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(user, "repairs")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        fail("Repair id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    await prisma.repair.delete({
      where: { id },
    });

    return NextResponse.json(ok(null, "Repair deleted."), { status: 200 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code === "P2025"
    ) {
      return NextResponse.json(
        fail("Repair not found.", "NOT_FOUND"),
        { status: 404 }
      );
    }

    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
