"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter, FormField } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Building2, Plus, ShieldCheck, Loader2, RefreshCw } from "lucide-react";

interface Company {
  id: number;
  code: string;
  name: string;
  legal_name?: string | null;
  tax_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  currency_code: string;
  timezone: string;
  status: "active" | "inactive";
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    legal_name: "",
    tax_number: "",
    address: "",
    phone: "",
    email: "",
    currency_code: "IDR",
    status: "active" as "active" | "inactive",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
      }
    } catch {
      toast("error", "Gagal memuat data entitas perusahaan");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      code: `COMP-${Date.now().toString().slice(-3)}`,
      name: "",
      legal_name: "",
      tax_number: "",
      address: "",
      phone: "",
      email: "",
      currency_code: "IDR",
      status: "active",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Kode perusahaan wajib diisi";
    if (!form.name.trim()) errs.name = "Nama perusahaan wajib diisi";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        tax_number: form.tax_number.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        currency_code: form.currency_code,
        timezone: "Asia/Jakarta",
        status: form.status,
      };

      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat perusahaan");

      toast("success", "Perusahaan baru berhasil didaftarkan");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Manajemen Perusahaan
            </h1>
            <Badge variant="outline" className="text-xs">Multi-Company</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Daftar entitas bisnis yang terdaftar dalam sistem ERP terpadu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Perusahaan
          </Button>
        </div>
      </div>

      {/* Security Rule Card */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-3 shadow-xs">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-950">Isolasi Data Perusahaan (Company-Level Isolation)</p>
          <p className="text-blue-800 text-[11px] mt-0.5">
            Semua transaksi, gudang, inventori, pembelian, penjualan, kas, dan jurnal akuntansi diisolasi secara ketat berdasarkan <code className="font-mono bg-blue-100 px-1 py-0.5 rounded">company_id</code>.
          </p>
        </div>
      </div>

      {/* Companies Table */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Entitas Perusahaan Terdaftar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {companies.length} Entitas
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Perusahaan yang memiliki akses data operasional dan buku besar terpisah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : companies.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada perusahaan terdaftar yang dapat diakses.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>ID</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Perusahaan</TableHead>
                    <TableHead>Nama Legal / PT</TableHead>
                    <TableHead>Mata Uang</TableHead>
                    <TableHead>Kontak & Alamat</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((comp) => (
                    <TableRow key={comp.id} className="text-xs">
                      <TableCell className="font-mono text-slate-500">#{comp.id}</TableCell>
                      <TableCell className="font-mono font-semibold text-slate-900">{comp.code}</TableCell>
                      <TableCell className="font-medium text-slate-900">{comp.name}</TableCell>
                      <TableCell className="text-slate-600">{comp.legal_name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{comp.currency_code}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-xs truncate">
                        {comp.phone ? `${comp.phone} • ` : ""}{comp.address || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={comp.status === "active" ? "secondary" : "destructive"}
                          className={`text-[10px] ${comp.status === "active" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : ""}`}
                        >
                          {comp.status === "active" ? "AKTIF" : "NON-AKTIF"}
                        </Badge>
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
          title="Daftarkan Perusahaan Baru"
          description="Pendaftaran entitas bisnis baru dalam ekosistem multi-company"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode Entitas" required error={errors.code}>
              <Input
                placeholder="Mis. CMP01"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              />
            </FormField>
            <FormField label="Mata Uang">
              <Select
                value={form.currency_code}
                onChange={(e) => setForm((p) => ({ ...p, currency_code: e.target.value }))}
              >
                <option value="IDR">IDR (Rupiah)</option>
                <option value="USD">USD (Dollar)</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Nama Perusahaan" required error={errors.name}>
            <Input
              placeholder="Mis. PT Maju Bersama"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </FormField>

          <FormField label="Nama Badan Hukum (Legal Name)">
            <Input
              placeholder="Nama resmi akta pendirian"
              value={form.legal_name}
              onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="NPWP / Tax ID">
              <Input
                placeholder="Nomor pokok wajib pajak"
                value={form.tax_number}
                onChange={(e) => setForm((p) => ({ ...p, tax_number: e.target.value }))}
              />
            </FormField>
            <FormField label="No. Telepon">
              <Input
                placeholder="021-xxxx"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Alamat Kantor">
            <Textarea
              placeholder="Alamat kantor pusat perusahaan..."
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Daftarkan Perusahaan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
