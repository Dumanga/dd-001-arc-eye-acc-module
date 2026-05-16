"use client";

// Modal that lets the invoice form pick a specific in-stock serial
// for a serial-tracked inventory product. Fetches from
// /api/accounting/invoices/product-serials which filters out serials
// already locked by another POS bill or invoice (so two staff can't
// sell the same physical unit). Mirrors the POS serial picker UX.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { ActiveInvoiceProductSerial } from "@/app/api/accounting/invoices/product-serials/route";

type InvoiceSerialPickerModalProps = {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  productName: string;
  storeId: string | null;
  // When editing an existing serial pick, that serial id is force-
  // included in the list (otherwise it'd be hidden as "locked by this
  // invoice") so the user sees their current selection.
  currentSerialId?: string | null;
  onPick: (serial: ActiveInvoiceProductSerial) => void;
};

export function InvoiceSerialPickerModal({
  open,
  onClose,
  productId,
  productName,
  storeId,
  currentSerialId,
  onPick,
}: InvoiceSerialPickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serials, setSerials] = useState<ActiveInvoiceProductSerial[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !productId || !storeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSerials([]);
    const params = new URLSearchParams({ productId, storeId });
    if (currentSerialId) params.set("currentInvoiceLineSerialId", currentSerialId);
    fetch(`/api/accounting/invoices/product-serials?${params}`)
      .then(async (res) => {
        const payload = (await res.json()) as {
          success: boolean;
          data: { items: ActiveInvoiceProductSerial[] } | null;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok || !payload.success || !payload.data) {
          setError(payload.message || "Could not load serials.");
          return;
        }
        setSerials(payload.data.items);
      })
      .catch(() => {
        if (!cancelled) setError("Network error — could not load serials.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId, storeId, currentSerialId]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(33,27,23,0.55)] px-4 py-6">
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-md flex-col rounded-[26px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
              Pick serial
            </p>
            <h3 className="mt-1 truncate font-sans text-lg font-semibold text-[#1f1d1c]">
              {productName || "Serial-tracked item"}
            </h3>
            <p className="mt-1 text-xs text-[#7c6f65]">
              Only serials currently in stock and not locked by another bill
              or invoice are listed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[#9b8f87] transition hover:bg-[#fff7f0] hover:text-[#1f1d1c]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#eadfd5] bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#7c6f65]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading serials…
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-sm text-[#b94f37]">{error}</div>
          ) : serials.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[#7c6f65]">
              No active serials for this product at this branch.
            </div>
          ) : (
            <ul>
              {serials.map((s) => {
                const isCurrent = currentSerialId === s.serialId;
                return (
                  <li key={s.serialId}>
                    <button
                      type="button"
                      onClick={() => onPick(s)}
                      className={`flex w-full items-center justify-between gap-3 border-b border-[#f0e5dc] px-4 py-3 text-left text-sm transition last:border-0 hover:bg-[#fff7ef] ${
                        isCurrent ? "bg-[#fff1e2] text-[#a95915]" : "text-[#1f1d1c]"
                      }`}
                    >
                      <span className="font-mono font-semibold">{s.serialNumber}</span>
                      {isCurrent ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a95915]">
                          Current
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs font-semibold text-[#6f6761] transition hover:bg-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
