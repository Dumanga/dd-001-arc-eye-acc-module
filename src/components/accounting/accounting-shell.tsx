"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  BookOpenText,
  Boxes,
  ChevronRight,
  Copyright,
  CreditCard,
  HandCoins,
  Home,
  LogOut,
  Mail,
  Menu,
  Package,
  Settings2,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AccountingShellUser = {
  displayName: string;
  username: string;
  role: "SUPER_ADMIN" | "CASHIER" | "DATA_ENTRY" | "SUPERVISOR";
  profileImageId: number;
  storeId: string | null;
  accessDashboard: boolean;
  accessSuppliers: boolean;
  accessCustomers: boolean;
  accessInventory: boolean;
  accessAccounts: boolean;
  accessReports: boolean;
  accessPos: boolean;
  accessSettings: boolean;
};

type NavChild = {
  label: string;
  href: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/accounting/admin", icon: Home },
  {
    label: "Suppliers",
    href: "/accounting/admin/suppliers",
    icon: Store,
    children: [
      { label: "Supplier List", href: "/accounting/admin/suppliers" },
      { label: "Purchase Orders", href: "/accounting/admin/suppliers/purchase-orders" },
      { label: "Goods Return", href: "/accounting/admin/suppliers/goods-return" },
      { label: "Supplier Payments", href: "/accounting/admin/suppliers/payments" },
      { label: "GRN", href: "/accounting/admin/suppliers/grn" },
    ],
  },
  {
    label: "Customers",
    href: "/accounting/admin/customers",
    icon: HandCoins,
    children: [
      { label: "Client List", href: "/accounting/admin/customers" },
      { label: "Quotations", href: "/accounting/admin/customers/quotations" },
      { label: "Invoices", href: "/accounting/admin/customers/invoices" },
      { label: "Returns", href: "/accounting/admin/customers/returns" },
      { label: "Payments", href: "/accounting/admin/customers/payments" },
    ],
  },
  {
    label: "Inventory",
    href: "/accounting/admin/inventory",
    icon: Boxes,
    children: [
      { label: "Products", href: "/accounting/admin/inventory/stock" },
      { label: "Material Issue Note", href: "/accounting/admin/inventory/material-issue" },
      { label: "UOM Forms", href: "/accounting/admin/inventory/uom-forms" },
      { label: "Stock Reports", href: "/accounting/admin/inventory" },
    ],
  },
  {
    label: "Accounts",
    href: "/accounting/admin/accounts",
    icon: BookOpenText,
    children: [
      { label: "Chart of Accounts", href: "/accounting/admin/accounts/chart-of-accounts" },
      { label: "Tax Codes", href: "/accounting/admin/accounts/tax-codes" },
      { label: "Expenses", href: "/accounting/admin/accounts/expenses" },
      { label: "Journal Entry", href: "/accounting/admin/accounts/journal-entry" },
    ],
  },
  {
    label: "Reports",
    href: "/accounting/admin/reports",
    icon: Package,
  },
  {
    label: "Settings",
    href: "/accounting/admin/settings",
    icon: Settings2,
  },
];

const sectionAccessByHref = [
  { prefix: "/accounting/admin/settings", key: "accessSettings" },
  { prefix: "/accounting/admin/reports", key: "accessReports" },
  { prefix: "/accounting/admin/accounts", key: "accessAccounts" },
  { prefix: "/accounting/admin/inventory", key: "accessInventory" },
  { prefix: "/accounting/admin/customers", key: "accessCustomers" },
  { prefix: "/accounting/admin/suppliers", key: "accessSuppliers" },
  { prefix: "/accounting/admin/pos", key: "accessPos" },
  { prefix: "/accounting/admin", key: "accessDashboard" },
] as const;

function formatRoleLabel(role: AccountingShellUser["role"]) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "CASHIER":
      return "Cashier";
    case "DATA_ENTRY":
      return "Data Entry";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return role;
  }
}

function buildAccessSummary(user: AccountingShellUser) {
  if (user.role === "SUPER_ADMIN") {
    return "All accounting modules";
  }

  const labels = [
    user.accessDashboard ? "Dashboard" : null,
    user.accessSuppliers ? "Suppliers" : null,
    user.accessCustomers ? "Customers" : null,
    user.accessInventory ? "Inventory" : null,
    user.accessAccounts ? "Accounts" : null,
    user.accessReports ? "Reports" : null,
    user.accessPos ? "POS" : null,
    user.accessSettings ? "Settings" : null,
  ].filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "No module access assigned";
}

function hasRouteAccess(user: AccountingShellUser, pathname: string) {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }

  const matchedSection = sectionAccessByHref.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!matchedSection) {
    return true;
  }

  return user[matchedSection.key];
}

function getDefaultAccountingRoute(user: AccountingShellUser) {
  if (user.role === "SUPER_ADMIN" || user.accessDashboard) {
    return "/accounting/admin";
  }
  if (user.accessSuppliers) {
    return "/accounting/admin/suppliers";
  }
  if (user.accessCustomers) {
    return "/accounting/admin/customers";
  }
  if (user.accessInventory) {
    return "/accounting/admin/inventory";
  }
  if (user.accessAccounts) {
    return "/accounting/admin/accounts";
  }
  if (user.accessReports) {
    return "/accounting/admin/reports";
  }
  if (user.accessPos) {
    return "/accounting/admin/pos";
  }
  if (user.accessSettings) {
    return "/accounting/admin/settings";
  }
  return "/accounting/login?reason=access-denied";
}

function filterNavItemsForUser(user: AccountingShellUser) {
  if (user.role === "SUPER_ADMIN") {
    return navItems;
  }

  return navItems.filter((item) => {
    if (item.href === "/accounting/admin") {
      return user.accessDashboard;
    }
    if (item.href.startsWith("/accounting/admin/suppliers")) {
      return user.accessSuppliers;
    }
    if (item.href.startsWith("/accounting/admin/customers")) {
      return user.accessCustomers;
    }
    if (item.href.startsWith("/accounting/admin/inventory")) {
      return user.accessInventory;
    }
    if (item.href.startsWith("/accounting/admin/accounts")) {
      return user.accessAccounts;
    }
    if (item.href.startsWith("/accounting/admin/reports")) {
      return user.accessReports;
    }
    if (item.href.startsWith("/accounting/admin/settings")) {
      return user.accessSettings;
    }
    return true;
  });
}

export function AccountingShell({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser: AccountingShellUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const allowedNavItems = useMemo(() => filterNavItemsForUser(currentUser), [currentUser]);
  const routeAccessAllowed = useMemo(
    () => hasRouteAccess(currentUser, pathname),
    [currentUser, pathname]
  );
  const defaultRoute = useMemo(() => getDefaultAccountingRoute(currentUser), [currentUser]);

  useEffect(() => {
    if (!routeAccessAllowed) {
      router.replace(defaultRoute);
    }
  }, [defaultRoute, routeAccessAllowed, router]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootColorScheme = root.style.colorScheme;
    const previousBodyColorScheme = body.style.colorScheme;

    root.style.colorScheme = "light";
    body.style.colorScheme = "light";

    return () => {
      root.style.colorScheme = previousRootColorScheme;
      body.style.colorScheme = previousBodyColorScheme;
    };
  }, []);

  const defaultExpanded = useMemo(() => {
    return allowedNavItems.reduce<Record<string, boolean>>((accumulator, item) => {
      accumulator[item.label] = Boolean(
        item.children?.some((child) => pathname === child.href) ||
          pathname === item.href ||
          pathname.startsWith(`${item.href}/`)
      );
      return accumulator;
    }, {});
  }, [allowedNavItems, pathname]);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const mergedExpanded = useMemo(
    () =>
      allowedNavItems.reduce<Record<string, boolean>>((accumulator, item) => {
        accumulator[item.label] = expandedItems[item.label] ?? defaultExpanded[item.label];
        return accumulator;
      }, {}),
    [allowedNavItems, defaultExpanded, expandedItems]
  );

  if (!routeAccessAllowed) {
    return null;
  }

  if (pathname === "/accounting/admin/pos") {
    return <>{children}</>;
  }

  function toggleItem(label: string) {
    setExpandedItems((current) => {
      const nextValue = !(current[label] ?? defaultExpanded[label]);
      const collapsed = allowedNavItems.reduce<Record<string, boolean>>((accumulator, item) => {
        accumulator[item.label] = false;
        return accumulator;
      }, {});

      return {
        ...collapsed,
        [label]: nextValue,
      };
    });
  }

  return (
    <main className="accounting-light h-screen overflow-hidden bg-[#f4f1eb] font-sans text-[#1f1d1c]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[#ffd7bb]/45 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-[#efe7dc] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f8f5ef_0%,#f4f1eb_46%,#f0ece5_100%)]" />
      </div>
      <div className="flex h-screen w-full overflow-hidden">
        <aside className="relative hidden w-[280px] shrink-0 overflow-hidden border-r border-white/8 bg-[linear-gradient(180deg,#191b23_0%,#232839_52%,#2c3249_100%)] text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,113,1,0.20),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(52,211,153,0.10),_transparent_22%)]" />
          <div className="relative flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#ff9f43_0%,#ff7101_100%)] text-sm font-semibold text-white shadow-[0_14px_28px_rgba(255,113,1,0.25)]">
              A
            </div>
            <div>
              <p className="font-sans text-lg font-semibold text-white">Accounting</p>
              <p className="text-sm text-white/65">Portal</p>
            </div>
          </div>

          <nav className="accounting-sidebar-scroll relative min-h-0 flex-1 overflow-y-auto px-3 py-5">
            {allowedNavItems.map((item) => (
              <SidebarItem
                key={item.label}
                item={item}
                pathname={pathname}
                expanded={mergedExpanded[item.label]}
                onToggle={() => toggleItem(item.label)}
              />
            ))}
          </nav>

          <div className="relative px-6 pb-3 text-[11px] text-white/48">
            <div className="flex items-center justify-center gap-1.5">
              <Copyright className="h-3 w-3" />
              <p>Solution by Dozen Digital (Pvt) Ltd</p>
            </div>
          </div>

          <div className="relative border-t border-white/10 p-3">
            <form action="/accounting/logout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/72 transition hover:bg-white/8 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </form>
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="relative z-20 flex min-h-16 shrink-0 items-center justify-between border-b border-[#ddd8d1]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(252,248,243,0.82)_100%)] px-4 backdrop-blur-xl sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff7101_0%,#ffb347_28%,#34d399_58%,#4f46e5_100%)]" />
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e5dfd8] bg-white lg:hidden"
                aria-label="Toggle accounting navigation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <p className="font-sans text-lg font-semibold text-[#2a2725]">Accounting Portal</p>
                <p className="hidden text-sm text-[#7a716a] md:block">
                  Comfortable finance workspace with a dedicated POS flow.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece1d7] bg-white/80 text-[#6d665f] transition hover:bg-[#f4efe9]"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>
              {currentUser.role === "SUPER_ADMIN" || currentUser.accessPos ? (
                <Link
                  href="/accounting/admin/pos"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#1f9f75_0%,#157f5c_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(21,127,92,0.22)] transition hover:translate-y-[-1px] md:inline-flex"
                >
                  <CreditCard className="h-4 w-4" />
                  POS
                </Link>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#f3d9c2] bg-white shadow-[0_10px_20px_rgba(255,113,1,0.14)]"
                  aria-label="Open account menu"
                  aria-expanded={accountMenuOpen}
                >
                  <Image
                    src={`/assets/profile-imgs/${currentUser.profileImageId}.png`}
                    alt={`${currentUser.displayName} profile`}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                </button>
                {accountMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[340px] overflow-hidden rounded-[28px] border border-[#eadfd5] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f3_100%)] shadow-[0_24px_60px_rgba(44,42,44,0.16)]">
                    <div className="relative overflow-hidden border-b border-[#efe3d9] bg-[linear-gradient(135deg,#fff8f1_0%,#fff2e5_52%,#fffaf6_100%)] px-5 py-5">
                      <div className="absolute right-[-2.5rem] top-[-2.5rem] h-24 w-24 rounded-full bg-[#ffcfaa]/45 blur-2xl" />
                      <div className="relative flex items-start gap-4">
                        <div className="h-14 w-14 overflow-hidden rounded-[22px] border border-[#f1d7c1] bg-white shadow-[0_16px_30px_rgba(255,113,1,0.16)]">
                          <Image
                            src={`/assets/profile-imgs/${currentUser.profileImageId}.png`}
                            alt={`${currentUser.displayName} profile`}
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="inline-flex rounded-full border border-[#ffd8bb] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff7101]">
                            Signed In
                          </div>
                          <p className="mt-3 font-sans text-lg font-semibold text-[#1f1d1c]">
                            {currentUser.displayName}
                          </p>
                          <p className="mt-1 text-sm text-[#746b64]">
                            {formatRoleLabel(currentUser.role)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 p-4">
                      <div className="grid gap-3">
                        <div className="flex items-start gap-3 rounded-[20px] border border-[#efe3d9] bg-white px-4 py-3">
                          <div className="rounded-2xl bg-[#fff3e8] p-2.5 text-[#ff7101]">
                            <Mail className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                              Email
                            </p>
                            <p className="mt-1 break-all text-sm font-medium text-[#1f1d1c]">
                              {currentUser.username}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-[20px] border border-[#efe3d9] bg-white px-4 py-3">
                          <div className="rounded-2xl bg-[#eef4ff] p-2.5 text-[#2d6df6]">
                            <UserRound className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                              Role
                            </p>
                            <p className="mt-1 text-sm font-medium text-[#1f1d1c]">
                              {formatRoleLabel(currentUser.role)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[20px] border border-[#efe3d9] bg-[#fcfaf7] px-4 py-4">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-[#18a66a]" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                              Access
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-[#1f1d1c]">
                            {currentUser.role === "SUPER_ADMIN"
                              ? "Full module control"
                              : "Assigned module access"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#7b716a]">
                            {buildAccessSummary(currentUser)}.
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-[#efe3d9] bg-[#fcfaf7] px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-[#2d6df6]" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                              Portal
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-[#1f1d1c]">
                            Accounting Admin
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#7b716a]">
                            {currentUser.storeId
                              ? "Store-scoped accounting portal with permission-based visibility."
                              : "Central finance workspace with branch-aware operational visibility."}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-[#f1e2d7] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7f0_100%)] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7f75]">
                              Session Status
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#1f1d1c]">
                              Active and secured
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-2 rounded-full bg-[#edf9f1] px-3 py-1 text-xs font-semibold text-[#1b7a50]">
                            <span className="h-2 w-2 rounded-full bg-[#18a66a]" />
                            Online
                          </span>
                        </div>
                      </div>
                      <form action="/accounting/logout" method="post">
                        <button
                          type="submit"
                          className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,#241f1c_0%,#3b332d_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(35,30,27,0.18)] transition hover:translate-y-[-1px]"
                        >
                          <LogOut className="h-4 w-4" />
                          Logout from Accounting
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {mobileOpen ? (
            <div className="border-b border-white/10 bg-[linear-gradient(180deg,#191b23_0%,#232839_100%)] lg:hidden">
              <nav className="accounting-sidebar-scroll max-h-[70vh] overflow-y-auto px-2 py-4">
                {allowedNavItems.map((item) => (
                  <SidebarItem
                    key={item.label}
                    item={item}
                    pathname={pathname}
                    expanded={mergedExpanded[item.label]}
                    onToggle={() => toggleItem(item.label)}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
              <div className="flex items-center justify-center gap-1.5 px-4 pb-3 text-[11px] text-white/48">
                <Copyright className="h-3 w-3" />
                <p>Solution by Dozen Digital (Pvt) Ltd</p>
              </div>
            </div>
          ) : null}

          <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
            <div className="rounded-[28px] sm:p-3">
              <div className="grid gap-4">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SidebarItem({
  item,
  pathname,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isActive =
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    item.children?.some((child) => pathname === child.href);

  if (!item.children) {
    return (
      <div className="mb-1">
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition ${
            isActive
              ? "bg-[linear-gradient(90deg,rgba(255,133,51,0.20)_0%,rgba(255,255,255,0.08)_100%)] font-medium text-[#ffb377] shadow-[inset_0_0_0_1px_rgba(255,179,119,0.16)]"
              : "text-white/78 hover:bg-white/8 hover:text-white"
          }`}
        >
          <Icon className="h-5 w-5" />
          {item.label}
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[15px] transition ${
          expanded
            ? "border-white/12 bg-[linear-gradient(90deg,rgba(255,133,51,0.20)_0%,rgba(255,255,255,0.08)_100%)] text-white shadow-[0_16px_28px_rgba(0,0,0,0.12)]"
            : "border-transparent text-white/78 hover:bg-white/8 hover:text-white"
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5" />
          {item.label}
        </span>
        <ChevronRight
          className={`h-4 w-4 transition-transform duration-200 ${
            expanded ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="ml-4 mt-2 border-l border-white/12 py-1 pl-4">
          {item.children.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={`block rounded-xl px-3 py-2 text-[15px] transition ${
                  childActive
                    ? "bg-white/10 font-medium text-[#ffb377]"
                    : "text-white/62 hover:bg-white/8 hover:text-white"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}
