"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type TrackingItem = {
  id: string;
  price: number;
  repairType: {
    id: string;
    name: string;
    code: string;
  };
};

type TrackingData = {
  id: string;
  billNo: string;
  status: "PENDING" | "PROCESSING" | "REPAIR_COMPLETED" | "DELIVERED";
  intakeType: "WALK_IN" | "COURIER";
  estimatedDeliveryDate: string;
  totalAmount: number;
  advanceAmount: number;
  description: string | null;
  client: {
    name: string;
    mobile: string;
  };
  brand: {
    name: string;
  };
  store: {
    name: string;
  };
  items: TrackingItem[];
};

const statusLabelMap: Record<TrackingData["status"], string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  REPAIR_COMPLETED: "Repair Completed",
  DELIVERED: "Delivered",
};
const statusDescriptionMap: Record<TrackingData["status"], string> = {
  PENDING: "Repair not started yet.",
  PROCESSING: "Repair started and currently in progress.",
  REPAIR_COMPLETED: "Ready to pickup.",
  DELIVERED: "Repair has been delivered.",
};

const statusCardStyles: Record<
  TrackingData["status"],
  {
    text: string;
    panel: string;
    border: string;
    glow: string;
    ring: string;
    ringColor: string;
  }
> = {
  PENDING: {
    text: "text-sky-200",
    panel: "bg-sky-500/10",
    border: "border-sky-300/30",
    glow: "bg-sky-400/20",
    ring: "from-sky-300 via-cyan-300 to-sky-300",
    ringColor: "rgba(125, 211, 252, 0.95)",
  },
  PROCESSING: {
    text: "text-amber-200",
    panel: "bg-amber-500/10",
    border: "border-amber-300/35",
    glow: "bg-amber-300/25",
    ring: "from-amber-300 via-yellow-200 to-amber-300",
    ringColor: "rgba(253, 224, 71, 0.95)",
  },
  REPAIR_COMPLETED: {
    text: "text-emerald-200",
    panel: "bg-emerald-500/10",
    border: "border-emerald-300/35",
    glow: "bg-emerald-300/25",
    ring: "from-emerald-300 via-lime-200 to-emerald-300",
    ringColor: "rgba(74, 222, 128, 0.95)",
  },
  DELIVERED: {
    text: "text-zinc-200",
    panel: "bg-zinc-500/10",
    border: "border-zinc-300/35",
    glow: "bg-zinc-300/25",
    ring: "from-zinc-300 via-zinc-100 to-zinc-300",
    ringColor: "rgba(228, 228, 231, 0.95)",
  },
};

function formatMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("94") && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  return value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<TrackingLoadingView />}>
      <TrackingPageContent />
    </Suspense>
  );
}

function TrackingLoadingView() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0f14] text-white">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-16">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-xl">
          <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-emerald-400" />
          <p className="text-sm text-white/70">Loading tracking details...</p>
        </div>
      </div>
    </main>
  );
}

function TrackingPageContent() {
  const searchParams = useSearchParams();
  const token = (
    searchParams.get("trackingcode") ??
    searchParams.get("token") ??
    ""
  ).trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackingData | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadTracking() {
      if (!token) {
        if (active) {
          setError("You do not have access or invalid tracking id.");
          setData(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/tracking?token=${encodeURIComponent(token)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          data: TrackingData | null;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(
            payload.message || "Unable to fetch tracking details."
          );
        }

        if (active) {
          setData(payload.data);
          setError(null);
        }
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        setData(null);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to fetch tracking details."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTracking();

    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  const statusLabel = useMemo(() => {
    if (!data) {
      return "-";
    }
    return statusLabelMap[data.status] ?? data.status;
  }, [data]);
  const statusDescription = useMemo(() => {
    if (!data) {
      return "Current stage of the repair.";
    }
    return (
      statusDescriptionMap[data.status] ?? "Current stage of the repair."
    );
  }, [data]);
  const statusStyle = useMemo(() => {
    if (!data) {
      return statusCardStyles.PENDING;
    }
    return statusCardStyles[data.status] ?? statusCardStyles.PENDING;
  }, [data]);
  const statusBorderGradient = useMemo(
    () =>
      `conic-gradient(
        from 0deg,
        transparent 0deg,
        transparent 40deg,
        ${statusStyle.ringColor} 75deg,
        transparent 110deg,
        transparent 220deg,
        ${statusStyle.ringColor} 250deg,
        transparent 290deg,
        transparent 360deg
      )`,
    [statusStyle.ringColor]
  );

  if (loading) {
    return <TrackingLoadingView />;
  }

  if (!data || error) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#0b0f14] text-white">
        <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-16">
          <div className="w-full rounded-3xl border border-rose-400/30 bg-rose-500/10 p-8 text-center backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/80">
              Tracking Error
            </p>
            <h1 className="mt-3 text-2xl font-semibold">
              You do not have access or invalid tracking id.
            </h1>
            <p className="mt-3 text-sm text-rose-100/80">
              {error ?? "Unable to fetch tracking details."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0f14] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute right-[-10%] top-[-10%] h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute bottom-[-20%] left-1/3 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_45%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex flex-col justify-center gap-6">
            <div className="flex flex-wrap items-center gap-4">
              <img
                src="/assets/icon.png"
                alt="Arc Eye logo"
                className="h-20 w-auto max-w-full opacity-90 sm:h-24"
              />
              <span className="w-fit rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                Repair Tracking
              </span>
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Track your bat repair in real time.
            </h1>
            <p className="max-w-xl text-base text-white/70 sm:text-lg">
              View live status, estimated completion, and repair details.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative overflow-hidden rounded-2xl p-[1px]">
                <div
                  className="pointer-events-none absolute inset-[-130%] animate-[spin_3.8s_linear_infinite]"
                  style={{ backgroundImage: statusBorderGradient }}
                />
                <div
                  className={`relative overflow-hidden rounded-2xl border p-4 ${statusStyle.border} ${statusStyle.panel}`}
                >
                  <span
                    className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl opacity-70 ${statusStyle.glow}`}
                  />
                  <p className="relative z-10 text-xs uppercase tracking-[0.2em] text-white/85">
                    Status
                  </p>
                  <p className={`relative z-10 mt-2 text-xl font-semibold ${statusStyle.text}`}>
                    {statusLabel}
                  </p>
                  <p className="relative z-10 mt-1 text-xs text-white/80">
                    {statusDescription}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  ETA
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {formatDate(data.estimatedDeliveryDate)}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Estimated delivery date.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/60">
                  Repair Summary
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Job details</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                Live data
              </div>
            </div>

            <div className="mt-8 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Client
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Name
                    </p>
                    <p className="mt-1 text-lg font-semibold">{data.client.name}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {formatMobile(data.client.mobile)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Bill number
                    </p>
                    <p className="mt-1 text-lg font-semibold">{data.billNo}</p>
                    <p className="mt-1 text-xs text-white/50">
                      Issued at {data.store.name}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Bat brand
                </p>
                <p className="mt-2 text-lg font-semibold">{data.brand.name}</p>
                <p className="mt-1 text-xs text-white/50">
                  Intake: {data.intakeType === "COURIER" ? "Courier" : "Walk-in"}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Total amount
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    LKR {data.totalAmount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Includes labor and materials.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Advance paid
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    LKR {data.advanceAmount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Amount paid as advance.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Balance to be paid
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    LKR {(data.totalAmount - data.advanceAmount).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Remaining amount to settle.
                  </p>
                </div>
              </div>
              {/* Same wordmark we put on the printed POS bill + repair
                  receipt — keeps branding consistent across surfaces. */}
              <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                Powered by Dozen Digital Pvt Ltd
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
