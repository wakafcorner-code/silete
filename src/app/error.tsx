"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log error to monitoring service
    console.error("Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-2">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Terjadi Kesalahan Sistem</h2>
        <p className="text-xs text-slate-500">
          Maaf, terjadi masalah saat memproses permintaan Anda. Sistem telah mencatat kejadian ini.
        </p>
        {error.message && (
          <pre className="p-3 bg-slate-100 rounded text-[11px] text-slate-700 text-left overflow-auto font-mono max-h-32">
            {error.message}
          </pre>
        )}
        <div className="pt-2 flex gap-3 justify-center">
          <Button onClick={() => reset()} variant="default">
            Coba Lagi
          </Button>
          <Button onClick={() => router.push("/dashboard")} variant="outline">
            Kembali ke Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
