"use client";

// Watches the URL's `?id=` query param and calls the provided opener
// callback whenever it's present. Used by every accounting list
// screen so the super-admin Pending Forms inbox can deep-link
// straight into a specific document's preview (instead of dumping
// the user on the listing page with no context).

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function useOpenPreviewFromUrl(opener: (id: string) => void) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams?.get("id");
    if (id) opener(id);
    // The opener identity changes per render in many parents, so we
    // deliberately depend only on the params — re-invoking on every
    // render would cause a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
