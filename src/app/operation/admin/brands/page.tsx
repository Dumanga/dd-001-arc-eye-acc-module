"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Brand = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type BrandResponse = {
  items: Brand[];
  total: number;
  latestBrandName: string | null;
  latestBrandCreatedAt: string | null;
  page: number;
  pageSize: number;
};

export default function BatBrandsPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [latestBrandName, setLatestBrandName] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState("");
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const loadBrands = useCallback(async () => {
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

      const response = await fetch(`/api/brands?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: BrandResponse | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load brands");
      }

      if (requestIdRef.current === currentRequestId) {
        setItems(payload.data.items);
        setTotal(payload.data.total);
        setLatestBrandName(payload.data.latestBrandName);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        err instanceof Error ? err.message : "Unable to load brand data."
      );
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    loadBrands();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadBrands, reloadToken]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = newBrand.trim();
    if (!trimmedName) {
      setError("Brand name is required.");
      return;
    }
    if (
      editingBrand &&
      trimmedName.toLowerCase() === editingBrand.name.trim().toLowerCase()
    ) {
      setError("Brand name is unchanged.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isEditing = Boolean(editingBrand);
      const response = await fetch("/api/brands", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isEditing
            ? { id: editingBrand?.id, name: trimmedName }
            : { name: trimmedName }
        ),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save brand.");
      }

      const shouldResetPage = !isEditing && page !== 1;
      setOpen(false);
      setNewBrand("");
      setEditingBrand(null);
      if (shouldResetPage) {
        setPage(1);
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save brand.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Master Data
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Bat Brands</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Manage brand master data used in repair intake.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="h-10 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-black transition hover:opacity-90"
            onClick={() => {
              setEditingBrand(null);
              setNewBrand("");
              setError(null);
              setOpen(true);
            }}
          >
            Add Brand
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Total brands
          </p>
          <p className="mt-3 text-2xl font-semibold">{total}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Showing page {page} of {totalPages}
          </p>
        </div>
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Recently added
          </p>
          <p className="mt-3 text-2xl font-semibold">
            {latestBrandName ?? "-"}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Latest added brand
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Brand list
            </p>
            <h3 className="mt-2 text-xl font-semibold">Tracked brands</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <span className="sr-only">Search brands</span>
              <input
                className="h-9 w-44 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Search"
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {loading ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Loading brands...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No brands found.
            </div>
          ) : (
            items.map((brand) => (
              <div
                key={brand.id}
                className="grid items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 sm:grid-cols-[1.6fr_0.6fr_0.4fr]"
              >
                <div>
                  <p className="text-sm font-semibold">{brand.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Updated {new Date(brand.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-sm text-[var(--text-muted)]">-</div>
                <button
                  className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel-muted)] sm:justify-self-end"
                  onClick={() => {
                    setEditingBrand(brand);
                    setNewBrand(brand.name);
                    setError(null);
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {editingBrand ? "Edit Brand" : "New Brand"}
                </p>
                <h3 className="mt-2 text-xl font-semibold">
                  {editingBrand ? "Update bat brand" : "Add bat brand"}
                </h3>
              </div>
            </div>
            <form className="mt-6 grid gap-4" onSubmit={handleSave}>
              <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                Bat brand name
                <input
                  className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Enter brand name"
                  type="text"
                  value={newBrand}
                  onChange={(event) => {
                    setNewBrand(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    setOpen(false);
                    setEditingBrand(null);
                    setNewBrand("");
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
                    !newBrand.trim() ||
                    Boolean(
                      editingBrand &&
                        newBrand.trim().toLowerCase() ===
                          editingBrand.name.trim().toLowerCase()
                    )
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingBrand
                      ? "Update Brand"
                      : "Save Brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
