"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";

const tiers = ["BRONZE", "SILVER", "GOLD"] as const;
const tierLabels: Record<(typeof tiers)[number], string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};

type Client = {
  id: string;
  name: string;
  mobile: string;
  tier: (typeof tiers)[number];
  createdAt: string;
  updatedAt: string;
};

type ClientResponse = {
  items: Client[];
  total: number;
  goldCount: number;
  recentCount: number;
  page: number;
  pageSize: number;
};

const MOBILE_PREFIX = "94";
const MOBILE_PREFIX_DISPLAY = "+94";
const MOBILE_DIGITS = 9;

function isValidLocalMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === MOBILE_DIGITS && digits.startsWith("7");
}

export default function ClientsPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileTouched, setMobileTouched] = useState(false);
  const [tier, setTier] = useState<(typeof tiers)[number]>("BRONZE");
  const [tierOpen, setTierOpen] = useState(false);
  const [items, setItems] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [goldCount, setGoldCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmClient, setConfirmClient] = useState<Client | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  function tierClasses(level: Client["tier"]) {
    switch (level) {
      case "GOLD":
        return "border-amber-400/40 bg-amber-500/10 text-amber-200";
      case "SILVER":
        return "border-slate-400/40 bg-slate-500/10 text-slate-200";
      default:
        return "border-orange-400/40 bg-orange-500/10 text-orange-200";
    }
  }

  function formatMobile(value: string) {
    if (!value) {
      return "";
    }
    if (value.startsWith(MOBILE_PREFIX)) {
      return value.slice(MOBILE_PREFIX.length);
    }
    if (value.startsWith(MOBILE_PREFIX_DISPLAY)) {
      return value.slice(MOBILE_PREFIX_DISPLAY.length);
    }
    return value;
  }

  function buildMobile(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, MOBILE_DIGITS);
    return `${MOBILE_PREFIX}${digits}`;
  }

  const loadClients = useCallback(async () => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/clients?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: ClientResponse | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load customers");
      }

      if (requestIdRef.current === currentRequestId) {
        setItems(payload.data.items);
        setTotal(payload.data.total);
        setGoldCount(payload.data.goldCount);
        setRecentCount(payload.data.recentCount);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        err instanceof Error ? err.message : "Unable to load customer data."
      );
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    loadClients();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadClients, reloadToken]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !mobile.trim()) {
      setError("Name and mobile are required.");
      return;
    }
    if (!isValidLocalMobile(mobile)) {
      setError("Mobile number must be 9 digits and start with 7.");
      return;
    }
    if (
      editingClient &&
      name.trim().toLowerCase() === editingClient.name.trim().toLowerCase() &&
      buildMobile(mobile) === editingClient.mobile &&
      tier === editingClient.tier
    ) {
      setError("No changes to save.");
      return;
    }
    void saveClient();
  }

  async function saveClient() {
    const trimmedName = name.trim();
    const trimmedMobile = mobile.replace(/\D/g, "").slice(0, MOBILE_DIGITS);
    setSaving(true);
    setError(null);

    try {
      const isEditing = Boolean(editingClient);
      const response = await fetch("/api/clients", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isEditing
            ? {
                id: editingClient?.id,
                name: trimmedName,
                mobile: `${MOBILE_PREFIX}${trimmedMobile}`,
                tier,
              }
            : {
                name: trimmedName,
                mobile: `${MOBILE_PREFIX}${trimmedMobile}`,
                tier,
              }
        ),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save customer.");
      }

      const shouldResetPage = !isEditing && page !== 1;
      setOpen(false);
      setName("");
      setMobile("");
      setMobileTouched(false);
      setTier("BRONZE");
      setTierOpen(false);
      setEditingClient(null);
      if (shouldResetPage) {
        setPage(1);
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(client: Client) {
    setDeletingId(client.id);
    setError(null);

    try {
      const response = await fetch("/api/clients", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: client.id }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to delete customer.");
      }

      if (items.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete customer.");
    } finally {
      setDeletingId(null);
      setConfirmOpen(false);
      setConfirmClient(null);
    }
  }

  const mobileDigits = mobile.replace(/\D/g, "");
  const showMobileError = mobileTouched && mobile.length > 0 && !isValidLocalMobile(mobile);
  const mobileErrorMessage =
    mobileDigits.length < MOBILE_DIGITS
      ? "Mobile must be 9 digits."
      : !mobileDigits.startsWith("7")
        ? "Mobile must start with 7."
        : "Enter a valid mobile number.";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Clients
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Customer directory</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Track loyalty tiers and contact info.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="h-10 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-black transition hover:opacity-90"
            onClick={() => {
              setEditingClient(null);
              setName("");
              setMobile("");
              setTier("BRONZE");
              setTierOpen(false);
              setError(null);
              setOpen(true);
            }}
          >
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Total customers
          </p>
          <p className="mt-3 text-2xl font-semibold">{total}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Active loyalty members
          </p>
        </div>
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Gold tier
          </p>
          <p className="mt-3 text-2xl font-semibold">{goldCount}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Highest priority customers
          </p>
        </div>
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Recent signups
          </p>
          <p className="mt-3 text-2xl font-semibold">{recentCount}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Last 30 days
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Customer list
            </p>
            <h3 className="mt-2 text-xl font-semibold">Tracked customers</h3>
          </div>
          <label className="relative">
            <span className="sr-only">Search customers</span>
            <input
              className="h-9 w-52 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              placeholder="Search name or mobile"
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {loading ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Loading customers...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No customers found.
            </div>
          ) : (
            items.map((client) => (
              <div
                key={client.id}
                className="grid items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 sm:grid-cols-[1.5fr_0.8fr_0.6fr_0.6fr]"
              >
                <div>
                  <p className="text-sm font-semibold">{client.name}</p>
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  {client.mobile}
                </div>
                <div
                  className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.25em] ${tierClasses(
                    client.tier
                  )}`}
                >
                  {tierLabels[client.tier]}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel-muted)]"
                    onClick={() => {
                      setEditingClient(client);
                      setName(client.name);
                      setMobile(formatMobile(client.mobile));
                      setMobileTouched(false);
                      setTier(client.tier);
                      setError(null);
                      setTierOpen(false);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                    onClick={() => {
                      setConfirmClient(client);
                      setConfirmOpen(true);
                    }}
                    disabled={deletingId === client.id}
                  >
                    {deletingId === client.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-3 py-1">
              {items.length} of {total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div>
              Page <span className="text-[var(--foreground)]">{page}</span> of {totalPages}
            </div>
            <button
              className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>
            <button
              className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 transition hover:bg-[var(--panel)]"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {editingClient ? "Edit Customer" : "New Customer"}
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {editingClient ? "Update customer" : "Add customer"}
              </h3>
            </div>
            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              {error ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {error}
                </div>
              ) : null}
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Customer name
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Enter full name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                />
              </label>
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Mobile number
                <div
                  className={`flex h-11 items-center rounded-2xl border bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] ${
                    showMobileError
                      ? "border-rose-400/60"
                      : "border-[var(--stroke)]"
                  }`}
                >
                  <span className="text-xs text-[var(--text-muted)]">
                    {MOBILE_PREFIX_DISPLAY}
                  </span>
                  <input
                    className="ml-2 w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
                    placeholder="Enter 9 digits"
                    type="tel"
                    inputMode="numeric"
                    value={mobile}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      setMobile(digits.slice(0, MOBILE_DIGITS));
                      setMobileTouched(true);
                      if (error) {
                        setError(null);
                      }
                    }}
                    onBlur={() => setMobileTouched(true)}
                  />
                </div>
                {showMobileError ? (
                  <p className="text-xs text-rose-500">{mobileErrorMessage}</p>
                ) : null}
              </label>
              <div className="grid gap-2 text-sm text-[var(--text-muted)]">
                <span>Loyalty tier</span>
                <div className="relative">
                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                    onClick={() => setTierOpen((prev) => !prev)}
                  >
                    <span>{tierLabels[tier]}</span>
                    <span className="text-xs text-[var(--text-muted)]">v</span>
                  </button>
                  {tierOpen ? (
                    <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                      {tiers.map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            level === tier
                              ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                              : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                          }`}
                          onClick={() => {
                            setTier(level);
                            setTierOpen(false);
                          }}
                        >
                          <span>{tierLabels[level]}</span>
                          {level === tier ? (
                            <span className="text-xs text-[var(--text-muted)]">
                              Selected
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    setOpen(false);
                    setName("");
                    setMobile("");
                    setMobileTouched(false);
                    setTier("BRONZE");
                    setTierOpen(false);
                    setEditingClient(null);
                    setError(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  disabled={
                    saving ||
                    !name.trim() ||
                    !isValidLocalMobile(mobile) ||
                    Boolean(
                      editingClient &&
                        name.trim().toLowerCase() ===
                          editingClient.name.trim().toLowerCase() &&
                        buildMobile(mobile) === editingClient.mobile &&
                        tier === editingClient.tier
                    )
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingClient
                      ? "Update Customer"
                      : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${confirmClient?.name ?? "customer"}?`}
        description="This will permanently remove the customer record."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={Boolean(confirmClient && deletingId === confirmClient.id)}
        onCancel={() => {
          if (deletingId) {
            return;
          }
          setConfirmOpen(false);
          setConfirmClient(null);
        }}
        onConfirm={() => {
          if (confirmClient) {
            void handleDelete(confirmClient);
          }
        }}
      />
    </>
  );
}
