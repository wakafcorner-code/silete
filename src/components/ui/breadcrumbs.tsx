"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Maps URL segments to user-friendly labels.
 */
const ROUTE_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  sales: "Penjualan",
  purchasing: "Pembelian",
  inventory: "Inventori",
  finance: "Keuangan",
  accounting: "Akuntansi",
  master: "Data Master",
  invoices: "Faktur",
  orders: "Pesanan",
  movements: "Mutasi",
  adjustments: "Penyesuaian",
  stock: "Stok",
  receiving: "Penerimaan",
  deliveries: "Pengiriman",
  bank: "Bank",
  cash: "Kas",
  expenses: "Biaya",
  ar: "Piutang (AR)",
  ap: "Hutang (AP)",
  assets: "Aset Tetap",
  admin: "Administrasi",
  audit: "Audit Log",
  analysis: "Analisa Usaha",
};

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter((s) => s && s !== "dashboard");

  if (pathname === "/dashboard") return null;

  return (
    <nav className={cn("flex items-center text-[11px] font-medium text-slate-500 overflow-x-auto no-scrollbar whitespace-nowrap py-1", className)}>
      <Link
        href="/dashboard"
        className="flex items-center hover:text-indigo-600 transition-colors"
      >
        <Home className="w-3 h-3 mr-1.5" />
        Dashboard
      </Link>

      {segments.map((segment, idx) => {
        const path = `/dashboard/${segments.slice(0, idx + 1).join("/")}`;
        const label = ROUTE_MAP[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
        const isLast = idx === segments.length - 1;

        return (
          <React.Fragment key={path}>
            <ChevronRight className="w-3 h-3 mx-2 text-slate-300 shrink-0" />
            {isLast ? (
              <span className="text-slate-900 font-semibold">{label}</span>
            ) : (
              <Link
                href={path}
                className="hover:text-indigo-600 transition-colors"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
