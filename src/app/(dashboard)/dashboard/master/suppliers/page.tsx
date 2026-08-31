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
import { Truck, Edit2, Loader2, Mail, Phone, Plus, RefreshCw, Search } from "lucide-react";

interface Supplier {
  id: number;
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  payment_terms_days: number;
  status: "active" | "inactive";
}

const EMPTY_FORM = {
  code: "", name: "", contact_person: "", email: "", phone: "",
  address: "", tax_number: "", payment_terms_days: "30", status: "active",
};

export default function SuppliersPage() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
      const res = await fetch(`/api/suppliers?limit=100&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success) setSuppliers(data.data || []);
    } catch {
      toast("error", "Gagal memuat data supplier");
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

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      code: s.code, name: s.name,
      contact_person: s.contact_person || "", email: s.email || "",
      phone: s.phone || "", address: s.address || "",
      tax_number: s.tax_number || "",
      payment_terms_days: s.payment_terms_days.toString(),
      status: s.status,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Kode wajib diisi";
    if (!form.name.trim()) errs.name = "Nama wajib diisi";
    if (isNaN(Number(form.payment_terms_days)) || Number(form.payment_terms_days) < 0)
      errs.payment_terms_days = "Termin tidak valid";
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
        payment_terms_days: Number(form.payment_terms_days),
        status: form.status,
      };
      const url = editingId ? `/api/suppliers/${editingId}` : "/api/suppliers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      toast("success", editingId ? "Supplier berhasil diperbarui" : "Supplier berhasil ditambahkan");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Pemasok (Suppliers)</h1>
            <Badge variant="outline" className="text-xs">Master Data</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Pengelolaan mitra pemasok barang, vendor, dan syarat pembayaran pembelian.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Tambah Pemasok
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Cari pemasok..." className="pl-8 h-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />Daftar Pemasok Terdaftar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">{suppliers.length} Pemasok</Badge>
          </div>
          <CardDescription className="text-xs">Data kontak vendor dan ketentuan termin pembayaran pada perusahaan aktif.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : suppliers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada supplier dengan kata kunci "${search}"` : "Belum ada pemasok terdaftar."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Pemasok</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead className="text-center">Termin</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-semibold">{s.code}</TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                        {s.contact_person && <p className="text-xs text-slate-500">{s.contact_person}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {s.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{s.phone}</div>}
                        {s.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" />{s.email}</div>}
                        {!s.phone && !s.email && "-"}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">{s.payment_terms_days} hari</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.status === "active" ? "success" : "secondary"}>
                          {s.status === "active" ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(s)}>
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
          title={editingId ? "Edit Pemasok" : "Tambah Pemasok Baru"}
          description="Informasi kontak dan ketentuan pembayaran supplier"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode" required error={errors.code}>
              <Input placeholder="Mis. SUP-001" value={form.code} onChange={(e) => setField("code", e.target.value)} disabled={!!editingId} />
            </FormField>
            <FormField label="Termin Bayar (hari)" error={errors.payment_terms_days}>
              <Input type="number" min="0" placeholder="30" value={form.payment_terms_days} onChange={(e) => setField("payment_terms_days", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Nama Pemasok" required error={errors.name}>
            <Input placeholder="Nama lengkap pemasok/vendor" value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </FormField>
          <FormField label="Contact Person">
            <Input placeholder="Nama PIC" value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="No. Telepon">
              <Input placeholder="08xx-xxxx" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </FormField>
            <FormField label="Email">
              <Input type="email" placeholder="email@pemasok.com" value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </FormField>
          </div>
          <FormField label="NPWP / Tax ID">
            <Input placeholder="No. NPWP perusahaan" value={form.tax_number} onChange={(e) => setField("tax_number", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                <option value="active">Aktif</option>
                <option value="inactive">Non-Aktif</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Alamat">
            <Textarea placeholder="Alamat lengkap" value={form.address} onChange={(e) => setField("address", e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : editingId ? "Simpan Perubahan" : "Tambah Pemasok"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
