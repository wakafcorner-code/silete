"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVIGATION_SECTIONS } from "@/config/nav";
import { NavItem } from "@/types";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import {
  LayoutDashboard,
  CheckSquare,
  Database,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Wallet,
  CreditCard,
  BookOpen,
  Building2,
  ArrowLeftRight,
  FileText,
  Briefcase,
  Users,
  ShieldAlert,
  Settings,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Lock,
  X,
  Camera,
} from "lucide-react";

// Icon mapping helper
const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  CheckSquare,
  Database,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Wallet,
  CreditCard,
  BookOpen,
  Building2,
  ArrowLeftRight,
  FileText,
  Briefcase,
  Users,
  ShieldAlert,
  Settings,
  Layers,
  Lock,
  Camera,
};

// Badge color per role
const ROLE_BADGE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-red-700 text-red-100",
  OWNER: "bg-purple-700 text-purple-100",
  DIRECTOR: "bg-purple-600 text-purple-100",
  ADMIN: "bg-blue-700 text-blue-100",
  COMPANY_ADMIN: "bg-blue-600 text-blue-100",
  FINANCE_MANAGER: "bg-emerald-700 text-emerald-100",
  FINANCE: "bg-emerald-600 text-emerald-100",
  WAREHOUSE_ADMIN: "bg-amber-600 text-amber-100",
  WAREHOUSE: "bg-amber-500 text-amber-100",
  PURCHASING: "bg-orange-600 text-orange-100",
  SALES: "bg-cyan-600 text-cyan-100",
  AUDITOR: "bg-slate-600 text-slate-100",
  VIEWER: "bg-slate-500 text-slate-100",
};

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { session, loading, hasPermission } = useSession();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [activeCompany, setActiveCompany] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    async function fetchActiveCompany() {
      try {
        const res = await fetch("/silete/api/companies/active");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.company) {
            setActiveCompany({ id: Number(data.company.id), name: data.company.name });
          }
        }
      } catch (err) {
        console.error("Sidebar failed to fetch active company:", err);
      }
    }
    if (!loading && session) {
      fetchActiveCompany();
    }
  }, [loading, session, pathname]); // Re-fetch on pathname change as a simple sync trigger

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const primaryRole = session?.roles?.[0] ?? "VIEWER";
  const badgeStyle = ROLE_BADGE_STYLES[primaryRole] ?? "bg-slate-600 text-slate-100";
  const isSuperAdmin = session?.roles?.includes("SUPER_ADMIN");

  /**
   * Filter a NavItem against the current user's permissions.
   * Returns null if the user has no permission for the item.
   * For group items, also filters children and hides the group if no children are accessible.
   */
  function filterItem(item: NavItem): NavItem | null {
    if (!hasPermission(item.requiredPermission)) return null;

    if (item.children && item.children.length > 0) {
      const visibleChildren = item.children
        .map((child) => (hasPermission(child.requiredPermission) ? child : null))
        .filter(Boolean) as NavItem[];

      // Only show group if it has at least one accessible child
      if (visibleChildren.length === 0) return null;
      return { ...item, children: visibleChildren };
    }

    return item;
  }

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 w-64 bg-slate-950 text-slate-400 flex flex-col h-screen border-r border-slate-900 shrink-0 select-none transition-transform duration-200 md:static md:z-auto md:translate-x-0",
      open ? "translate-x-0" : "-translate-x-full"
    )}>
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-900 gap-3 bg-slate-950">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
          S
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold text-white tracking-tight text-base leading-none">SILETE</span>
          <span className="text-[10px] text-indigo-400/80 font-bold uppercase tracking-widest mt-0.5">Enterprise</span>
        </div>
        <button
          type="button"
          aria-label="Tutup menu navigasi"
          className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Current User Info */}
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/50">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Memuat sesi...</span>
          </div>
        ) : session ? (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0">
              {session.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {session.name}
              </span>
              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-sm mt-0.5 inline-block w-fit font-mono uppercase tracking-wide", badgeStyle)}>
                {primaryRole.replace("_", " ")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500">
            <Lock className="w-3.5 h-3.5" />
            <span className="text-xs">Tidak terautentikasi</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
        {NAVIGATION_SECTIONS.map((section, idx) => {
          // Filter all items in this section
          const visibleItems = section.items
            .map(filterItem)
            .filter(Boolean) as NavItem[];

          // Don't render section if no visible items
          if (visibleItems.length === 0 && !loading) return null;

          return (
            <div key={idx} className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {section.title}
              </p>
              <div className="space-y-0.5 pt-1">
                {loading
                  ? // Skeleton loaders while fetching session
                    [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-7 mx-1 rounded-md bg-slate-800/50 animate-pulse"
                      />
                    ))
                  : visibleItems.map((item) => {
                      const IconComponent = item.icon
                        ? iconMap[item.icon] || Layers
                        : Layers;
                      const hasChildren =
                        item.children && item.children.length > 0;
                      const isOpen = openGroups[item.title] ?? false;
                      const isItemActive =
                        pathname === item.href ||
                        (hasChildren &&
                          item.children?.some((c) => pathname === c.href));

                      if (hasChildren) {
                        return (
                          <div key={item.title} className="space-y-0.5">
                            <button
                              type="button"
                              onClick={() => toggleGroup(item.title)}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer",
                                isItemActive
                                  ? "bg-indigo-600/10 text-white"
                                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <IconComponent className={cn("w-4 h-4", isItemActive ? "text-indigo-400" : "text-slate-500")} />
                                <span>{item.title}</span>
                              </div>
                              {isOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                              )}
                            </button>

                            {isOpen && (
                              <div className="pl-6 space-y-0.5 pt-0.5 border-l border-slate-800 ml-5 my-1">
                                {item.children?.map((child) => {
                                  const isChildActive = pathname === child.href;
                                  return (
                                    <Link
                                      key={child.href}
                                      href={child.href}
                                      className={cn(
                                        "block px-3 py-1.5 text-xs rounded-md transition-all duration-200",
                                        isChildActive
                                          ? "bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-500/20"
                                          : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                                      )}
                                    >
                                      {child.title}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200",
                            isItemActive
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                              : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <IconComponent className={cn("w-4 h-4", isItemActive ? "text-white" : "text-slate-500")} />
                            <span>{item.title}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
              </div>
            </div>
          );
        })}

        {/* Super Admin badge */}
        {isSuperAdmin && (
          <div className="mx-1 mt-2 px-3 py-2 rounded-md bg-red-950/40 border border-red-900/30 text-[10px] text-red-400 font-mono">
            ⚠ Mode Super Admin — akses penuh ke semua modul
          </div>
        )}
      </div>

      {/* Footer / Current Company Badge */}
      <div className="p-4 border-t border-slate-900 bg-slate-950">
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-800 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-indigo-400 uppercase font-black tracking-widest">
              Active Entity
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs text-slate-200 font-bold truncate">
              {activeCompany ? activeCompany.name : "System Loading..."}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
