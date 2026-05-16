"use client";

import { useEffect, useState } from "react";
import type {
  ActiveBranch,
  ViewerSummary,
} from "@/components/accounting/branch-aware-create-button";

// Loads (1) the viewer's role + storeId from /api/auth/me and (2) the active
// branches from /api/stores. Returned once both have settled. Used by every
// transactional screen that renders the BranchAwareCreateButton — the screen
// stays branch-blind beyond reading the picked storeId out of the callback.

export function useViewerAndBranches() {
  const [viewer, setViewer] = useState<ViewerSummary | null>(null);
  const [branches, setBranches] = useState<ActiveBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/auth/me", { headers: { "x-portal": "ACCOUNTING" } })
      .then((r) => r.json() as Promise<{ success: boolean; data: { role: string; storeId: string | null } | null; message?: string }>)
      .then(async (me) => {
        if (cancelled) return;
        if (!me.success || !me.data) {
          setError(me.message || "Unable to resolve viewer.");
          return;
        }
        const role = me.data.role as ViewerSummary["role"];
        const storeId = me.data.storeId;
        if (role === "SUPER_ADMIN") {
          setViewer({ role: "SUPER_ADMIN", storeId: null });
        } else if (storeId) {
          setViewer({ role: role as Exclude<ViewerSummary["role"], "SUPER_ADMIN">, storeId });
          // Branch users don't render the picker, so they don't need the
          // branches list — and /api/stores is super-admin-only. Skip.
          return;
        } else {
          setError("Your account is not assigned to a branch.");
          return;
        }
        // Super admin path: fetch the active branches for the picker.
        const stores = (await fetch("/api/stores?page=1&pageSize=50", {
          headers: { "x-portal": "ACCOUNTING" },
        }).then((r) => r.json())) as {
          success: boolean;
          data: { items: Array<{ id: string; code: string; name: string; status: string }> } | null;
          message?: string;
        };
        if (cancelled) return;
        if (!stores.success || !stores.data) {
          setError(stores.message || "Unable to load branches.");
          return;
        }
        setBranches(
          stores.data.items
            .filter((s) => s.status === "ACTIVE")
            .map((s) => ({ id: s.id, code: s.code, name: s.name }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { viewer, branches, loading, error };
}
