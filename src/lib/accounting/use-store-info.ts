"use client";

import { useEffect, useState } from "react";

export type StoreInfo = {
  id: string;
  name: string;
  code: string;
  city: string;
  notes: string | null;
};

export function useStoreInfo(): StoreInfo | null {
  const [store, setStore] = useState<StoreInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounting/store-info", {
      headers: { "x-portal": "ACCOUNTING" },
    })
      .then((r) => r.json())
      .then((payload: { success: boolean; data: StoreInfo | null }) => {
        if (cancelled) return;
        if (payload.success && payload.data) {
          setStore(payload.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return store;
}

export function getStoreAddressLines(store: StoreInfo | null): string[] {
  if (!store) return [];
  return [
    store.code ? `Code: ${store.code}` : "",
    store.city,
    store.notes ?? "",
  ].filter(Boolean);
}
