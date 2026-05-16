"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Store = {
  id: string;
  name: string;
  code: string;
  city: string;
  status: "ACTIVE" | "PAUSED";
  notes: string | null;
  staffCount: number;
  createdAt: string;
  updatedAt: string;
};

type StoreResponse = {
  items: Store[];
  total: number;
  activeCount: number;
  totalStaff: number;
  page: number;
  pageSize: number;
};

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
] as const;

export default function StoresPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [statusValue, setStatusValue] = useState<"ACTIVE" | "PAUSED">("ACTIVE");
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeNotes, setStoreNotes] = useState("");
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [items, setItems] = useState<Store[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [totalStaff, setTotalStaff] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const shouldLock = isModalOpen || isDeleteOpen;
    if (shouldLock) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [isModalOpen, isDeleteOpen]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const isFormValid = Boolean(
    storeName.trim() && storeCode.trim() && storeCity.trim() && statusValue
  );
  const isUnchanged = Boolean(
    editingStore &&
      storeName.trim() === editingStore.name &&
      storeCode.trim() === editingStore.code &&
      storeCity.trim() === editingStore.city &&
      (storeNotes.trim() || "") === (editingStore.notes ?? "") &&
      statusValue === editingStore.status
  );

  const loadStores = useCallback(async () => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setListError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/stores?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: StoreResponse | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load stores");
      }

      if (requestIdRef.current === currentRequestId) {
        setItems(payload.data.items);
        setTotal(payload.data.total);
        setActiveCount(payload.data.activeCount);
        setTotalStaff(payload.data.totalStaff);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setListError(
        err instanceof Error ? err.message : "Unable to load store data."
      );
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    loadStores();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadStores, reloadToken]);

  function resetForm() {
    setStoreName("");
    setStoreCode("");
    setStoreCity("");
    setStoreNotes("");
    setStatusValue("ACTIVE");
    setIsStatusOpen(false);
    setEditingStore(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!isFormValid) {
      setFormError("Please fill all required fields.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const isEditing = Boolean(editingStore);
      const response = await fetch("/api/stores", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(isEditing ? { id: editingStore?.id } : {}),
          name: storeName.trim(),
          code: storeCode.trim(),
          city: storeCity.trim(),
          status: statusValue,
          notes: storeNotes.trim() ? storeNotes.trim() : null,
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save store.");
      }

      setIsModalOpen(false);
      resetForm();
      if (page !== 1) {
        setPage(1);
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save store.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingStore) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/stores", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: deletingStore.id }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to delete store.");
      }

      setIsDeleteOpen(false);
      setDeletingStore(null);
      setReloadToken((value) => value + 1);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to delete store."
      );
    } finally {
      setDeleting(false);
    }
  }

  const statusLabel =
    statusOptions.find((option) => option.value === statusValue)?.label ??
    "Active";
  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Operations
          </p>
          <h2 className="text-2xl font-semibold">Stores</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage locations and scope operational activity by store.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]">
            Export
          </button>
          <button
            className="h-10 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:opacity-90"
            onClick={() => {
              resetForm();
              setFormError(null);
              setListError(null);
              setIsModalOpen(true);
            }}
          >
            Add Store
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Active Stores
          </p>
          <p className="mt-3 text-3xl font-semibold">{activeCount}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Operational in the last 7 days.
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Total Staff
          </p>
          <p className="mt-3 text-3xl font-semibold">{totalStaff}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Assigned across all locations.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">Locations</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 w-56 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Search stores"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <button className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)]">
              Filter
            </button>
          </div>
        </div>

        {listError ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
            {listError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {loading ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Loading stores...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No stores found.
            </div>
          ) : (
            items.map((store) => (
              <div
                key={store.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-4 text-sm"
              >
                <div className="min-w-[180px]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {store.code}
                  </p>
                  <p className="mt-1 font-semibold">{store.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {store.city}
                  </p>
                  {store.notes ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {store.notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-6 text-xs text-[var(--text-muted)]">
                  <span>Staff: {store.staffCount}</span>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      store.status === "ACTIVE"
                        ? "bg-emerald-400/15 text-emerald-400"
                        : "bg-amber-400/15 text-amber-400"
                    }`}
                  >
                    {store.status === "ACTIVE" ? "Active" : "Paused"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="h-9 rounded-full border border-[var(--stroke)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                    onClick={() => {
                      setEditingStore(store);
                      setStoreName(store.name);
                      setStoreCode(store.code);
                      setStoreCity(store.city);
                      setStoreNotes(store.notes ?? "");
                      setStatusValue(store.status);
                      setFormError(null);
                      setIsModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-500 transition hover:bg-rose-500/20"
                    onClick={() => {
                      setDeletingStore(store);
                      setIsDeleteOpen(true);
                      setFormError(null);
                    }}
                  >
                    Delete
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

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  New Location
                </p>
                <h3 className="mt-2 text-xl font-semibold">Create Store</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Add a new store to organize staff, repairs, and invoices by location.
                </p>
              </div>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleSave}>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                <span>
                  Store Name <span className="text-rose-400">*</span>
                </span>
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  placeholder="Colombo Workshop"
                  type="text"
                  required
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span>
                    Store Code <span className="text-rose-400">*</span>
                  </span>
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    placeholder="CMB"
                    type="text"
                    required
                  value={storeCode}
                  onChange={(event) => setStoreCode(event.target.value)}
                />
              </label>
                <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span>
                    City <span className="text-rose-400">*</span>
                  </span>
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                    placeholder="Colombo"
                    type="text"
                    required
                  value={storeCity}
                  onChange={(event) => setStoreCity(event.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <span>
                Status <span className="text-rose-400">*</span>
              </span>
              <div className="relative">
                <button
                  type="button"
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                    onClick={() => setIsStatusOpen((open) => !open)}
                    aria-expanded={isStatusOpen}
                  >
                    <span>{statusLabel}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {isStatusOpen ? "Close" : "Select"}
                    </span>
                  </button>
                  {isStatusOpen ? (
                    <div className="absolute z-10 mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                      {statusOptions.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                            statusValue === status.value
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "text-[var(--foreground)] hover:bg-[var(--panel-muted)]"
                          }`}
                          onClick={() => {
                            setStatusValue(status.value);
                            setIsStatusOpen(false);
                          }}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Notes
                <textarea
                  className="min-h-[96px] rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
                  placeholder="Add pickup hours or special instructions."
                  value={storeNotes}
                  onChange={(event) => setStoreNotes(event.target.value)}
                />
              </label>
              {formError ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {formError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] px-5 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel-muted)]"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                    setFormError(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-10 rounded-full bg-[var(--accent)] px-6 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--panel-muted)] disabled:text-[var(--text-muted)]"
                  disabled={!isFormValid || saving || isUnchanged}
                >
                  {saving
                    ? "Saving..."
                    : editingStore
                      ? "Update Store"
                      : "Save Store"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteOpen && deletingStore ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-2xl">
            <h3 className="text-xl font-semibold">Delete store</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              This will remove{" "}
              <span className="font-semibold text-[var(--foreground)]">
                {deletingStore.name}
              </span>{" "}
              from the store list.
            </p>
            {formError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                {formError}
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setDeletingStore(null);
                  setFormError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-500 transition hover:bg-rose-500/20 disabled:cursor-not-allowed"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
