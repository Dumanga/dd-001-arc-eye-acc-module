"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Crown, Loader2, Search, UserRound, Users, X } from "lucide-react";
import { AccountingPageIntro, PremiumMetricGrid, SurfaceCard } from "@/components/accounting/accounting-ui";
import currencies from "@/lib/accounting/data/currencies.json";

const tiers = ["BRONZE", "SILVER", "GOLD"] as const;
const tierLabels: Record<(typeof tiers)[number], string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};
const DEFAULT_CURRENCY = "LKR";
const MIN_MOBILE_DIGITS = 7;
const MAX_MOBILE_DIGITS = 15;

type Tier = (typeof tiers)[number];

type Client = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  address: string | null;
  currency: string;
  tier: Tier;
  isMerchant: boolean;
  isWalkIn: boolean;
  createdAt: string;
  updatedAt: string;
};

type ClientsResponse = {
  items: Client[];
  total: number;
  goldCount: number;
  recentCount: number;
  page: number;
  pageSize: number;
};

type CurrencyRecord = { code: string; name: string };

function FieldLabel({
  children,
  required = false,
  optional = false,
}: {
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 text-sm font-semibold text-[#5c544d]">
      <span>{children}</span>
      {required ? <span className="text-[#c95d37]">*</span> : null}
      {optional ? <span className="font-normal text-[#a09388]">(optional)</span> : null}
    </span>
  );
}

function isValidMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= MIN_MOBILE_DIGITS && digits.length <= MAX_MOBILE_DIGITS;
}

function formatJoinedDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}

function tierClassName(tier: Tier) {
  switch (tier) {
    case "GOLD":
      return "border-[#f5d28b] bg-[linear-gradient(180deg,#fffaf0_0%,#fff2d8_100%)] text-[#9a6512]";
    case "SILVER":
      return "border-[#d7dde6] bg-[linear-gradient(180deg,#fbfcfe_0%,#edf1f6_100%)] text-[#5d6879]";
    default:
      return "border-[#ffd8bb] bg-[linear-gradient(180deg,#fff8f1_0%,#fff0e3_100%)] text-[#b45b12]";
  }
}

function TierSelect({ value, onChange }: { value: Tier; onChange: (value: Tier) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"
      >
        <span>{tierLabels[value]}</span>
        <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
          {tiers.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => {
                onChange(tier);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                tier === value ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"
              }`}
            >
              <span>{tierLabels[tier]}</span>
              {tier === value ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CurrencySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { code: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  const currentLabel = options.find((opt) => opt.code === value)?.label ?? value;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (open) setQuery("");
          setOpen((current) => !current);
        }}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"
      >
        <span>{currentLabel}</span>
        <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
          <div className="px-2 pb-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search currency"
              className="w-full rounded-xl border border-[#e2d8cf] bg-white px-3 py-2 text-sm text-[#1f1d1c] outline-none placeholder:text-[#a79b90] focus:border-[#ffba82]"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-[#a09388]">No matches.</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => {
                    onChange(opt.code);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    opt.code === value
                      ? "bg-[#fff1e2] font-semibold text-[#b45b12]"
                      : "text-[#5f5751] hover:bg-[#fff7f0]"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.code === value ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CustomersPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);
  const [goldCount, setGoldCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileTouched, setMobileTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [tier, setTier] = useState<Tier>("BRONZE");
  // Merchant flag — true for Visa / Koko / bank-settlement counterparties
  // used by SPLIT-method POS bills. Per accounting-theories.md § 7.2,
  // merchants are stored alongside regular customers and surface only in
  // the SPLIT merchant picker on the POS screen.
  const [isMerchant, setIsMerchant] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const currencyOptions = useMemo(
    () =>
      Object.values(currencies as Record<string, CurrencyRecord>)
        .map((c) => ({ code: c.code, label: `${c.code} - ${c.name}` }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    []
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPageError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());

    void fetch(`/api/accounting/clients?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          data: ClientsResponse | null;
        };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Failed to load clients.");
        }
        if (requestIdRef.current !== currentRequestId) return;
        setClients(payload.data.items);
        setTotal(payload.data.total);
        setGoldCount(payload.data.goldCount);
        setRecentCount(payload.data.recentCount);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPageError(error instanceof Error ? error.message : "Unable to load client data.");
      })
      .finally(() => {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [page, pageSize, search]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const mobileDigits = mobile.replace(/\D/g, "");
  const showMobileError = mobileTouched && mobile.length > 0 && !isValidMobile(mobile);

  const clientMetrics = useMemo(
    () => [
      {
        label: "Total clients",
        value: String(total).padStart(2, "0"),
        detail: "Accounting customer register, separate from operational clients.",
        icon: Users,
        tone: "amber" as const,
      },
      {
        label: "Gold tier",
        value: String(goldCount).padStart(2, "0"),
        detail: "Higher-priority customers for billing and collections.",
        icon: Crown,
        tone: "blue" as const,
      },
      {
        label: "Recent signups",
        value: String(recentCount).padStart(2, "0"),
        detail: "Customers added during the current accounting month.",
        icon: UserRound,
        tone: "green" as const,
      },
    ],
    [goldCount, recentCount, total]
  );

  function resetForm() {
    setEditingClient(null);
    setName("");
    setMobile("");
    setMobileTouched(false);
    setEmail("");
    setAddress("");
    setCurrency(DEFAULT_CURRENCY);
    setTier("BRONZE");
    setIsMerchant(false);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setName(client.name);
    setMobile(client.mobile);
    setMobileTouched(false);
    setEmail(client.email ?? "");
    setAddress(client.address ?? "");
    setCurrency(client.currency || DEFAULT_CURRENCY);
    setTier(client.tier);
    setIsMerchant(client.isMerchant);
    setFormError(null);
    setOpen(true);
  }

  async function reloadCurrentPage(resetToFirstPage = false) {
    if (resetToFirstPage && page !== 1) {
      setPage(1);
      return;
    }
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPageError(null);

    const params = new URLSearchParams({
      page: String(resetToFirstPage ? 1 : page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());

    try {
      const response = await fetch(`/api/accounting/clients?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: ClientsResponse | null;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load clients.");
      }
      if (requestIdRef.current !== currentRequestId) return;
      setClients(payload.data.items);
      setTotal(payload.data.total);
      setGoldCount(payload.data.goldCount);
      setRecentCount(payload.data.recentCount);
    } catch (error) {
      if (!controller.signal.aborted) {
        setPageError(error instanceof Error ? error.message : "Unable to load client data.");
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    if (!mobile.trim()) {
      setFormError("Mobile number is required.");
      return;
    }
    if (!isValidMobile(mobile)) {
      setFormError(`Mobile must be ${MIN_MOBILE_DIGITS}-${MAX_MOBILE_DIGITS} digits (numbers only).`);
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Please enter a valid email or leave it blank.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch("/api/accounting/clients", {
        method: editingClient ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingClient ? { id: editingClient.id } : {}),
          name: name.trim(),
          mobile: mobileDigits,
          email: email.trim() || null,
          address: address.trim() || null,
          currency,
          tier,
          isMerchant,
        }),
      });

      const payload = (await response.json()) as { success: boolean; message: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save customer.");
      }

      setOpen(false);
      resetForm();
      await reloadCurrentPage(!editingClient);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AccountingPageIntro
        eyebrow="Customers / Clients"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
          >
            Add Client
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </button>
        }
      />

      <PremiumMetricGrid items={clientMetrics} columns={3} />

      <SurfaceCard title="Client list" description="Accounting customer register with create flow, search, and pagination.">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#e9e1d8] bg-[#fffaf5] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#1f1d1c]">Tracked customers</p>
              <p className="mt-1 text-sm text-[#786f69]">Search and manage customers used by accounting flows.</p>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, mobile, or email"
                className="w-[280px] max-w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
              />
            </label>
          </div>

          {pageError ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
              {pageError}
            </div>
          ) : null}

          <div className="grid gap-3">
            {loading ? (
              <div className="flex items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-10 text-sm text-[#786f69]">
                <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
                Loading client register...
              </div>
            ) : clients.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center">
                <p className="text-base font-semibold text-[#1f1d1c]">No customers found.</p>
                <p className="mt-2 text-sm text-[#786f69]">Try a different search term or add a new customer.</p>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className="grid items-center gap-3 rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf5_100%)] px-4 py-3 sm:grid-cols-[1.4fr_1fr_auto_auto_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#1f1d1c]">{client.name}</p>
                      {client.isMerchant ? (
                        <span className="inline-flex items-center rounded-full border border-[#c9b8e8] bg-[linear-gradient(180deg,#f6f0ff_0%,#ece2ff_100%)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5b3eaf]">
                          Merchant
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8b7f75]">
                      Joined {formatJoinedDate(client.createdAt)}
                    </p>
                  </div>
                  <div className="text-sm text-[#70665f]">
                    <div>{client.mobile}</div>
                    {client.email ? (
                      <div className="mt-0.5 truncate text-xs text-[#9a8f85]">{client.email}</div>
                    ) : null}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                    {client.currency}
                  </div>
                  <div
                    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${tierClassName(
                      client.tier
                    )}`}
                  >
                    {tierLabels[client.tier]}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(client)}
                      className="rounded-xl border border-[#ddd8d1] bg-white px-3 py-2 text-sm font-semibold text-[#5f5751]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Delete is disabled during development."
                      className="cursor-not-allowed rounded-xl border border-[#eadfd7] bg-[#f8f3ee] px-3 py-2 text-sm font-semibold text-[#b7aaa0] opacity-80"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece4db] pt-1 text-sm text-[#786f69]">
            <div>
              Showing {total ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <div>
                Page <span className="font-semibold text-[#1f1d1c]">{page}</span> of {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  page <= 1 || loading
                    ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                    : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                }`}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  page >= totalPages || loading
                    ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                    : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,27,23,0.45)] px-4 py-6">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col rounded-[30px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
                  {editingClient ? "Edit Customer" : "New Customer"}
                </p>
                <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
                  {editingClient ? "Update client" : "Add client"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e2d8cf] bg-white text-[#6d665f] transition hover:bg-[#f4efe9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="mt-6 flex min-h-0 flex-1 flex-col" onSubmit={(event) => void handleSubmit(event)}>
              <div className="grid min-h-0 items-start gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                {formError ? (
                  <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37] sm:col-span-2">
                    {formError}
                  </div>
                ) : null}

                <label className="grid gap-2 sm:col-span-2">
                  <FieldLabel required>Customer name</FieldLabel>
                  <input
                    className="settings-input"
                    placeholder="Enter customer name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (formError) setFormError(null);
                    }}
                  />
                </label>

                <label className="grid gap-2">
                  <FieldLabel required>Mobile number</FieldLabel>
                  <input
                    className={`settings-input ${showMobileError ? "border-[#ed9f8d]" : ""}`}
                    placeholder="Enter mobile number"
                    value={mobile}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, MAX_MOBILE_DIGITS);
                      setMobile(digits);
                      setMobileTouched(true);
                      if (formError) setFormError(null);
                    }}
                    onBlur={() => setMobileTouched(true)}
                    inputMode="numeric"
                  />
                  {showMobileError ? (
                    <p className="text-xs text-[#c95d37]">
                      Mobile must be {MIN_MOBILE_DIGITS}-{MAX_MOBILE_DIGITS} digits.
                    </p>
                  ) : (
                    <p className="text-xs text-[#a09388]">Numbers only. Country code optional.</p>
                  )}
                </label>

                <label className="grid gap-2">
                  <FieldLabel optional>Email</FieldLabel>
                  <input
                    type="email"
                    className="settings-input"
                    placeholder="customer@example.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (formError) setFormError(null);
                    }}
                  />
                </label>

                <label className="grid gap-2 sm:col-span-2">
                  <FieldLabel optional>Address</FieldLabel>
                  <textarea
                    className="settings-input settings-textarea"
                    placeholder="Enter billing address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    rows={3}
                  />
                </label>

                <div className="grid gap-2">
                  <FieldLabel required>Currency</FieldLabel>
                  <CurrencySelect value={currency} options={currencyOptions} onChange={setCurrency} />
                </div>

                <div className="grid gap-2">
                  <FieldLabel>Loyalty tier</FieldLabel>
                  <TierSelect value={tier} onChange={setTier} />
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={isMerchant}
                    onChange={(event) => setIsMerchant(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#d7cabe] text-[#ff7101] focus:ring-[#ffba82]"
                  />
                  <span className="grid gap-1">
                    <span className="text-sm font-semibold text-[#1f1d1c]">
                      This customer is a merchant
                    </span>
                    <span className="text-xs text-[#786f69]">
                      Tick for Visa / MasterCard / Koko / bank-settlement
                      counterparties used by SPLIT-method POS bills. Merchants
                      do not appear in the regular customer dropdown — they
                      surface only in the SPLIT merchant picker on the POS
                      screen.
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-[#eee4dc] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs text-[#6f6761] transition hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:bg-[#f1a366]"
                >
                  {saving ? "Saving..." : editingClient ? "Update Client" : "Save Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
