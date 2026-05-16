"use client";

// Client-side wrapper for the Pending Forms button + modal. Lives in
// the (server) dashboard page so it has to be its own client island.
//
// The button shows a live count badge so the super admin sees at a
// glance how many drafts are waiting. The count is refreshed on
// mount, after the modal closes (in case approvals happened inside),
// and lazily every time we re-render after a modal close.

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { PendingFormsModal } from "@/components/accounting/pending-forms-modal";

export function PendingFormsButton() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/dashboard/pending-forms");
      const j = (await res.json()) as {
        success: boolean;
        data: { totalCount: number } | null;
      };
      if (res.ok && j.success && j.data) {
        setCount(j.data.totalCount);
      }
    } catch {
      // Network error — leave the badge hidden rather than show a
      // misleading number.
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center gap-2 rounded-xl border border-[#ff7a12] bg-white px-4 py-2 text-sm font-semibold text-[#ff7a12] transition hover:bg-[#fff3e6]"
      >
        <ClipboardCheck className="h-4 w-4" />
        Pending Forms
        {count !== null && count > 0 ? (
          <span
            className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ff7101] px-1.5 text-[10px] font-bold text-white"
            aria-label={`${count} pending form${count === 1 ? "" : "s"}`}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      <PendingFormsModal
        open={open}
        onClose={() => {
          setOpen(false);
          // Refresh badge in case approvals happened inside the modal.
          void refreshCount();
        }}
      />
    </>
  );
}
