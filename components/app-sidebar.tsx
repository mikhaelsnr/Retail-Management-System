"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Building2,
  CircleDollarSign,
  Gauge,
  PackageSearch,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Users,
  UserRound,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

type Props = {
  permissions: string[];
  fullName: string;
  branchName: string;
  defaultCollapsed: boolean;
  plain?: boolean;
};

const sections = [
  { label: "OPERATIONS", items: [
    ["Dashboard", "/dashboard", ["dashboard.view_all", "dashboard.view_branch"], Gauge],
    ["POS", "/pos", ["pos.use"], ShoppingCart],
    ["Sales", "/sales", ["sales.view_all", "sales.view_branch"], CircleDollarSign],
    ["Customers", "/customers", ["customers.view", "customers.manage"], UserRound],
  ] },
  { label: "CATALOG & STOCK", items: [
    ["Products", "/products", ["products.view", "products.manage"], Boxes],
    ["Inventory", "/inventory", ["inventory.view_all", "inventory.view_branch", "inventory.manage_all", "inventory.manage_branch"], PackageSearch],
  ] },
  { label: "MANAGEMENT", items: [
    ["Branches", "/branches", ["branches.view_all"], Building2],
    ["Users", "/users", ["users.view"], Users],
    ["Settings", "/settings", ["settings.manage"], Settings],
  ] },
] as const;

export function AppSidebar({ permissions, fullName, branchName, defaultCollapsed, plain = false }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(plain ? false : defaultCollapsed);

  return (
    <aside className={"tz-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r transition-all " + (collapsed ? "w-20 p-3" : "w-64 p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div className={collapsed ? "text-center" : ""}>
          <div className="text-lg font-bold">{collapsed ? "TZ" : "TechZone POS"}</div>
          {!collapsed && <div className="mt-1 text-xs text-muted-foreground">{branchName}</div>}
        </div>
        {!plain && <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="tz-icon-button rounded-lg border px-2 py-1 text-sm"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>}
      </div>

      <nav className="mt-7">
        {sections.map((section, sectionIndex) => {
          const items = section.items.filter((item) =>
            item[2].some((permission) => permissions.includes(permission))
          );
          if (!items.length) return null;
          return (
            <section
              key={section.label}
              className={sectionIndex > 0 ? "mt-5 border-t pt-5" : ""}
            >
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {items.map(([label, href, , Icon]) => {
                  const active = pathname === href ||
                    (href !== "/settings" && pathname.startsWith(href + "/"));
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      className={"tz-nav-item flex items-center rounded-md px-3 py-2 text-sm font-medium " + (active ? "is-active " : "") + (collapsed ? "justify-center" : "gap-3")}
                    >
                      {!plain && <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />}
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t pt-4">
        <Link href="/settings/preferences" className={"tz-nav-item flex items-center rounded-md px-3 py-2 text-sm " + (pathname === "/settings/preferences" ? "is-active" : "") + (collapsed ? " justify-center" : " gap-3")}>
          {!plain && <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />}
          {!collapsed && <span>My Preferences</span>}
        </Link>
        <LogoutButton collapsed={collapsed} showIcon={!plain} />
        {!collapsed && <div><div className="text-sm font-medium">{fullName}</div><div className="text-xs text-muted-foreground">{branchName}</div></div>}
      </div>
    </aside>
  );
}
