"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ShieldCheck, Lock, User, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal masuk. Periksa email/username dan kata sandi Anda.");
      }

      // Successful login -> navigate to callbackUrl or dashboard
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (user: string, pass: string) => {
    setIdentifier(user);
    setPassword(pass);
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SILETE</h1>
          <p className="text-xs text-slate-400">
            Sistem Terpadu Multi-Company & Akuntansi Keuangan
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-800 bg-slate-900/90 backdrop-blur-sm text-white shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-white">Masuk ke Sistem</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Masukkan kredensial akun Anda untuk mengakses sistem ERP.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-start gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-slate-200 text-xs">
                  Email atau Nama Pengguna
                </Label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="superadmin atau admin@erp.local"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-9 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-200 text-xs">
                    Kata Sandi
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-9 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              {/* Demo Quick Logins */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Uji Coba Peran (Role Test Accounts):</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin("superadmin", "SuperAdmin@123456")}
                    className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer"
                  >
                    Super Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin("finance", "Finance@123456")}
                    className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer"
                  >
                    Finance
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin("warehouse", "Warehouse@123456")}
                    className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer"
                  >
                    Warehouse
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin("viewer", "Viewer@123456")}
                    className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer"
                  >
                    Viewer
                  </button>
                </div>
              </div>

              <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-lg text-xs text-blue-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Sesi aman terenkripsi JWT (HttpOnly Cookie) dengan verifikasi Role-Based Access Control (RBAC).
                </span>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3">
              <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Masuk ke Dashboard"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Security Footer */}
        <div className="text-center text-[11px] text-slate-500">
          SILETE System &copy; 2026. Autentikasi Server-Side Aktif.
        </div>
      </div>
    </main>
  );
}
