type BuildRepairCreatedMessageParams = {
  billNo: string;
  trackingUrl: string;
};

type BuildRepairStatusMessageParams = {
  billNo: string;
  nextStatus: "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  trackingUrl?: string;
};

type BuildDeliveryReminderMessageParams = {
  billNo: string;
  dueDate: Date;
  trackingUrl: string;
};

export function buildTrackingUrl(baseUrl: string, trackingToken: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/tracking?token=${encodeURIComponent(trackingToken)}`;
}

const SMS_CHAR_LIMIT = 170;

function pickBoundedMessage(candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate.length <= SMS_CHAR_LIMIT) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1].slice(0, SMS_CHAR_LIMIT);
}

export function buildRepairCreatedMessage({
  billNo,
  trackingUrl,
}: BuildRepairCreatedMessageParams) {
  const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
  return pickBoundedMessage([
    `Your repair ${billNo} has been created successfully. Status: Pending. Track details here: ${trackingUrl}`,
    `Your repair ${billNo} has been created successfully. Status: Pending. Track details here: ${protocolStrippedLink}`,
  ]);
}

export function buildRepairUpdatedMessage({
  billNo,
  trackingUrl,
}: BuildRepairCreatedMessageParams) {
  const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
  return pickBoundedMessage([
    `Your repair ${billNo} has been updated. Kindly review the latest details here: ${trackingUrl}`,
    `Your repair ${billNo} has been updated. Kindly review the latest details here: ${protocolStrippedLink}`,
  ]);
}

export function buildRepairRescheduledMessage({
  billNo,
  trackingUrl,
}: BuildRepairCreatedMessageParams) {
  const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
  return pickBoundedMessage([
    `Your repair ${billNo} has been rescheduled. Please check the updated date here: ${trackingUrl}`,
    `Your repair ${billNo} has been rescheduled. Please check the updated date here: ${protocolStrippedLink}`,
  ]);
}

export function buildRepairStatusMessage({
  billNo,
  nextStatus,
  trackingUrl,
}: BuildRepairStatusMessageParams) {
  if (nextStatus === "PROCESSING") {
    if (!trackingUrl) {
      return pickBoundedMessage([
        `Your repair ${billNo} is now in progress. Our team has started working on it.`,
      ]);
    }
    const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
    return pickBoundedMessage([
      `Your repair ${billNo} is now in progress. Our team has started working on it. Track status: ${trackingUrl}`,
      `Your repair ${billNo} is now in progress. Our team has started working on it. Track status: ${protocolStrippedLink}`,
    ]);
  }

  if (nextStatus === "REPAIR_COMPLETED") {
    if (!trackingUrl) {
      return pickBoundedMessage([
        `Your repair ${billNo} is completed and ready for pickup. Please visit us at your convenience.`,
      ]);
    }
    const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
    return pickBoundedMessage([
      `Your repair ${billNo} is completed and ready for pickup. Please visit us at your convenience. ${trackingUrl}`,
      `Your repair ${billNo} is completed and ready for pickup. Please visit us at your convenience. ${protocolStrippedLink}`,
    ]);
  }

  return pickBoundedMessage([
    `Your repair ${billNo} has been delivered successfully. Thank you for choosing us. We appreciate your trust.`,
  ]);
}

export function buildDeliveryReminderMessage({
  billNo,
  dueDate,
  trackingUrl,
}: BuildDeliveryReminderMessageParams) {
  const dueLabel = dueDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const protocolStrippedLink = trackingUrl.replace(/^https?:\/\//i, "");
  return pickBoundedMessage([
    `Reminder: Repair ${billNo} will be ready on ${dueLabel}. Please collect it on or after this date. Track: ${trackingUrl}`,
    `Reminder: Repair ${billNo} will be ready on ${dueLabel}. Please collect it on or after this date. Track: ${protocolStrippedLink}`,
  ]);
}
