import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/response";
import {
  canAccessStore,
  hasOperationAccess,
  requireOperationUser,
} from "@/lib/auth/operation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  buildDeliveryReminderMessage,
  buildTrackingUrl,
} from "@/lib/sms/messages";
import { sendTextLkSms } from "@/lib/sms/textlk";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const REMINDER_TYPE = "DELIVERY_REMINDER";
const MAX_AUDIT_VALUE_LENGTH = 240;

function parseDateOnly(value: string) {
  const match = value.match(datePattern);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
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

export async function GET(request: Request) {
  try {
    const user = await requireOperationUser();
    if (!user) {
      return NextResponse.json(fail("Not authenticated.", "UNAUTHORIZED"), {
        status: 401,
      });
    }
    if (!hasOperationAccess(user, "sms")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }
    if (user.role !== "SUPER_ADMIN" && !user.storeId) {
      return NextResponse.json(fail("Store assignment required.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const { searchParams } = new URL(request.url);
    const targetDateRaw = (searchParams.get("targetDate") ?? "").trim();
    const parsed = parseDateOnly(targetDateRaw);
    if (!parsed) {
      return NextResponse.json(
        fail("targetDate is required in YYYY-MM-DD format.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const sentRows = await prisma.smsOutbox.findMany({
      where: {
        type: REMINDER_TYPE,
        status: "SENT",
        repair: {
          ...(user.role === "SUPER_ADMIN" ? {} : { storeId: user.storeId as string }),
          estimatedDeliveryDate: {
            gte: parsed.start,
            lt: parsed.endExclusive,
          },
        },
      },
      select: { repairId: true },
    });

    const sentRepairIds = Array.from(new Set(sentRows.map((row) => row.repairId)));
    return NextResponse.json(
      ok({ sentRepairIds }, "Reminder statuses fetched."),
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
    if (!hasOperationAccess(user, "sms")) {
      return NextResponse.json(fail("Forbidden.", "FORBIDDEN"), {
        status: 403,
      });
    }

    const rateLimit = checkRateLimit(request, {
      keyPrefix: "sms-reminder-send",
      windowMs: 10 * 60 * 1000,
      maxRequests: 30,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        fail("Too many SMS requests. Try again later.", "RATE_LIMITED"),
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as {
      repairId?: unknown;
    };
    const repairId = typeof body.repairId === "string" ? body.repairId.trim() : "";
    if (!repairId) {
      return NextResponse.json(
        fail("Repair id is required.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const repair = await prisma.repair.findUnique({
      where: { id: repairId },
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

    if (repair.status === "DELIVERED") {
      return NextResponse.json(
        fail("Delivered repairs do not need reminders.", "VALIDATION_ERROR"),
        { status: 400 }
      );
    }

    const alreadySent = await prisma.smsOutbox.findFirst({
      where: {
        repairId,
        type: REMINDER_TYPE,
        status: "SENT",
      },
      select: { id: true },
    });

    if (alreadySent) {
      return NextResponse.json(
        ok({ repairId, alreadySent: true }, "Reminder already sent."),
        { status: 200 }
      );
    }

    const recentSmsMessages = await prisma.smsOutbox.findMany({
      where: {
        repairId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { message: true },
    });

    const trackingToken =
      recentSmsMessages
        .map((entry) => extractTrackingTokenFromSmsMessage(entry.message))
        .find((token) => Boolean(token)) ?? null;

    if (!trackingToken) {
      return NextResponse.json(
        fail(
          "Reminder SMS skipped due to missing tracking token.",
          "TRACKING_TOKEN_MISSING"
        ),
        { status: 400 }
      );
    }

    const trackingUrl = buildTrackingUrl(
      getBaseUrlForTracking(request),
      trackingToken
    );

    const message = buildDeliveryReminderMessage({
      billNo: repair.billNo,
      dueDate: repair.estimatedDeliveryDate,
      trackingUrl,
    });

    const outbox = await prisma.smsOutbox.create({
      data: {
        repairId: repair.id,
        recipient: repair.client.mobile,
        message,
        type: REMINDER_TYPE,
        status: "PENDING",
        scheduledFor: new Date(),
      },
    });

    const smsResult = await sendTextLkSms({
      phoneNumber: repair.client.mobile,
      message,
    });

    if (smsResult.success) {
      await Promise.all([
        prisma.smsOutbox.update({
          where: { id: outbox.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerResponse: smsResult.providerResponse,
          },
        }),
        prisma.repairAudit.create({
          data: {
            repairId: repair.id,
            eventType: "DELIVERY_REMINDER_SMS_SENT",
            oldValue: null,
            newValue: toAuditValue(message),
            performedById: user.id,
          },
        }),
      ]);

      return NextResponse.json(
        ok({ repairId: repair.id, alreadySent: false }, "Reminder SMS sent."),
        { status: 200 }
      );
    }

    await Promise.all([
      prisma.smsOutbox.update({
        where: { id: outbox.id },
        data: {
          status: "FAILED",
          providerResponse: smsResult.providerResponse,
        },
      }),
      prisma.repairAudit.create({
        data: {
          repairId: repair.id,
          eventType: "DELIVERY_REMINDER_SMS_FAILED",
          oldValue: null,
          newValue: toAuditValue(
            smsResult.errorMessage ?? smsResult.providerResponse
          ),
          performedById: user.id,
        },
      }),
    ]);

    return NextResponse.json(
      fail(
        smsResult.errorMessage ?? "Reminder SMS failed to send.",
        "SMS_SEND_FAILED"
      ),
      { status: 502 }
    );
  } catch {
    return NextResponse.json(fail("Unexpected server error.", "SERVER_ERROR"), {
      status: 500,
    });
  }
}
