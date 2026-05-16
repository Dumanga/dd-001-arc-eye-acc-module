"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  FileDigit,
  Loader2,
  MessageSquareText,
  Shield,
  Users,
  X,
} from "lucide-react";
import { AccountingUserSettingsTab } from "@/components/accounting/accounting-user-settings-tab";
import { StatusToast, type ToastState } from "@/components/accounting/accounting-ui";

const tabs = [
  { id: "branches", label: "Branches", icon: Building2 },
  { id: "users", label: "User Settings", icon: Users },
  { id: "remarks", label: "Remarks", icon: MessageSquareText },
  { id: "formIds", label: "Form ID Config", icon: FileDigit },
] as const;

type TabId = (typeof tabs)[number]["id"];

type Branch = {
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

type BranchResponse = {
  items: Branch[];
  total: number;
  activeCount: number;
  totalStaff: number;
  page: number;
  pageSize: number;
};

type ViewerRole = "SUPER_ADMIN" | "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";

const branchStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
] as const;

type RemarkConfig = {
  documentType: string;
  label: string;
  content: string;
};

type FormIdConfig = {
  formType: string;
  label: string;
  code: string;
  yearToken: string;
  rangeFrom: string;
  rangeTo: string;
  nextNumber: string;
};

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const isActive = normalized.includes("active");
  const isPending = normalized.includes("pending");

  const className = isActive
    ? "border-[#bfe4cf] bg-[linear-gradient(180deg,#f6fdf8_0%,#ebfaf1_100%)] text-[#176445]"
    : isPending
      ? "border-[#ffd3b6] bg-[linear-gradient(180deg,#fffaf6_0%,#fff1e6_100%)] text-[#b56219]"
      : "border-[#d8d8df] bg-[linear-gradient(180deg,#fbfbfd_0%,#f1f2f6_100%)] text-[#5f6272]";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] shadow-[0_6px_16px_rgba(31,29,28,0.04)] ${className}`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isActive ? "bg-[#18a66a]" : isPending ? "bg-[#ff8a1d]" : "bg-[#7d8194]"
        }`}
      />
      {status}
    </span>
  );
}

function formatBranchStatus(status: Branch["status"]) {
  return status === "ACTIVE" ? "Active" : "Paused";
}

export default function AccountingSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("branches");
  const [viewerRole, setViewerRole] = useState<ViewerRole | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchTotal, setBranchTotal] = useState(0);
  const [activeBranchCount, setActiveBranchCount] = useState(0);
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchPageError, setBranchPageError] = useState<string | null>(null);
  const [branchReloadToken, setBranchReloadToken] = useState(0);
  const branchAbortRef = useRef<AbortController | null>(null);
  const branchRequestIdRef = useRef(0);

  useEffect(() => {
    let active = true;

    void fetch("/api/auth/me", {
      headers: {
        "x-portal": "ACCOUNTING",
      },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data:
            | {
                role: ViewerRole;
              }
            | null;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error("Unable to resolve accounting session.");
        }

        if (active) {
          setViewerRole(payload.data.role);
        }
      })
      .catch(() => {
        if (active) {
          setViewerRole(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const currentRequestId = branchRequestIdRef.current + 1;
    branchRequestIdRef.current = currentRequestId;

    branchAbortRef.current?.abort();
    const controller = new AbortController();
    branchAbortRef.current = controller;

    void fetch("/api/stores?page=1&pageSize=50", {
      signal: controller.signal,
      headers: {
        "x-portal": "ACCOUNTING",
      },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          data: BranchResponse | null;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Failed to load branches.");
        }

        if (branchRequestIdRef.current !== currentRequestId) {
          return;
        }

        setBranches(payload.data.items);
        setBranchTotal(payload.data.total);
        setActiveBranchCount(payload.data.activeCount);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setBranchPageError(
          error instanceof Error ? error.message : "Unable to load branch data."
        );
      })
      .finally(() => {
        if (branchRequestIdRef.current === currentRequestId) {
          setBranchLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [branchReloadToken]);

  function reloadBranches() {
    setBranchLoading(true);
    setBranchPageError(null);
    setBranchReloadToken((current) => current + 1);
  }

  const visibleTabs =
    viewerRole === "SUPER_ADMIN"
      ? tabs
      : tabs.filter((tab) => tab.id !== "users");

  return (
    <div className="grid content-start gap-6 self-start">
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <p className="inline-flex rounded-full border border-[#ffd9bb] bg-[#fff8f2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#ff7101]">
          Settings
        </p>
      </div>

      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[#1f1d1c] p-3 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#ff7101]">
                Super Admin Only
              </p>
              <p className="mt-1 text-sm text-[#746b64]">
                Only super admins can manage branch structure, defaults, and numbering behavior.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                  isActive
                    ? "border-[#ff9d60] bg-[#fff1e4] text-[#ff7101]"
                    : "border-[#e5ddd4] bg-[#fcfaf7] text-[#5f5751] hover:bg-[#faf6f1]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "branches" ? (
        <BranchesTab
          activeBranchCount={activeBranchCount}
          branches={branches}
          loading={branchLoading}
          pageError={branchPageError}
          total={branchTotal}
          onSaved={reloadBranches}
        />
      ) : null}
      {activeTab === "users" ? (
        <UserSettingsTab
          branches={branches}
          branchesLoading={branchLoading}
          branchPageError={branchPageError}
        />
      ) : null}
      {activeTab === "remarks" ? <RemarksTab /> : null}
      {activeTab === "formIds" ? <FormIdTab /> : null}
    </div>
  );
}

function BranchesTab({
  branches,
  loading,
  pageError,
  total,
  activeBranchCount,
  onSaved,
}: {
  branches: Branch[];
  loading: boolean;
  pageError: string | null;
  total: number;
  activeBranchCount: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [branchNotes, setBranchNotes] = useState("");
  const [statusValue, setStatusValue] = useState<Branch["status"]>("ACTIVE");
  const [statusOpen, setStatusOpen] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const hasBranches = branches.length > 0;

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function resetBranchForm() {
    setEditingBranch(null);
    setBranchName("");
    setBranchCode("");
    setBranchCity("");
    setBranchNotes("");
    setStatusValue("ACTIVE");
    setStatusOpen(false);
    setBranchError(null);
  }

  function openCreate() {
    resetBranchForm();
    setOpen(true);
  }

  function openEdit(branch: Branch) {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchCode(branch.code);
    setBranchCity(branch.city);
    setBranchNotes(branch.notes ?? "");
    setStatusValue(branch.status);
    setStatusOpen(false);
    setBranchError(null);
    setOpen(true);
  }

  async function handleBranchSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!branchName.trim() || !branchCode.trim() || !branchCity.trim()) {
      setBranchError("Branch name, branch code, and city are required.");
      return;
    }

    if (
      editingBranch &&
      editingBranch.name === branchName.trim() &&
      editingBranch.code === branchCode.trim().toUpperCase() &&
      editingBranch.city === branchCity.trim() &&
      (editingBranch.notes ?? "") === branchNotes.trim() &&
      editingBranch.status === statusValue
    ) {
      setBranchError("No changes to save.");
      return;
    }

    setSaving(true);
    setBranchError(null);

    try {
      const response = await fetch("/api/stores", {
        method: editingBranch ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify({
          ...(editingBranch ? { id: editingBranch.id } : {}),
          name: branchName.trim(),
          code: branchCode.trim().toUpperCase(),
          city: branchCity.trim(),
          status: statusValue,
          notes: branchNotes.trim() ? branchNotes.trim() : null,
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save branch.");
      }

      const isEditing = Boolean(editingBranch);
      setOpen(false);
      resetBranchForm();
      onSaved();
      setToast({
        tone: "success",
        message: isEditing ? "Branch updated successfully." : "Branch created successfully.",
      });
    } catch (error) {
      setBranchError(
        error instanceof Error ? error.message : "Unable to save branch."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
            Branches
          </p>
          <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
            Branch Management
          </h3>
          <p className="mt-2 text-sm text-[#746b64]">
            Manage the shared branch register used by both the operations system and the accounting admin panel.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#ff7a12] px-5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Add Branch
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[26px] border border-[#ece3db] bg-[linear-gradient(180deg,#fff9f2_0%,#fffdf9_100%)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
            Total Branches
          </p>
          <p className="mt-3 text-3xl font-semibold text-[#1f1d1c]">
            {String(total).padStart(2, "0")}
          </p>
          <p className="mt-2 text-sm text-[#786f69]">
            Shared store records currently available to accounting.
          </p>
        </div>
        <div className="rounded-[26px] border border-[#ece3db] bg-[linear-gradient(180deg,#fffdf8_0%,#f8fff9_100%)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
            Active Branches
          </p>
          <p className="mt-3 text-3xl font-semibold text-[#1f1d1c]">
            {String(activeBranchCount).padStart(2, "0")}
          </p>
          <p className="mt-2 text-sm text-[#786f69]">
            Branches currently marked active in the shared register.
          </p>
        </div>
      </div>

      {pageError && hasBranches ? (
        <div className="mt-5 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          {pageError}
        </div>
      ) : null}
      {loading && hasBranches ? (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#f1e0d0] bg-[#fff8f1] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#a86721]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ff7101]" />
          Refreshing branch register
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        {!hasBranches && loading ? (
          <div className="flex items-center justify-center gap-3 rounded-[24px] border border-dashed border-[#e6dfd8] bg-[#fcfaf7] px-4 py-10 text-sm text-[#786f69]">
            <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
            Loading branch register...
          </div>
        ) : !hasBranches && pageError ? (
          <div className="rounded-[24px] border border-dashed border-[#f0cfc6] bg-[#fff8f6] px-4 py-8 text-center">
            <p className="text-base font-semibold text-[#7b3323]">Unable to load branches.</p>
            <p className="mt-2 text-sm text-[#946557]">{pageError}</p>
            <button
              type="button"
              onClick={onSaved}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#f2bcae] bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#b94f37] transition hover:bg-[#fff2ee]"
            >
              Retry
            </button>
          </div>
        ) : !hasBranches ? (
          <div className="rounded-[24px] border border-dashed border-[#e6dfd8] bg-[#fcfaf7] px-4 py-8 text-center">
            <p className="text-base font-semibold text-[#1f1d1c]">No branches found.</p>
            <p className="mt-2 text-sm text-[#786f69]">
              Add the first branch to start using the shared store register in accounting.
            </p>
          </div>
        ) : (
          branches.map((branch) => (
            <div
              key={branch.id}
              className="rounded-2xl border border-[#e6dfd8] bg-[#fcfaf7] p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="font-sans text-lg font-semibold text-[#1f1d1c]">
                      {branch.name}
                    </h4>
                    <span className="rounded-full bg-[#fff1e4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff7101]">
                      {branch.code}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#776d67]">City: {branch.city}</p>
                  {branch.notes ? (
                    <p className="mt-1 text-sm text-[#776d67]">Notes: {branch.notes}</p>
                  ) : (
                    <p className="mt-1 text-sm text-[#a0958a]">
                      No branch notes added yet.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill status={formatBranchStatus(branch.status)} />
                  <button
                    type="button"
                    onClick={() => openEdit(branch)}
                    className="rounded-xl border border-[#ddd8d1] bg-white px-3 py-2 text-sm font-semibold text-[#5f5751]"
                  >
                    Edit Branch
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    {open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,27,23,0.45)] px-4 py-6">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.18)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
                {editingBranch ? "Edit Branch" : "New Branch"}
              </p>
              <h3 className="mt-2 font-sans text-2xl font-semibold text-[#1f1d1c]">
                {editingBranch ? "Update shared branch" : "Create accounting branch"}
              </h3>
              <p className="mt-2 text-sm text-[#746b64]">
                Save branch details directly to the shared store table already used by the operation system.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                resetBranchForm();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e2d8cf] bg-white text-[#6d665f] transition hover:bg-[#f4efe9]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleBranchSubmit}>
            <Field label="Branch name">
              <input
                className="settings-input"
                placeholder="Colombo 03"
                value={branchName}
                onChange={(event) => {
                  setBranchName(event.target.value);
                  if (branchError) setBranchError(null);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch code">
                <input
                  className="settings-input"
                  placeholder="CMB03"
                  value={branchCode}
                  onChange={(event) => {
                    setBranchCode(event.target.value.toUpperCase());
                    if (branchError) setBranchError(null);
                  }}
                />
              </Field>
              <Field label="City">
                <input
                  className="settings-input"
                  placeholder="Colombo"
                  value={branchCity}
                  onChange={(event) => {
                    setBranchCity(event.target.value);
                    if (branchError) setBranchError(null);
                  }}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[#5c544d]">Status</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusOpen((current) => !current)}
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"
                  >
                    <span>{formatBranchStatus(statusValue)}</span>
                    <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${statusOpen ? "rotate-180" : ""}`} />
                  </button>
                  {statusOpen ? (
                    <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
                      {branchStatusOptions.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          onClick={() => {
                            setStatusValue(status.value);
                            setStatusOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                            status.value === statusValue ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"
                          }`}
                        >
                          <span>{status.label}</span>
                          {status.value === statusValue ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-[#eadfd6] bg-[#fffaf5] px-4 py-3 text-sm text-[#7a7068]">
                Shared table fields are limited to branch name, code, city, status, and notes.
              </div>
            </div>

            <Field label="Notes">
              <textarea
                className="min-h-[110px] rounded-2xl border border-[#e2d8cf] bg-white px-4 py-3 text-sm text-[#1f1d1c] outline-none transition focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                placeholder="Add branch-specific accounting notes or setup instructions."
                value={branchNotes}
                onChange={(event) => setBranchNotes(event.target.value)}
              />
            </Field>

            {branchError ? (
              <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                {branchError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetBranchForm();
                }}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs text-[#6f6761] transition hover:bg-white"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white transition hover:bg-[#ea6a08] disabled:cursor-not-allowed disabled:bg-[#f1a366]"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingBranch
                    ? "Update Branch"
                    : "Save Branch"}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null}
      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
}

function UserSettingsTab({
  branches,
  branchesLoading,
  branchPageError,
}: {
  branches: Branch[];
  branchesLoading: boolean;
  branchPageError: string | null;
}) {
  return (
    <AccountingUserSettingsTab
      branches={branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        code: branch.code,
      }))}
      branchesLoading={branchesLoading}
      branchPageError={branchPageError}
    />
  );
  /*
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof accountingRoles)[number]["value"]>("CASHIER");
  const [roleOpen, setRoleOpen] = useState(false);
  const [branchCode, setBranchCode] = useState("");
  const [branchOpen, setBranchOpen] = useState(false);
  const [profileThemeId, setProfileThemeId] = useState(1);
  const [accessSelected, setAccessSelected] = useState<AccountingAccessKey[]>(["dashboard"]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function resetUserForm() {
    setDisplayName("");
    setUsername("");
    setPassword("");
    setRole("CASHIER");
    setRoleOpen(false);
    setBranchCode(branches[0]?.code ?? "");
    setBranchOpen(false);
    setProfileThemeId(1);
    setAccessSelected(["dashboard"]);
    setError(null);
  }

  function toggleAccess(key: AccountingAccessKey) {
    setAccessSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!displayName.trim() || !username.trim() || !password.trim()) {
      setError("Name, username, and password are required.");
      return;
    }

    if (!branchCode) {
      setError("Branch assignment is required.");
      return;
    }

    if (accessSelected.length === 0) {
      setError("Select at least one access area.");
      return;
    }

    setOpen(false);
    resetUserForm();
  }

  const selectedRoleLabel = accountingRoles.find((item) => item.value === role)?.label ?? "Select role";
  const selectedBranchLabel =
    branches.find((branch) => branch.code === branchCode)?.name ??
    (branchesLoading ? "Loading branches..." : "Select branch");

  return (
    <>
    <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
            Users
          </p>
          <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
            Accounting User Management
          </h3>
          <p className="mt-2 text-sm text-[#746b64]">
            Create and manage accounting-side users, roles, branch assignment, and invite status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetUserForm();
            setOpen(true);
          }}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#ff7a12] px-5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Add User
        </button>
      </div>

      {branchPageError ? (
        <div className="mb-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          {branchPageError}
        </div>
      ) : null}

      <div className="grid gap-4">
        {accountingUsers.map((user) => (
          <div
            key={user.name}
            className="rounded-2xl border border-[#e6dfd8] bg-[#fcfaf7] p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="font-sans text-lg font-semibold text-[#1f1d1c]">
                  {user.name}
                </h4>
                <p className="mt-2 text-sm text-[#776d67]">Role: {user.role}</p>
                <p className="mt-1 text-sm text-[#776d67]">Branch: {user.branch}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill status={user.status} />
                <button
                  type="button"
                  className="rounded-xl border border-[#ddd8d1] bg-white px-3 py-2 text-sm font-semibold text-[#5f5751]"
                >
                  Edit User
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#ff7a12] px-5 text-sm font-semibold text-white transition hover:bg-[#ea6a08]"
        >
          Save User Settings
        </button>
      </div>
    </div>
    {open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,27,23,0.45)] px-4 py-6">
        <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.18)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
                New User
              </p>
              <h3 className="mt-2 font-sans text-2xl font-semibold text-[#1f1d1c]">
                Add accounting staff account
              </h3>
              <p className="mt-2 text-sm text-[#746b64]">
                Create a user with accounting-side branch access, role assignment, profile style, and menu permissions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                resetUserForm();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e2d8cf] bg-white text-[#6d665f] transition hover:bg-[#f4efe9]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <input
                  className="settings-input"
                  placeholder="Enter staff name"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <Field label="Username">
                <input
                  className="settings-input"
                  placeholder="Email or username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Password">
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Set a password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[#5c544d]">Role</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRoleOpen((current) => !current)}
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"
                  >
                    <span>{selectedRoleLabel}</span>
                    <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${roleOpen ? "rotate-180" : ""}`} />
                  </button>
                  {roleOpen ? (
                    <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
                      {accountingRoles.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setRole(item.value);
                            setRoleOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                            item.value === role ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.value === role ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[#5c544d]">Branch</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBranchOpen((current) => !current)}
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#e2d8cf] bg-white px-4 text-sm text-[#1f1d1c] transition hover:border-[#d7cabe]"
                    disabled={branchesLoading || branches.length === 0}
                  >
                    <span>{selectedBranchLabel}</span>
                    <ChevronDown className={`h-4 w-4 text-[#9a8f85] transition ${branchOpen ? "rotate-180" : ""}`} />
                  </button>
                  {branchOpen ? (
                    <div className="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-[#e7ddd4] bg-white p-2 shadow-[0_16px_32px_rgba(31,29,28,0.12)]">
                      {branches.length === 0 ? (
                        <div className="px-3 py-2.5 text-sm text-[#8b7f75]">
                          No branches available.
                        </div>
                      ) : (
                        branches.map((branch) => (
                          <button
                            key={branch.code}
                            type="button"
                            onClick={() => {
                              setBranchCode(branch.code);
                              setBranchOpen(false);
                              if (error) setError(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                              branch.code === branchCode ? "bg-[#fff1e2] font-semibold text-[#b45b12]" : "text-[#5f5751] hover:bg-[#fff7f0]"
                            }`}
                          >
                            <span>{branch.name}</span>
                            {branch.code === branchCode ? <Check className="h-4 w-4 text-[#ff7101]" /> : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
                Profile style
              </p>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {accountingProfileThemes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setProfileThemeId(theme.id)}
                    className={`rounded-[20px] border p-2 transition ${
                      theme.id === profileThemeId ? "border-[#ff9d60] bg-[#fff5ee]" : "border-[#e2d8cf] bg-white hover:border-[#ffcfaa]"
                    }`}
                  >
                    <div className={`flex h-14 items-center justify-center rounded-[16px] text-sm font-semibold text-white ${theme.className}`}>
                      AC
                    </div>
                    <p className="mt-2 text-xs font-medium text-[#5f5751]">{theme.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
                Access permissions
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {accountingAccessOptions.map((option) => {
                  const checked = accessSelected.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        toggleAccess(option.key);
                        if (error) setError(null);
                      }}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        checked
                          ? "border-[#ffb987] bg-[#fff1e4] text-[#b45b12]"
                          : "border-[#e2d8cf] bg-white text-[#5f5751] hover:border-[#ffcfaa] hover:bg-[#fffaf5]"
                      }`}
                    >
                      <span>{option.label}</span>
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] ${
                          checked
                            ? "border-[#ff9d60] bg-[#ff7a12] text-white"
                            : "border-[#d9cec5] bg-[#faf6f1] text-transparent"
                        }`}
                      >
                        OK
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetUserForm();
                }}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs text-[#6f6761] transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white transition hover:bg-[#ea6a08]"
              >
                Save User
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null}
    </>
  );
*/
}

function RemarksTab() {
  const [items, setItems] = useState<RemarkConfig[]>([]);
  const [savedItems, setSavedItems] = useState<RemarkConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<{ index: number; message: string } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let active = true;

    void fetch("/api/accounting/settings/remarks", {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          data: { items: RemarkConfig[] } | null;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Failed to load remarks.");
        }

        if (active) {
          setItems(payload.data.items);
          setSavedItems(payload.data.items);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(error instanceof Error ? error.message : "Unable to load remarks.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSave(index: number) {
    const item = items[index];
    if (!item) return;

    const itemLabel = item.label;
    setSavingIndex(index);
    setSaveError(null);

    try {
      const response = await fetch("/api/accounting/settings/remarks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify({ documentType: item.documentType, content: item.content }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: RemarkConfig | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to save remark.");
      }

      setSavedItems((current) =>
        current.map((saved, savedIndex) =>
          savedIndex === index ? { ...saved, content: payload.data!.content } : saved
        )
      );
      setToast({ tone: "success", message: `${itemLabel} saved successfully.` });
    } catch (error) {
      setSaveError({
        index,
        message: error instanceof Error ? error.message : "Unable to save remark.",
      });
    } finally {
      setSavingIndex(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
          <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
          Loading remarks...
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          {pageError}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
        Remarks
      </p>
      <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
        Document Remarks
      </h3>
      <p className="mt-2 text-sm text-[#746b64]">
        Define the reusable remarks shown in purchase orders, invoices, quotations, and related documents.
      </p>

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
      <div className="mt-5 grid gap-4">
        {items.map((remark, index) => {
          const savedContent = savedItems[index]?.content ?? remark.content;
          const isDirty = remark.content !== savedContent;
          const isSaving = savingIndex === index;
          const error = saveError?.index === index ? saveError.message : null;

          return (
            <div
              key={remark.documentType}
              className="overflow-hidden rounded-[26px] border border-[#e6dfd8] bg-[linear-gradient(180deg,#fffdfa_0%,#fcfaf7_100%)]"
            >
              <div className="border-b border-[#eee4db] bg-[linear-gradient(135deg,#fff8f1_0%,#fffdf9_100%)] px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-[#ffd8bb] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff7101]">
                      Document Remark
                    </div>
                    <h4 className="mt-3 font-sans text-lg font-semibold text-[#1f1d1c]">
                      {remark.label}
                    </h4>
                    <p className="mt-1 text-sm text-[#786f69]">
                      Default text block used in the matching accounting document flow.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() =>
                      setItems((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, content: savedContent } : item
                        )
                      )
                    }
                    className="rounded-xl border border-[#ffd8bf] bg-white px-3 py-2 text-sm font-semibold text-[#ff7101] disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="px-5 py-5">
                <div className="rounded-[22px] border border-[#ebe2d9] bg-white p-4 shadow-[0_10px_24px_rgba(27,24,22,0.03)]">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                    Remark Content
                  </label>
                  <textarea
                    className="mt-3 min-h-[180px] w-full resize-none rounded-[20px] border border-[#e2d8cf] bg-[#fffdfb] px-4 py-4 text-sm leading-7 text-[#1f1d1c] outline-none transition placeholder:text-[#a2978c] focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4]"
                    value={remark.content}
                    disabled={isSaving}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, content: event.target.value } : item
                        )
                      )
                    }
                  />
                  {error ? (
                    <div className="mt-3 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                      {error}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-[#8a7f76]">
                      This remark will appear as the default note for {remark.label.toLowerCase()}.
                    </p>
                    <button
                      type="button"
                      disabled={!isDirty || isSaving}
                      onClick={() => handleSave(index)}
                      className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition ${
                        isDirty && !isSaving
                          ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                          : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormIdTab() {
  const [items, setItems] = useState<FormIdConfig[]>([]);
  const [savedItems, setSavedItems] = useState<FormIdConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<{ index: number; message: string } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let active = true;

    void fetch("/api/accounting/settings/form-ids", {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          data: { items: FormIdConfig[] } | null;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.message || "Failed to load form ID config.");
        }

        if (active) {
          setItems(payload.data.items);
          setSavedItems(payload.data.items);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(error instanceof Error ? error.message : "Unable to load form ID config.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function buildPreview(code: string, yearToken: string, serial: string) {
    const parts = [code.trim(), yearToken.trim(), serial.trim()].filter(Boolean);
    return parts.join("-");
  }

  function updateItem(
    index: number,
    field: keyof Omit<FormIdConfig, "formType" | "label">,
    value: string
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  async function handleSave(index: number) {
    const item = items[index];
    if (!item) return;

    const itemLabel = item.label;
    setSavingIndex(index);
    setSaveError(null);

    try {
      const response = await fetch("/api/accounting/settings/form-ids", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify({
          formType: item.formType,
          code: item.code,
          yearToken: item.yearToken,
          rangeFrom: item.rangeFrom,
          rangeTo: item.rangeTo,
          nextNumber: item.nextNumber,
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        message: string;
        data: FormIdConfig | null;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to save form ID config.");
      }

      setSavedItems((current) =>
        current.map((saved, savedIndex) =>
          savedIndex === index ? { ...saved, ...payload.data! } : saved
        )
      );
      setToast({ tone: "success", message: `${itemLabel} series configuration saved.` });
    } catch (error) {
      setSaveError({
        index,
        message: error instanceof Error ? error.message : "Unable to save form ID config.",
      });
    } finally {
      setSavingIndex(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#786f69]">
          <Loader2 className="h-4 w-4 animate-spin text-[#ff7101]" />
          Loading form ID configuration...
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
        <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
          {pageError}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[#ddd8d1] bg-white p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8b7f75]">
            Form IDs
          </p>
          <h3 className="mt-2 font-sans text-xl font-semibold text-[#1f1d1c]">
            Form Series Configuration
          </h3>
          <p className="mt-2 text-sm text-[#746b64]">
            Configure prefixes, year tokens, and running number ranges for each accounting form.
          </p>
        </div>
        <div className="rounded-2xl border border-[#efe2d7] bg-[#fff8f2] px-4 py-3 text-sm text-[#746b64]">
          Format guide: <span className="font-semibold text-[#1f1d1c]">CODE-YEAR-0001</span>
        </div>
      </div>

      {toast ? <StatusToast toast={toast} onClose={() => setToast(null)} /> : null}
      <div className="mt-5 grid gap-4">
        {items.map((item, index) => {
          const saved = savedItems[index];
          const isDirty = saved
            ? item.code !== saved.code ||
              item.yearToken !== saved.yearToken ||
              item.rangeFrom !== saved.rangeFrom ||
              item.rangeTo !== saved.rangeTo ||
              item.nextNumber !== saved.nextNumber
            : false;
          const isSaving = savingIndex === index;
          const error = saveError?.index === index ? saveError.message : null;

          return (
            <div
              key={item.formType}
              className="rounded-[26px] border border-[#e6dfd8] bg-[#fcfaf7] p-5"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h4 className="font-sans text-lg font-semibold text-[#1f1d1c]">
                    {item.label}
                  </h4>
                  <p className="mt-1 text-sm text-[#786f69]">
                    Define the code, add the year token, and control the numeric range for this form.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="rounded-full bg-[#fff1e4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff7101]">
                    Current: {buildPreview(item.code, item.yearToken, item.nextNumber)}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_0.8fr_1.2fr]">
                <div className="rounded-2xl border border-[#ebe2d9] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                    Prefix Builder
                  </p>
                  <div className="mt-4 grid gap-4">
                    <Field label="Form code">
                      <input
                        className="settings-input"
                        value={item.code}
                        disabled={isSaving}
                        onChange={(event) => updateItem(index, "code", event.target.value)}
                      />
                    </Field>
                    <div className="rounded-2xl border border-dashed border-[#e3d8ce] bg-[#fffaf5] p-4">
                      <div>
                        <p className="text-sm font-semibold text-[#1f1d1c]">Year token</p>
                        <p className="mt-1 text-xs text-[#7d736b]">
                          Leave this empty if the format should skip the year segment. Example: {"`"}PO-0001{"`"}.
                        </p>
                      </div>
                      <Field label="Year value">
                        <input
                          className="settings-input mt-2"
                          value={item.yearToken}
                          disabled={isSaving}
                          onChange={(event) => updateItem(index, "yearToken", event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#ebe2d9] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                    Range Control
                  </p>
                  <div className="mt-4 grid gap-4">
                    <Field label="Range from">
                      <input
                        className="settings-input"
                        value={item.rangeFrom}
                        disabled={isSaving}
                        onChange={(event) => updateItem(index, "rangeFrom", event.target.value)}
                      />
                    </Field>
                    <Field label="Range to">
                      <input
                        className="settings-input"
                        value={item.rangeTo}
                        disabled={isSaving}
                        onChange={(event) => updateItem(index, "rangeTo", event.target.value)}
                      />
                    </Field>
                    <Field label="Next number">
                      <input
                        className="settings-input"
                        value={item.nextNumber}
                        disabled={isSaving}
                        onChange={(event) => updateItem(index, "nextNumber", event.target.value)}
                      />
                    </Field>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#ebe2d9] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                    Final Format
                  </p>
                  <div className="mt-4 rounded-[22px] border border-[#f0e3d8] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7f0_100%)] p-4">
                    <p className="text-sm font-semibold text-[#1f1d1c]">
                      {buildPreview(item.code, item.yearToken, item.nextNumber)}
                    </p>
                    <p className="mt-2 text-sm text-[#776d67]">
                      Prefix uses the form code, adds year only when provided, and keeps the running number inside the configured range.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#efe3d9] bg-[#fcfaf7] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                        Example Start
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                        {buildPreview(item.code, item.yearToken, item.rangeFrom)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#efe3d9] bg-[#fcfaf7] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                        Example End
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                        {buildPreview(item.code, item.yearToken, item.rangeTo)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  disabled={!isDirty || isSaving}
                  onClick={() => handleSave(index)}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition ${
                    isDirty && !isSaving
                      ? "bg-[#ff7a12] text-white hover:bg-[#ea6a08]"
                      : "cursor-not-allowed bg-[#f3ece4] text-[#a09388]"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
