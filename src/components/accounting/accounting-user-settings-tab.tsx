"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

type BranchOption = { id: string; name: string; code: string };
type Role = "SUPER_ADMIN" | "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";
type AccessKey =
  | "dashboard"
  | "suppliers"
  | "customers"
  | "inventory"
  | "accounts"
  | "reports"
  | "pos"
  | "settings";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  profileImageId: number;
  storeId: string | null;
  store: { id: string; name: string } | null;
  accessDashboard: boolean;
  accessSuppliers: boolean;
  accessCustomers: boolean;
  accessInventory: boolean;
  accessAccounts: boolean;
  accessReports: boolean;
  accessPos: boolean;
  accessSettings: boolean;
};

type UsersResponse = {
  items: User[];
  total: number;
  superAdminCount: number;
  staffCount: number;
  page: number;
  pageSize: number;
};

const roles = [
  { value: "CASHIER", label: "Cashier" },
  { value: "DATA_ENTRY", label: "Data Entry" },
  { value: "SUPERVISOR", label: "Supervisor" },
] as const;

const accessOptions = [
  { key: "dashboard", label: "Dashboard" },
  { key: "suppliers", label: "Suppliers" },
  { key: "customers", label: "Customers" },
  { key: "inventory", label: "Inventory" },
  { key: "accounts", label: "Accounts" },
  { key: "reports", label: "Reports" },
  { key: "pos", label: "POS" },
  { key: "settings", label: "Settings" },
] as const;

const profileImages = [1, 2, 3, 4, 5] as const;

function accessList(user: User) {
  const items: AccessKey[] = [];
  if (user.accessDashboard) items.push("dashboard");
  if (user.accessSuppliers) items.push("suppliers");
  if (user.accessCustomers) items.push("customers");
  if (user.accessInventory) items.push("inventory");
  if (user.accessAccounts) items.push("accounts");
  if (user.accessReports) items.push("reports");
  if (user.accessPos) items.push("pos");
  if (user.accessSettings) items.push("settings");
  return items;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#5c544d]">
      {label}
      {children}
    </label>
  );
}

export function AccountingUserSettingsTab({
  branches,
  branchesLoading,
  branchPageError,
}: {
  branches: BranchOption[];
  branchesLoading: boolean;
  branchPageError: string | null;
}) {
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [superAdminCount, setSuperAdminCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]["value"]>("CASHIER");
  const [roleOpen, setRoleOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [profileImageId, setProfileImageId] = useState(1);
  const [accessSelected, setAccessSelected] = useState<AccessKey[]>(["dashboard"]);
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const lock = open || Boolean(confirmUser);
    if (!lock) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [confirmUser, open]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPageError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) params.set("search", search.trim());
    void fetch(`/api/users?${params.toString()}`, {
      signal: controller.signal,
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as { success: boolean; message: string; data: UsersResponse | null };
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.message || "Unable to load accounting users.");
        if (requestIdRef.current !== requestId) return;
        setItems(payload.data.items);
        setTotal(payload.data.total);
        setSuperAdminCount(payload.data.superAdminCount);
        setStaffCount(payload.data.staffCount);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPageError(error instanceof Error ? error.message : "Unable to load accounting users.");
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
    return () => controller.abort();
  }, [page, reloadToken, search]);

  function resetForm() {
    setEditingUser(null);
    setDisplayName("");
    setUsername("");
    setPassword("");
    setRole("CASHIER");
    setRoleOpen(false);
    setStoreId(branches[0]?.id ?? "");
    setBranchOpen(false);
    setProfileImageId(1);
    setAccessSelected(["dashboard"]);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setDisplayName(user.displayName);
    setUsername(user.username);
    setPassword("");
    setRole(user.role === "SUPER_ADMIN" ? "CASHIER" : user.role);
    setStoreId(user.storeId ?? "");
    setProfileImageId(user.profileImageId);
    setAccessSelected(accessList(user));
    setFormError(null);
    setOpen(true);
  }

  function toggleAccess(key: AccessKey) {
    setAccessSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  async function saveUser() {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/users", {
        method: editingUser ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({ id: editingUser?.id, displayName: displayName.trim(), username: username.trim(), password: password.trim(), role, profileImageId, storeId, access: accessSelected }),
      });
      const payload = (await response.json()) as { success: boolean; message: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save accounting user.");
      setOpen(false);
      resetForm();
      if (!editingUser && page !== 1) setPage(1);
      else setReloadToken((current) => current + 1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save accounting user.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: User) {
    setDeletingId(user.id);
    setPageError(null);
    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-portal": "ACCOUNTING" },
        body: JSON.stringify({ id: user.id }),
      });
      const payload = (await response.json()) as { success: boolean; message: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to delete accounting user.");
      if (items.length === 1 && page > 1) setPage((current) => Math.max(1, current - 1));
      else setReloadToken((current) => current + 1);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to delete accounting user.");
    } finally {
      setDeletingId(null);
      setConfirmUser(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedBranch = branches.find((branch) => branch.id === storeId);
  const hasUsers = items.length > 0;

  function reloadUsers() {
    setLoading(true);
    setPageError(null);
    setReloadToken((current) => current + 1);
  }

  return (
    <>
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">Users</p>
            <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">Accounting User Management</h3>
            <p className="mt-2 text-sm text-[#746b64]">Create, edit, and review accounting-side staff accounts using the dedicated accounting user table.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#ff7a12] px-5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]">Add User</button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-[#ece3db] bg-[linear-gradient(180deg,#fff9f2_0%,#fffdf9_100%)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">Total Users</p><p className="mt-3 text-3xl font-semibold text-[#1f1d1c]">{String(total).padStart(2, "0")}</p></div>
          <div className="rounded-[24px] border border-[#ece3db] bg-[linear-gradient(180deg,#fff8f6_0%,#fffdfb_100%)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">Super Admins</p><p className="mt-3 text-3xl font-semibold text-[#1f1d1c]">{String(superAdminCount).padStart(2, "0")}</p></div>
          <div className="rounded-[24px] border border-[#ece3db] bg-[linear-gradient(180deg,#f7fbff_0%,#fffdf9_100%)] p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">Staff Accounts</p><p className="mt-3 text-3xl font-semibold text-[#1f1d1c]">{String(staffCount).padStart(2, "0")}</p></div>
        </div>

        <div className="mt-5 rounded-[26px] border border-[#e8dfd6] bg-[#fcfaf7] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-sm font-semibold text-[#1f1d1c]">User list</p><p className="mt-1 text-sm text-[#786f69]">Manage the accounting login accounts and assigned module access.</p></div>
            <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8f85]" /><input type="text" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or username" className="w-[280px] max-w-full rounded-2xl border border-[#e2d8cf] bg-white py-3 pl-11 pr-4 text-sm text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]" /></label>
          </div>
          {branchPageError ? <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">{branchPageError}</div> : null}
          {pageError && hasUsers ? <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">{pageError}</div> : null}
          {loading && hasUsers ? <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#f1e0d0] bg-[#fff8f1] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#a86721]"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#ff7101]" />Refreshing user list</div> : null}

          <div className="mt-5 grid gap-3">
            {!hasUsers && loading ? <div className="flex items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-10 text-sm text-[#786f69]"><Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />Loading accounting users...</div> : !hasUsers && pageError ? <div className="rounded-[22px] border border-dashed border-[#f0cfc6] bg-[#fff8f6] px-4 py-8 text-center"><p className="text-base font-semibold text-[#7b3323]">Unable to load accounting users.</p><p className="mt-2 text-sm text-[#946557]">{pageError}</p><button type="button" onClick={reloadUsers} className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#f2bcae] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#b94f37] transition hover:bg-[#fff2ee]">Retry</button></div> : !hasUsers ? <div className="rounded-[22px] border border-dashed border-[#e3d8ce] bg-[#fffaf5] px-4 py-8 text-center"><p className="text-base font-semibold text-[#1f1d1c]">No accounting users found.</p><p className="mt-2 text-sm text-[#786f69]">Add the first accounting staff account to begin managing access here.</p></div> : items.map((user) => (
              <div key={user.id} className="grid items-center gap-4 rounded-[22px] border border-[#e7ddd4] bg-[linear-gradient(180deg,#fffdfa_0%,#fffaf5_100%)] px-4 py-4 lg:grid-cols-[1.5fr_0.9fr_0.9fr_auto]">
                <div className="flex min-w-0 items-center gap-3"><div className="h-14 w-14 overflow-hidden rounded-[18px] border border-[#eadfd6] bg-white"><Image src={`/assets/profile-imgs/${user.profileImageId}.png`} alt={`${user.displayName} profile`} width={56} height={56} className="h-full w-full object-cover" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#1f1d1c]">{user.displayName}</p><p className="mt-1 truncate text-sm text-[#776d67]">{user.username}</p></div></div>
                <div><div className="inline-flex rounded-full border border-[#ffe0c3] bg-[#fff3e6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b45b12]">{roles.find((item) => item.value === user.role)?.label ?? user.role}</div><p className="mt-2 text-sm text-[#776d67]">{user.role === "SUPER_ADMIN" ? "Full accounting control" : "Assigned accounting role"}</p></div>
                <div><p className="text-sm font-semibold text-[#1f1d1c]">{user.role === "SUPER_ADMIN" ? "All branches" : user.store?.name ?? "-"}</p><p className="mt-1 text-sm text-[#776d67]">{user.role === "SUPER_ADMIN" ? "All module access" : "Custom module access"}</p></div>
                <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => openEdit(user)} disabled={user.role === "SUPER_ADMIN"} className="rounded-xl border border-[#ddd8d1] bg-white px-3 py-2 text-sm font-semibold text-[#5f5751] disabled:cursor-not-allowed disabled:bg-[#f3ece4] disabled:text-[#a09388]">Edit User</button><button type="button" onClick={() => setConfirmUser(user)} disabled={user.role === "SUPER_ADMIN" || deletingId === user.id} className="rounded-xl border border-[#f1d2c8] bg-[#fff4f1] px-3 py-2 text-sm font-semibold text-[#b94f37] disabled:cursor-not-allowed disabled:opacity-60">{deletingId === user.id ? "Deleting..." : "Delete"}</button></div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ece4db] pt-4 text-sm text-[#786f69]">
            <div>Showing {total ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, total)} of {total}</div>
            <div className="flex items-center gap-2"><div>Page <span className="font-semibold text-[#1f1d1c]">{page}</span> of {totalPages}</div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${page <= 1 || loading ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]" : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"}`}>Prev</button><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${page >= totalPages || loading ? "cursor-not-allowed bg-[#f3ece4] text-[#a09388]" : "border border-[#e2d8cf] bg-white text-[#5f5750] hover:bg-[#fff7f0]"}`}>Next</button></div>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,27,23,0.45)] px-4 py-6">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.18)]">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">{editingUser ? "Edit User" : "New User"}</p><h3 className="mt-2 font-sans text-2xl font-semibold text-[#1f1d1c]">{editingUser ? "Update accounting staff account" : "Add accounting staff account"}</h3></div><button type="button" onClick={() => { setOpen(false); resetForm(); }} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e2d8cf] bg-white text-[#6d665f] transition hover:bg-[#f4efe9]"><X className="h-4 w-4" /></button></div>
            <form className="mt-6 grid gap-5" onSubmit={(event) => { event.preventDefault(); if (!displayName.trim() || !username.trim()) { setFormError("Name and username are required."); return; } if (!editingUser && !password.trim()) { setFormError("Password is required."); return; } if (!storeId) { setFormError("Branch assignment is required."); return; } if (accessSelected.length === 0) { setFormError("Select at least one access area."); return; } if (accessSelected.length === accessOptions.length) { setFormError("All access cannot be selected. Use Super Admin instead."); return; } void saveUser(); }}>
              {formError ? <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">{formError}</div> : null}
              <div className="grid gap-4 md:grid-cols-2"><Field label="Full name"><input className="settings-input" value={displayName} onChange={(event) => { setDisplayName(event.target.value); if (formError) setFormError(null); }} /></Field><Field label="Username"><input className="settings-input" value={username} onChange={(event) => { setUsername(event.target.value); if (formError) setFormError(null); }} /></Field></div>
              <div className="grid gap-4 md:grid-cols-2"><Field label="Password"><input type="password" className="settings-input" placeholder={editingUser ? "Leave blank to keep current password" : "Set a password"} value={password} onChange={(event) => { setPassword(event.target.value); if (formError) setFormError(null); }} /></Field><div className="grid gap-2"><span className="text-sm font-semibold text-[#5c544d]">Role</span><div className="relative"><button type="button" onClick={() => setRoleOpen((current) => !current)} className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"><span>{roles.find((item) => item.value === role)?.label ?? role}</span><ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${roleOpen ? "rotate-180" : ""}`} /></button>{roleOpen ? <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">{roles.map((item) => <button key={item.value} type="button" onClick={() => { setRole(item.value); setRoleOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${item.value === role ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"}`}><span>{item.label}</span>{item.value === role ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}</button>)}</div> : null}</div></div></div>
              <div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><span className="text-sm font-semibold text-[#5c544d]">Branch</span><div className="relative"><button type="button" onClick={() => setBranchOpen((current) => !current)} disabled={branchesLoading || branches.length === 0} className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe] disabled:cursor-not-allowed disabled:bg-[#f7f2ec] disabled:text-[#a2978c]"><span>{selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : branchesLoading ? "Loading branches..." : "Select branch"}</span><ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${branchOpen ? "rotate-180" : ""}`} /></button>{branchOpen ? <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">{branches.length === 0 ? <div className="px-3 py-2.5 text-sm text-[#8b7f75]">No branches available.</div> : branches.map((branch) => <button key={branch.id} type="button" onClick={() => { setStoreId(branch.id); setBranchOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${branch.id === storeId ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"}`}><span>{branch.name} ({branch.code})</span>{branch.id === storeId ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}</button>)}</div> : null}</div></div></div>
              <div className="grid gap-3"><p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">Profile Image</p><div className="grid grid-cols-5 gap-3">{profileImages.map((imageId) => <button key={imageId} type="button" onClick={() => setProfileImageId(imageId)} className={`overflow-hidden rounded-[20px] border bg-white p-2 transition ${imageId === profileImageId ? "border-[#ff9d60] bg-[#fff5ee]" : "border-[#e2d8cf] hover:border-[#ffcfaa]"}`}><div className="overflow-hidden rounded-[16px]"><Image src={`/assets/profile-imgs/${imageId}.png`} alt={`Profile ${imageId}`} width={72} height={72} className="h-16 w-full object-cover" /></div></button>)}</div></div>
              <div className="grid gap-3"><p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">Access permissions</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accessOptions.map((option) => { const checked = accessSelected.includes(option.key); return <button key={option.key} type="button" onClick={() => toggleAccess(option.key)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${checked ? "border-[#ffb987] bg-[#fff1e4] text-[#b45b12]" : "border-[#e2d8cf] bg-white text-[#5f5751] hover:border-[#ffcfaa] hover:bg-[#fffaf5]"}`}><span>{option.label}</span><span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] ${checked ? "border-[#ff9d60] bg-[#ff7a12] text-white" : "border-[#d9cec5] bg-[#faf6f1] text-transparent"}`}>OK</span></button>; })}</div></div>
              <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => { setOpen(false); resetForm(); }} className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs text-[#6f6761] transition hover:bg-white" disabled={saving}>Cancel</button><button type="submit" disabled={saving || !displayName.trim() || !username.trim() || (!editingUser && !password.trim()) || !storeId || accessSelected.length === 0 || accessSelected.length === accessOptions.length} className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:bg-[#f1a366]">{saving ? "Saving..." : editingUser ? "Update User" : "Save User"}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmUser ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(33,27,23,0.45)] px-4 py-6">
          <div className="w-full max-w-md rounded-[28px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_24px_60px_rgba(44,42,44,0.16)]">
            <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">Confirm Action</p>
            <h3 className="mt-2 text-xl font-semibold text-[#1f1d1c]">Delete {confirmUser.displayName}?</h3>
            <p className="mt-2 text-sm text-[#746b64]">This will permanently remove the accounting user account.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => { if (!deletingId) setConfirmUser(null); }} disabled={Boolean(deletingId)} className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs text-[#6f6761] transition hover:bg-white">Cancel</button><button type="button" onClick={() => void deleteUser(confirmUser)} disabled={Boolean(deletingId)} className="inline-flex h-10 items-center justify-center rounded-full border border-[#f1d2c8] bg-[#fff4f1] px-5 text-xs font-semibold text-[#b94f37] transition hover:bg-[#ffeae5] disabled:opacity-60">{deletingId ? "Deleting..." : "Delete"}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
