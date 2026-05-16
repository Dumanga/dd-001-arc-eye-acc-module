"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AccountingContentLoader({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPosRoute = pathname === "/accounting/admin/pos";
  const firstRenderRef = useRef(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPosRoute) {
      return;
    }

    const delay = firstRenderRef.current ? 260 : 180;
    firstRenderRef.current = false;

    const startTimer = window.setTimeout(() => {
      setLoading(true);
    }, 0);

    const finishTimer = window.setTimeout(() => {
      setLoading(false);
    }, delay);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(finishTimer);
    };
  }, [isPosRoute, pathname]);

  if (isPosRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-[#ddd8d1] bg-[linear-gradient(180deg,#ffffff_0%,#fcfaf7_100%)]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#f3dfcf]" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#ff7101] border-r-[#ffb347]" />
          </div>
          <div>
            <p className="font-sans text-base font-semibold text-[#1f1d1c]">
              Loading section
            </p>
            <p className="mt-1 text-sm text-[#7a726c]">
              Preparing accounting content...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
