"use client";

// Slim "add customer" popup used inside the POS, Invoice, and
// Quotation flows so cashiers / staff can register a new customer
// without leaving their current screen.
//
// Submits to the same POST /api/accounting/clients endpoint that the
// full customers page uses — we just expose the minimum required
// fields here (name, mobile, optional email, currency). The other
// fields (address, tier, merchant flag) fall back to API defaults
// and can be edited later via the regular customers screen.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { AccountingClientPayload } from "@/lib/accounting/clients";

const DEFAULT_CURRENCY = "LKR";
const SUPPORTED_CURRENCIES = ["LKR", "USD", "GBP", "EUR", "AUD"];

type CustomerQuickCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (client: AccountingClientPayload) => void;
  defaultName?: string;
};

export function CustomerQuickCreateModal({
  open,
  onClose,
  onCreated,
  defaultName,
}: CustomerQuickCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset on open. Pre-fill name from the search term the caller
  // had typed — saves a re-type for the cashier.
  useEffect(() => {
    if (!open) return;
    setName(defaultName?.trim() ?? "");
    setMobile("");
    setEmail("");
    setCurrency(DEFAULT_CURRENCY);
    setError(null);
    setSubmitting(false);
    // Focus name so the cashier can keep typing without grabbing
    // the mouse.
    setTimeout(() => nameRef.current?.focus(), 30);
  }, [open, defaultName]);

  if (!mounted || !open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Customer name is required.");
      return;
    }
    const cleanMobile = mobile.replace(/\D/g, "");
    if (cleanMobile.length < 7 || cleanMobile.length > 15) {
      setError("Mobile must be 7–15 digits.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounting/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal": "ACCOUNTING",
        },
        body: JSON.stringify({
          name: trimmedName,
          mobile: cleanMobile,
          email: email.trim() || null,
          currency,
          tier: "BRONZE",
          isMerchant: false,
        }),
      });
      const payload = (await res.json()) as {
        success: boolean;
        data: AccountingClientPayload | null;
        message?: string;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setError(payload.message || "Could not create customer.");
        setSubmitting(false);
        return;
      }
      onCreated(payload.data);
      onClose();
    } catch {
      setError("Network error — could not reach the server.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(33,27,23,0.55)] px-4 py-6">
      <div className="w-full max-w-md rounded-[26px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] p-6 shadow-[0_28px_70px_rgba(44,42,44,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8b7f75]">
              Quick add
            </p>
            <h3 className="mt-1 font-sans text-lg font-semibold text-[#1f1d1c]">
              New customer
            </h3>
            <p className="mt-1 text-xs text-[#7c6f65]">
              Capture the essentials now — address, tier and merchant flag
              can be filled later from the customers screen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-1 text-[#9b8f87] transition hover:bg-[#fff7f0] hover:text-[#1f1d1c] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Customer name <span className="text-[#c95d37]">*</span>
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter customer name"
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">
              Mobile <span className="text-[#c95d37]">*</span>
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="Numbers only (7–15 digits)"
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com (optional)"
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[#5f5750]">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-2xl border border-[#e2d8cf] bg-white px-3 text-sm text-[#1f1d1c] outline-none focus:border-[#ffba82] focus:ring-4 focus:ring-[#ffe7d4] disabled:bg-[#f7f1ea]"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-3 py-2 text-sm text-[#b94f37]">
              {error}
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#ddd8d1] bg-[#faf6f1] px-4 text-xs font-semibold text-[#6f6761] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ff7a12] px-5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(255,122,18,0.22)] transition hover:bg-[#ff8a2c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create customer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
