import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-2">
          <FileQuestion className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">404 — Halaman Tidak Ditemukan</h2>
        <p className="text-xs text-slate-500">
          Halaman atau transaksi yang Anda cari tidak ditemukan atau telah dipindahkan.
        </p>
        <div className="pt-2">
          <Link href="/dashboard">
            <Button variant="default">Kembali ke Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
