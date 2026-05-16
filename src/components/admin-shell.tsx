"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

type CurrentUser = {
  displayName: string;
  role: "SUPER_ADMIN" | "CASHIER" | "REPAIR_STAFF";
  profileImageId: number;
  accessDashboard: boolean;
  accessRepairs: boolean;
  accessClients: boolean;
  accessBrands: boolean;
  accessUsers: boolean;
  accessStores: boolean;
  accessSms: boolean;
  accessSettings: boolean;
};

const navItems = [
  { label: "Dashboard", href: "/operation/admin" },
  { label: "Repairs", href: "/operation/admin/repairs" },
  { label: "Clients", href: "/operation/admin/clients" },
  { label: "Bat Brands", href: "/operation/admin/brands" },
  { label: "Users", href: "/operation/admin/users" },
  { label: "Stores", href: "/operation/admin/stores" },
  { label: "SMS Portal", href: "/operation/admin/sms" },
  { label: "Reports", href: "/operation/admin/reports" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [imageError, setImageError] = useState(false);
  const [pendingRepairsCount, setPendingRepairsCount] = useState<number>(0);
  const visibleNavItems = currentUser
    ? navItems.filter((item) => {
        if (currentUser.role === "SUPER_ADMIN") {
          return true;
        }
        switch (item.href) {
          case "/operation/admin":
            return currentUser.accessDashboard;
          case "/operation/admin/repairs":
            return currentUser.accessRepairs;
          case "/operation/admin/clients":
            return currentUser.accessClients;
          case "/operation/admin/brands":
            return currentUser.accessBrands;
          case "/operation/admin/users":
            return currentUser.accessUsers;
          case "/operation/admin/stores":
            return currentUser.accessStores;
          case "/operation/admin/sms":
            return currentUser.accessSms;
          case "/operation/admin/reports":
            return currentUser.accessSettings;
          default:
            return true;
        }
      })
    : navItems;

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me");
        const payload = (await response.json()) as {
          success: boolean;
          data: CurrentUser | null;
        };
        if (active && response.ok && payload.success && payload.data) {
          setCurrentUser(payload.data);
          setImageError(false);
        }
      } catch {
        if (active) {
          setCurrentUser(null);
        }
      }
    }

    loadUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPendingRepairsCount() {
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "1",
          status: "PENDING",
        });
        const response = await fetch(`/api/repairs?${params.toString()}`);
        const payload = (await response.json()) as {
          success: boolean;
          data: { total: number } | null;
        };
        if (!active) {
          return;
        }
        if (response.ok && payload.success && payload.data) {
          setPendingRepairsCount(payload.data.total);
        } else {
          setPendingRepairsCount(0);
        }
      } catch {
        if (active) {
          setPendingRepairsCount(0);
        }
      }
    }

    loadPendingRepairsCount();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
      suppressHydrationWarning
    >
      <div
        className="relative overflow-hidden border-b border-[var(--stroke)] bg-[var(--panel)]"
        suppressHydrationWarning
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-[var(--accent-soft)] blur-3xl" />
          <div className="absolute right-[-12%] top-[-25%] h-80 w-80 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute bottom-[-30%] left-1/2 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-[110rem] flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Admin Console
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Doctor of Bat Operations
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Live status of workshop repairs, staff, and deliveries.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full border border-[var(--stroke)] bg-[var(--panel-muted)] px-4 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:bg-[var(--panel)] lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-expanded={mobileNavOpen}
              aria-controls="admin-mobile-nav"
            >
              {mobileNavOpen ? "Close" : "Menu"}
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center">
              <img
                src="/assets/logo-dob.png"
                alt="Doctor of Bat logo"
                className="h-16 w-auto opacity-95 sm:h-20"
              />
            </div>
          </div>
        </div>

        {mobileNavOpen ? (
          <div
            id="admin-mobile-nav"
            className="lg:hidden border-t border-[var(--stroke)] bg-[var(--panel)]"
          >
            <nav className="mx-auto grid w-full max-w-[110rem] gap-2 px-6 py-4 text-sm text-[var(--text-muted)]">
              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "hover:bg-[var(--panel-muted)]"
                    }`}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <span>{item.label}</span>
                    {item.label === "Repairs" ? (
                      <span className="rounded-full bg-[var(--panel-muted)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
                        {pendingRepairsCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              <form action="/operation/logout" method="post" className="pt-1">
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-rose-400 transition hover:bg-rose-500/10"
                >
                  <span>Logout</span>
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </nav>
          </div>
        ) : null}
      </div>

      <div
        className="mx-auto grid w-full max-w-[110rem] gap-6 px-6 py-8 lg:grid-cols-[240px_1fr]"
        suppressHydrationWarning
      >
        <aside className="hidden rounded-3xl border border-[var(--stroke)] bg-[var(--panel)] p-5 lg:block">
          <div className="flex items-center gap-3">
            {currentUser && !imageError ? (
              <div className="h-12 w-12 overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--panel)]">
                <img
                  src={`/assets/profile-imgs/${currentUser.profileImageId}.png`}
                  alt={`${currentUser.displayName} profile`}
                  className="h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-2xl border border-[var(--stroke)] bg-gradient-to-br from-emerald-400/70 via-emerald-300/50 to-orange-400/60" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {currentUser?.displayName ?? "Super Admin"}
              </p>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                Online
              </div>
            </div>
            <form action="/operation/logout" method="post" className="ml-auto">
              <button
                type="submit"
                aria-label="Logout"
                title="Logout"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
          <nav className="mt-6 grid gap-2 text-sm text-[var(--text-muted)]">
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 transition ${
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "hover:bg-[var(--panel-muted)]"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.label === "Repairs" ? (
                    <span className="rounded-full bg-[var(--panel-muted)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
                      {pendingRepairsCount}
                    </span>
                  ) : null}
                </Link>
              );
          })}
          </nav>
        </aside>

        <section className="grid gap-6">{children}</section>
      </div>
    </main>
  );
}
