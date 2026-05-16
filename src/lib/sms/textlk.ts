import { sendSMS } from "textlk-node";

type SendTextLkParams = {
  phoneNumber: string;
  message: string;
  maxAttempts?: number;
};

export type SendTextLkResult = {
  success: boolean;
  attempts: number;
  providerResponse: string;
  errorMessage: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function serializeProviderResponse(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  if (raw.length <= 180) {
    return raw;
  }
  return `${raw.slice(0, 177)}...`;
}

export async function sendTextLkSms({
  phoneNumber,
  message,
  maxAttempts = 2,
}: SendTextLkParams): Promise<SendTextLkResult> {
  const apiToken = process.env.TEXTLK_API_TOKEN?.trim();
  const senderId = process.env.TEXTLK_SENDER_ID?.trim();

  if (!apiToken || !senderId) {
    return {
      success: false,
      attempts: 0,
      providerResponse: "TEXTLK config missing.",
      errorMessage: "TEXTLK_API_TOKEN or TEXTLK_SENDER_ID is missing.",
    };
  }

  let attempts = 0;
  let lastError = "SMS send failed.";

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const response = await sendSMS({
        phoneNumber,
        message,
        apiToken,
        senderId,
      });

      return {
        success: true,
        attempts,
        providerResponse: serializeProviderResponse(response),
        errorMessage: null,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "SMS send failed.";
      if (attempts < maxAttempts) {
        await sleep(500);
      }
    }
  }

  return {
    success: false,
    attempts,
    providerResponse: serializeProviderResponse(lastError),
    errorMessage: lastError,
  };
}

