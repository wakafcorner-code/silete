"use client";

import React, { Suspense, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ForbiddenBanner } from "@/components/ui/forbidden-banner";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* Sidebar Navigation */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            className="fixed inset-0 z-40 bg-slate-950/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* 403 Forbidden banner — shown when middleware denies access */}
              <Suspense fallback={null}>
                <ForbiddenBanner />
              </Suspense>
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
