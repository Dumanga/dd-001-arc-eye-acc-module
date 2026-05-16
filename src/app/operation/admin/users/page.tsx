"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";

const roles = ["CASHIER", "REPAIR_STAFF"] as const;
const roleLabels: Record<(typeof roles)[number], string> = {
  CASHIER: "Cashier",
  REPAIR_STAFF: "Repair Staff",
};

const accessOptions = [
  { key: "dashboard", label: "Dashboard" },
  { key: "repairs", label: "Repairs" },
  { key: "clients", label: "Clients" },
  { key: "brands", label: "Bat Brands" },
  { key: "users", label: "Users" },
  { key: "stores", label: "Stores" },
  { key: "sms", label: "SMS Portal" },
  { key: "settings", label: "Reports" },
] as const;

type AccessKey = (typeof accessOptions)[number]["key"];

type User = {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "CASHIER" | "REPAIR_STAFF";
  system: "OPERATION" | "ACCOUNTING" | "BOTH";
  profileImageId: number;
  createdAt: string;
  storeId: string | null;
  store: {
    id: string;
    name: string;
  } | null;
  accessDashboard: boolean;
  accessRepairs: boolean;
  accessClients: boolean;
  accessBrands: boolean;
  accessUsers: boolean;
  accessStores: boolean;
  accessSms: boolean;
  accessSettings: boolean;
};

type UserResponse = {
  items: User[];
  total: number;
  superAdminCount: number;
  staffCount: number;
  page: number;
  pageSize: number;
};

type StoreOption = {
  id: string;
  name: string;
};

type StoreResponse = {
  items: StoreOption[];
};

const profileImages = [1, 2, 3, 4, 5];

export default function UsersPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [superAdminCount, setSuperAdminCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("CASHIER");
  const [roleOpen, setRoleOpen] = useState(false);
  const [profileImageId, setProfileImageId] = useState(1);
  const [accessSelected, setAccessSelected] = useState<AccessKey[]>([
    "dashboard",
  ]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeOpen, setStoreOpen] = useState(false);

  useEffect(() => {
    const shouldLock = open || confirmOpen;
    if (shouldLock) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [open, confirmOpen]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const loadUsers = useCallback(async () => {
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

      const response = await fetch(`/api/users?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: UserResponse | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load users");
      }

      if (requestIdRef.current === currentRequestId) {
        setItems(payload.data.items);
        setTotal(payload.data.total);
        setSuperAdminCount(payload.data.superAdminCount);
        setStaffCount(payload.data.staffCount);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to load users.");
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    loadUsers();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadUsers, reloadToken]);

  useEffect(() => {
    let active = true;
    async function loadStores() {
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "200",
        });
        const response = await fetch(`/api/stores?${params.toString()}`);
        const payload = (await response.json()) as {
          success: boolean;
          data: StoreResponse | null;
          message: string;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Unable to load stores.");
        }

        if (active) {
          setStores(payload.data.items);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load stores."
          );
        }
      }
    }

    loadStores();
    return () => {
      active = false;
    };
  }, []);

  function toggleAccess(key: AccessKey) {
    setAccessSelected((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  }

  function buildAccessList(user: User): AccessKey[] {
    const list: AccessKey[] = [];
    if (user.accessDashboard) list.push("dashboard");
    if (user.accessRepairs) list.push("repairs");
    if (user.accessClients) list.push("clients");
    if (user.accessBrands) list.push("brands");
    if (user.accessUsers) list.push("users");
    if (user.accessStores) list.push("stores");
    if (user.accessSms) list.push("sms");
    if (user.accessSettings) list.push("settings");
    return list;
  }

  function resetForm() {
    setDisplayName("");
    setUsername("");
    setPassword("");
    setRole("CASHIER");
    setRoleOpen(false);
    setProfileImageId(1);
    setAccessSelected(["dashboard"]);
    setStoreId("");
    setStoreOpen(false);
    setEditingUser(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !username.trim()) {
      setError("Name and username are required.");
      return;
    }
    if (!editingUser && !password.trim()) {
      setError("Password is required.");
      return;
    }
    if (accessSelected.length === 0) {
      setError("Select at least one access area.");
      return;
    }
    if (accessSelected.length === accessOptions.length) {
      setError("All access cannot be selected. Use Super Admin instead.");
      return;
    }
    if (!storeId) {
      setError("Store assignment is required.");
      return;
    }
    void saveUser();
  }

  async function saveUser() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/users", {
        method: editingUser ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingUser?.id,
          displayName: displayName.trim(),
          username: username.trim(),
          password: password.trim(),
          role,
          profileImageId,
          storeId,
          access: accessSelected,
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save user.");
      }

      const shouldResetPage = !editingUser && page !== 1;
      setOpen(false);
      resetForm();
      if (shouldResetPage) {
        setPage(1);
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: User) {
    setDeletingId(user.id);
    setError(null);

    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: user.id }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to delete user.");
      }

      if (items.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        setReloadToken((value) => value + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete user.");
    } finally {
      setDeletingId(null);
      setConfirmOpen(false);
      setConfirmUser(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Users
          </p>
          <h2 className="mt-2 text-2xl font-semibold">User management</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Manage staff roles, access, and profile images.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="h-10 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-black transition hover:opacity-90"
            onClick={() => {
              resetForm();
              setError(null);
              setOpen(true);
            }}
          >
            Add User
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Total users
          </p>
          <p className="mt-3 text-2xl font-semibold">{total}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Active staff accounts
          </p>
        </div>
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Super admins
          </p>
          <p className="mt-3 text-2xl font-semibold">{superAdminCount}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Highest permissions
          </p>
        </div>
        <div className="animate-rise rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Staff accounts
          </p>
          <p className="mt-3 text-2xl font-semibold">{staffCount}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Cashier and repair staff
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Staff list
            </p>
            <h3 className="mt-2 text-xl font-semibold">Active users</h3>
          </div>
          <label className="relative">
            <span className="sr-only">Search users</span>
            <input
              className="h-9 w-52 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              placeholder="Search name or username"
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
              Loading users...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
              No users found.
            </div>
          ) : (
            items.map((user) => (
              <div
                key={user.id}
                className="grid items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 py-3 sm:grid-cols-[1.5fr_0.8fr_0.7fr_0.6fr_0.6fr]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--panel)]">
                    <img
                      src={`/assets/profile-imgs/${user.profileImageId}.png`}
                      alt={`${user.displayName} profile`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{user.displayName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {user.username}
                    </p>
                  </div>
                </div>
                <div className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">
                  {user.role.replace("_", " ")}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {user.role === "SUPER_ADMIN"
                    ? "All Stores"
                    : user.store?.name ?? "-"}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {user.role === "SUPER_ADMIN" ? "All access" : "Custom access"}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className="h-9 rounded-full border border-[var(--stroke)] bg-[var(--panel)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel-muted)] disabled:opacity-60"
                    disabled={user.role === "SUPER_ADMIN"}
                    onClick={() => {
                      if (user.role === "SUPER_ADMIN") {
                        return;
                      }
                      setEditingUser(user);
                      setDisplayName(user.displayName);
                      setUsername(user.username);
                      setPassword("");
                      setRole(user.role);
                      setRoleOpen(false);
                      setProfileImageId(user.profileImageId);
                      setStoreId(user.storeId ?? "");
                      setStoreOpen(false);
                      setAccessSelected(buildAccessList(user));
                      setError(null);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="h-9 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                    disabled={user.role === "SUPER_ADMIN" || deletingId === user.id}
                    onClick={() => {
                      if (user.role === "SUPER_ADMIN") {
                        return;
                      }
                      setConfirmUser(user);
                      setConfirmOpen(true);
                    }}
                  >
                    {deletingId === user.id ? "Deleting..." : "Delete"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-6 shadow-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {editingUser ? "Edit User" : "New User"}
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {editingUser ? "Update staff account" : "Add staff account"}
              </h3>
            </div>
            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              {error ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-600">
                  {error}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                  Full name
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    placeholder="Enter staff name"
                    type="text"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                  />
                </label>
                <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                  Username
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    placeholder="Email or ID"
                    type="text"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-[var(--text-muted)]">
                  Password
                  <input
                    className="h-11 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    placeholder={
                      editingUser ? "Leave blank to keep" : "Set a password"
                    }
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                  />
                </label>
                <div className="grid gap-2 text-sm text-[var(--text-muted)]">
                  <span>Role</span>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                      onClick={() => setRoleOpen((prev) => !prev)}
                    >
                      <span>{roleLabels[role]}</span>
                      <span className="text-xs text-[var(--text-muted)]">v</span>
                    </button>
                    {roleOpen ? (
                      <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                        {roles.map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                              level === role
                                ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                            }`}
                            onClick={() => {
                              setRole(level);
                              setRoleOpen(false);
                            }}
                          >
                            <span>{roleLabels[level]}</span>
                            {level === role ? (
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
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2 text-sm text-[var(--text-muted)]">
                  <span>
                    Store <span className="text-rose-400">*</span>
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]"
                      onClick={() => setStoreOpen((prev) => !prev)}
                    >
                      <span>
                        {stores.find((store) => store.id === storeId)?.name ??
                          "Select store"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">v</span>
                    </button>
                    {storeOpen ? (
                      <div className="absolute left-0 right-0 z-10 mt-2 max-h-56 overflow-auto rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-2 shadow-xl">
                        {stores.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            No stores available.
                          </div>
                        ) : (
                          stores.map((store) => (
                            <button
                              key={store.id}
                              type="button"
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                                store.id === storeId
                                  ? "bg-[var(--panel-muted)] text-[var(--foreground)]"
                                  : "text-[var(--text-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"
                              }`}
                              onClick={() => {
                                setStoreId(store.id);
                                setStoreOpen(false);
                                if (error) {
                                  setError(null);
                                }
                              }}
                            >
                              <span>{store.name}</span>
                              {store.id === storeId ? (
                                <span className="text-xs text-[var(--text-muted)]">
                                  Selected
                                </span>
                              ) : null}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Profile image
                </p>
                <div className="grid grid-cols-5 gap-3">
                  {profileImages.map((imageId) => (
                    <button
                      key={imageId}
                      type="button"
                      className={`h-14 w-14 overflow-hidden rounded-2xl border transition ${
                        imageId === profileImageId
                          ? "border-[var(--accent)]"
                          : "border-[var(--stroke)] hover:border-[var(--accent)]"
                      }`}
                      onClick={() => setProfileImageId(imageId)}
                    >
                      <img
                        src={`/assets/profile-imgs/${imageId}.png`}
                        alt={`Profile ${imageId}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Access permissions
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {accessOptions.map((option) => {
                    const checked = accessSelected.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          checked
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--stroke)] bg-[var(--panel-muted)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                        }`}
                        onClick={() => {
                          toggleAccess(option.key);
                          if (error) {
                            setError(null);
                          }
                        }}
                      >
                        <span>{option.label}</span>
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                            checked
                              ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                              : "border-[var(--stroke)]"
                          }`}
                        >
                          {checked ? "OK" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="h-10 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs text-[var(--text-muted)] transition hover:bg-[var(--panel)]"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
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
                    !displayName.trim() ||
                    !username.trim() ||
                    (!editingUser && !password.trim()) ||
                    !storeId ||
                    accessSelected.length === 0 ||
                    accessSelected.length === accessOptions.length
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingUser
                      ? "Update User"
                      : "Save User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${confirmUser?.displayName ?? "user"}?`}
        description="This will permanently remove the staff account."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={Boolean(confirmUser && deletingId === confirmUser.id)}
        onCancel={() => {
          if (deletingId) {
            return;
          }
          setConfirmOpen(false);
          setConfirmUser(null);
        }}
        onConfirm={() => {
          if (confirmUser) {
            void handleDelete(confirmUser);
          }
        }}
      />
    </>
  );
}
