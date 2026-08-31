"use client";
import React from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { useState } from "react";

export function ForbiddenBanner() {
  const params = useSearchParams();
  const error = params.get("error");
  const from = params.get("from");
  const [dismissed, setDismissed] = useState(false);

  if (error !== "forbidden" || dismissed) return null;

  return (
    <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
      <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">Akses Ditolak (403 Forbidden)</p>
        <p className="text-red-600 mt-0.5">
          Anda tidak memiliki izin untuk mengakses halaman{" "}
          <code className="font-mono bg-red-100 px-1 rounded">{from || "tersebut"}</code>.
          {" "}Hubungi administrator sistem untuk meminta akses.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-red-400 hover:text-red-600 ml-2"
        title="Tutup"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
