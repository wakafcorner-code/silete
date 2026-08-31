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
import { Users, Edit2, Loader2, Mail, Phone, Plus, RefreshCw, Search } from "lucide-react";

interface Customer {
  id: number;
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  credit_limit: string;
  status: "active" | "inactive";
}

const EMPTY_FORM = {
  code: "", name: "", contact_person: "", email: "", phone: "",
  address: "", tax_number: "", credit_limit: "0", status: "active",
};

export default function CustomersPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/silete/api/customers?limit=100&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success) setCustomers(data.data || []);
    } catch {
      toast("error", "Gagal memuat data pelanggan");
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      code: c.code, name: c.name,
      contact_person: c.contact_person || "", email: c.email || "",
      phone: c.phone || "", address: c.address || "",
      tax_number: c.tax_number || "",
      credit_limit: c.credit_limit || "0",
      status: c.status,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Kode wajib diisi";
    if (!form.name.trim()) errs.name = "Nama wajib diisi";
    if (isNaN(Number(form.credit_limit)) || Number(form.credit_limit) < 0)
      errs.credit_limit = "Limit kredit tidak valid";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        code: form.code.trim(), name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        tax_number: form.tax_number.trim() || null,
        credit_limit: Number(form.credit_limit),
        status: form.status,
      };
      const url = editingId ? `/silete/api/customers/${editingId}` : "/silete/api/customers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      toast("success", editingId ? "Pelanggan berhasil diperbarui" : "Pelanggan berhasil ditambahkan");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const setField = (f: string, v: string) => {
    setForm((p) => ({ ...p, [f]: v }));
    if (errors[f]) setErrors((p) => ({ ...p, [f]: "" }));
  };

  const formatCurrency = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return "Rp 0";
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(num);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Pelanggan</h1>
            <Badge variant="outline" className="text-xs">Master Data</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Pengelolaan data pelanggan, mitra dagang, dan batas kredit penjualan.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Tambah Pelanggan
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Cari pelanggan..." className="pl-8 h-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />Daftar Pelanggan Terdaftar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">{customers.length} Pelanggan</Badge>
          </div>
          <CardDescription className="text-xs">Data kontak pelanggan dan batas kredit yang diizinkan.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : customers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada pelanggan dengan kata kunci "${search}"` : "Belum ada pelanggan terdaftar."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Pelanggan</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead className="text-right">Limit Kredit</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-semibold">{c.code}</TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                        {c.contact_person && <p className="text-xs text-slate-500">{c.contact_person}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {c.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{c.phone}</div>}
                        {c.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" />{c.email}</div>}
                        {!c.phone && !c.email && "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(c.credit_limit)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={c.status === "active" ? "success" : "secondary"}>
                          {c.status === "active" ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(c)}>
                          <Edit2 className="w-3.5 h-3.5" />
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-lg">
        <DialogHeader
          title={editingId ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}
          description="Informasi kontak dan batas kredit pelanggan"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode" required error={errors.code}>
              <Input placeholder="Mis. CUS-001" value={form.code} onChange={(e) => setField("code", e.target.value)} disabled={!!editingId} />
            </FormField>
            <FormField label="Limit Kredit (Rp)" error={errors.credit_limit}>
              <Input type="number" min="0" placeholder="0" value={form.credit_limit} onChange={(e) => setField("credit_limit", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Nama Pelanggan" required error={errors.name}>
            <Input placeholder="Nama lengkap pelanggan/perusahaan" value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </FormField>
          <FormField label="Contact Person">
            <Input placeholder="Nama PIC" value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="No. Telepon">
              <Input placeholder="08xx-xxxx" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </FormField>
            <FormField label="Email">
              <Input type="email" placeholder="email@pelanggan.com" value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </FormField>
          </div>
          <FormField label="NPWP / Tax ID">
            <Input placeholder="No. NPWP" value={form.tax_number} onChange={(e) => setField("tax_number", e.target.value)} />
          </FormField>
          <FormField label="Status">
            <Select value={form.status} onChange={(e) => setField("status", e.target.value)}>
              <option value="active">Aktif</option>
              <option value="inactive">Non-Aktif</option>
            </Select>
          </FormField>
          <FormField label="Alamat">
            <Textarea placeholder="Alamat lengkap" value={form.address} onChange={(e) => setField("address", e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : editingId ? "Simpan Perubahan" : "Tambah Pelanggan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
