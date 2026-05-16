type RateLimitOptions = {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const globalState = globalThis as typeof globalThis & {
  __dobRateLimitBuckets?: Map<string, Bucket>;
};

function getBuckets() {
  if (!globalState.__dobRateLimitBuckets) {
    globalState.__dobRateLimitBuckets = new Map<string, Bucket>();
  }
  return globalState.__dobRateLimitBuckets;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const buckets = getBuckets();
  const ip = getClientIp(request);
  const key = `${options.keyPrefix}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}
