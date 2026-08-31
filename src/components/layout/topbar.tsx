"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, User as UserIcon, LogOut, Loader2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { UserSessionPayload } from "@/services/session-service";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [user, setUser] = useState<UserSessionPayload | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            setUser(data.user);
          }
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      }
    }
    loadUser();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  const primaryRole = user?.roles[0] || "VIEWER";

  return (
    <header className="min-h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <button
          type="button"
          aria-label="Buka menu navigasi"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 md:hidden transition-colors"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden md:block">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <div className="hidden sm:block">
          <CompanySwitcher />
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 pr-1 border-r border-slate-100">
          {/* Search Button (Mobile-ish) */}
          <button
            type="button"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Cari"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notifications */}
          <button
            type="button"
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Notifikasi"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-indigo-600 rounded-full ring-2 ring-white" />
          </button>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 group cursor-default">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs group-hover:bg-indigo-100 transition-colors">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-[11px] font-bold text-slate-900 leading-none">
                {user?.name || "Memuat..."}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 leading-none">
                {primaryRole}
              </span>
            </div>
          </div>

          <Button
            onClick={handleLogout}
            disabled={loggingOut}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all ml-1"
            title="Keluar (Logout)"
          >
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
