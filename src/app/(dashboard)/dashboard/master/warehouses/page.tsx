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
import { Boxes, Edit2, GitBranch, Loader2, Plus, RefreshCw } from "lucide-react";

interface Warehouse {
  id: number;
  code: string;
  name: string;
  address?: string;
  branch_id?: number | null;
  branch_name?: string;
  status: "active" | "inactive";
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

const EMPTY_WH = { code: "", name: "", address: "", branch_id: "", status: "active" };

export default function WarehousesMasterPage() {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_WH });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, brRes] = await Promise.all([
        fetch("api/warehouses"),
        fetch("api/branches"),
      ]);
      const whData = await whRes.json();
      const brData = await brRes.json();
      if (whData.success) setWarehouses(whData.warehouses || []);
      if (brData.success) setBranches(brData.branches || brData.data || []);
    } catch {
      toast("error", "Gagal memuat data gudang");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_WH });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setForm({
      code: w.code,
      name: w.name,
      address: w.address || "",
      branch_id: w.branch_id?.toString() || "",
      status: w.status,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Kode gudang wajib diisi";
    if (!form.name.trim()) errs.name = "Nama gudang wajib diisi";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim() || null,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        status: form.status,
      };

      const url = editingId ? `/api/warehouses/${editingId}` : "/api/warehouses";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      toast("success", editingId ? "Gudang berhasil diperbarui" : "Gudang berhasil ditambahkan");
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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gudang & Cabang</h1>
            <Badge variant="outline" className="text-xs">Master Organisasi</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Pengelolaan lokasi cabang fisik dan titik penyimpanan gudang per perusahaan aktif.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Gudang
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouses */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                Daftar Gudang
              </CardTitle>
              <Badge variant="secondary" className="text-[11px] font-mono">{warehouses.length} Gudang</Badge>
            </div>
            <CardDescription className="text-xs">Lokasi penyimpanan fisik untuk mutasi stok dan inventori.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : warehouses.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada gudang untuk perusahaan ini.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Gudang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-mono text-xs font-semibold">{wh.code}</TableCell>
                      <TableCell className="font-medium text-slate-900">{wh.name}</TableCell>
                      <TableCell>
                        <Badge variant={wh.status === "active" ? "success" : "secondary"}>
                          {wh.status === "active" ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(wh)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Branches */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                Daftar Cabang
              </CardTitle>
              <Badge variant="secondary" className="text-[11px] font-mono">{branches.length} Cabang</Badge>
            </div>
            <CardDescription className="text-xs">Kantor cabang operasional yang terhubung dengan akun perusahaan.</CardDescription>
          </CardHeader>
          <CardContent>
            {branches.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada cabang terdaftar.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Cabang</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs font-semibold">{b.code}</TableCell>
                      <TableCell className="font-medium text-slate-900">{b.name}</TableCell>
                      <TableCell>
                        <Badge variant="success">Aktif</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader
          title={editingId ? "Edit Gudang" : "Tambah Gudang Baru"}
          description={editingId ? "Perbarui informasi gudang" : "Isi detail gudang baru"}
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode Gudang" required error={errors.code}>
              <Input
                placeholder="Mis. WH-001"
                value={form.code}
                onChange={(e) => setField("code", e.target.value)}
                disabled={!!editingId}
              />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                <option value="active">Aktif</option>
                <option value="inactive">Non-Aktif</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Nama Gudang" required error={errors.name}>
            <Input placeholder="Nama lengkap gudang" value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </FormField>
          <FormField label="Cabang (opsional)">
            <Select value={form.branch_id} onChange={(e) => setField("branch_id", e.target.value)}>
              <option value="">-- Gudang Pusat --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Alamat">
            <Textarea placeholder="Alamat lengkap gudang" value={form.address} onChange={(e) => setField("address", e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : editingId ? "Simpan Perubahan" : "Tambah Gudang"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
