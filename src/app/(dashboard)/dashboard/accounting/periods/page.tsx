"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter, FormField } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ExportButtons } from "@/components/ui/export-buttons";
import { Calendar, Plus, Lock, Unlock, Loader2, RefreshCw, AlertCircle } from "lucide-react";

interface FinancialPeriod {
  id: number;
  period_name: string;
  start_date: string;
  end_date: string;
  status: "open" | "closing" | "closed";
  closed_at?: string | null;
  closed_by?: number | null;
}

export default function FinancialPeriodsPage() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    period_name: `Periode ${currentYear}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}`,
    start_date: `${currentYear}-01-01`,
    end_date: `${currentYear}-12-31`,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/silete/api/accounting/financial-periods");
      const data = await res.json();
      if (data.data) setPeriods(data.data);
    } catch {
      toast("error", "Gagal memuat data periode keuangan");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    const nextMonth = (new Date().getMonth() + 1).toString().padStart(2, "0");
    setForm({
      period_name: `Tahun ${currentYear} Bulan ${nextMonth}`,
      start_date: `${currentYear}-${nextMonth}-01`,
      end_date: `${currentYear}-${nextMonth}-28`,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.period_name.trim()) errs.period_name = "Nama periode wajib diisi";
    if (!form.start_date) errs.start_date = "Tanggal mulai wajib diisi";
    if (!form.end_date) errs.end_date = "Tanggal akhir wajib diisi";
    if (form.start_date > form.end_date) errs.end_date = "Tanggal akhir harus setelah tanggal mulai";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/silete/api/accounting/financial-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_name: form.period_name.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat periode");

      toast("success", "Periode keuangan baru berhasil dibuat");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClose = async (period: FinancialPeriod) => {
    const isClosing = period.status === "open";
    const endpoint = isClosing
      ? `/silete/api/accounting/financial-periods/${period.id}/close`
      : `/silete/api/accounting/financial-periods/${period.id}/reopen`;

    setActionLoadingId(period.id);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Gagal ${isClosing ? "menutup" : "membuka"} periode`);

      toast(
        "success",
        isClosing
          ? `Periode "${period.period_name}" berhasil DITUTUP (Terkunci)`
          : `Periode "${period.period_name}" berhasil DIBUKA KEMBALI`
      );
      fetchData();
    } catch (err) {
      toast("error", "Gagal mengubah status periode", err instanceof Error ? err.message : undefined);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Periode Keuangan (Financial Periods)
            </h1>
            <Badge variant="outline" className="text-xs">Accounting Engine</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pengendalian tutup buku bulanan/tahunan. Periode berstatus CLOSED akan menolak posting jurnal baru.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={periods.map((p) => ({
              nama_periode: p.period_name,
              tgl_mulai: p.start_date,
              tgl_akhir: p.end_date,
              status: p.status === "closed" ? "Terkunci (Closed)" : "Terbuka (Open)",
              tgl_tutup: p.closed_at ?? "-",
            }))}
            columns={[
              { header: "Nama Periode", key: "nama_periode", align: "left" },
              { header: "Tanggal Mulai", key: "tgl_mulai", align: "left" },
              { header: "Tanggal Akhir", key: "tgl_akhir", align: "left" },
              { header: "Status Periode", key: "status", align: "center" },
              { header: "Tanggal Ditutup", key: "tgl_tutup", align: "left" },
            ]}
            filename="daftar_periode_keuangan"
            title="Daftar Periode Akuntansi Keuangan"
            subtitle="Status periode akuntansi & penutupan buku — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Periode Baru
          </Button>
        </div>
      </div>

      {/* Rules Notice */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-slate-900">Aturan Penguncian Tutup Buku (Period Closing Rules):</p>
            <p>
              1. Transaksi jurnal pada tanggal di dalam periode <strong>CLOSED</strong> tidak dapat diubah, ditambah, atau dihapus.<br />
              2. Penyesuaian transaksi masa lalu harus melalui Jurnal Koreksi pada periode berjalan yang berstatus <strong>OPEN</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Daftar Periode Pembukuan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {periods.length} Periode
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Menampilkan rentang tanggal aktif dan status penguncian buku besar per perusahaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : periods.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada periode keuangan terdaftar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Periode</TableHead>
                    <TableHead>Tanggal Mulai</TableHead>
                    <TableHead>Tanggal Akhir</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Waktu Tutup Buku</TableHead>
                    <TableHead className="text-center">Aksi / Kontrol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold text-xs text-slate-900">
                        {p.period_name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {new Date(p.start_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {new Date(p.end_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === "closed" ? "secondary" : "success"}>
                          {p.status === "closed" ? "Closed (Terkunci)" : "Open (Aktif)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {p.closed_at ? new Date(p.closed_at).toLocaleString("id-ID") : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className={
                            p.status === "open"
                              ? "h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 gap-1"
                              : "h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
                          }
                          onClick={() => handleToggleClose(p)}
                          disabled={actionLoadingId === p.id}
                        >
                          {actionLoadingId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : p.status === "open" ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                          {p.status === "open" ? "Tutup Buku (Close)" : "Buka Kembali (Reopen)"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Tambah Periode Keuangan Baru"
          description="Tentukan rentang tanggal pembukuan dan nama periode akuntansi."
          onClose={() => setDialogOpen(false)}
        />

        <div className="space-y-4">
          <FormField label="Nama Periode" required error={errors.period_name}>
            <Input
              placeholder="Mis. Bulan September 2026"
              value={form.period_name}
              onChange={(e) => setForm({ ...form, period_name: e.target.value })}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tanggal Mulai" required error={errors.start_date}>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="Tanggal Akhir" required error={errors.end_date}>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </FormField>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Buat Periode"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
