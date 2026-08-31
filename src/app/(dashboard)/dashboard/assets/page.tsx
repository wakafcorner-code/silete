"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter, FormField } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ExportButtons } from "@/components/ui/export-buttons";
import { Landmark, Plus, Calculator, Trash2, Loader2, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Asset {
  id: number;
  asset_code: string;
  name: string;
  category_name?: string;
  acquisition_date: string;
  acquisition_cost: string;
  accumulated_depreciation: string;
  book_value: string;
  residual_value: string;
  useful_life_months?: number;
  status: "active" | "disposed" | "fully_depreciated";
}

interface AssetCategory {
  id: number;
  name: string;
  code: string;
  useful_life_months: number;
}

export default function AssetsPage() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [disposeDialogOpen, setDisposeDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    asset_code: `AST-${Date.now().toString().slice(-4)}`,
    name: "",
    category_id: "",
    acquisition_date: today,
    acquisition_cost: "0",
    residual_value: "0",
    payment_account_code: "1100" as "1100" | "1110" | "2100",
  });

  const [disposeForm, setDisposeForm] = useState({
    disposal_date: today,
    proceeds: "0",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch("/silete/api/assets?limit=100"),
        fetch("/silete/api/assets/categories"),
      ]);

      const aData = await aRes.json();
      const cData = await cRes.json();

      setAssets(aData.data || aData.assets || []);
      setCategories(cData.data || cData.categories || []);
    } catch {
      toast("error", "Gagal memuat data aset tetap");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      asset_code: `AST-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: "",
      category_id: categories[0]?.id.toString() || "",
      acquisition_date: today,
      acquisition_cost: "0",
      residual_value: "0",
      payment_account_code: "1100",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.asset_code.trim()) errs.asset_code = "Kode aset wajib diisi";
    if (!form.name.trim()) errs.name = "Nama aset wajib diisi";
    if (!form.category_id) errs.category_id = "Kategori aset wajib dipilih";
    if (isNaN(Number(form.acquisition_cost)) || Number(form.acquisition_cost) <= 0) {
      errs.acquisition_cost = "Harga perolehan harus > 0";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        asset_code: form.asset_code.trim(),
        name: form.name.trim(),
        category_id: Number(form.category_id),
        acquisition_date: form.acquisition_date,
        acquisition_cost: Number(form.acquisition_cost),
        residual_value: Number(form.residual_value) || 0,
        payment_account_code: form.payment_account_code,
        post_acquisition_journal: true,
      };

      const res = await fetch("/silete/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mendaftarkan aset");

      toast("success", "Aset tetap berhasil didaftarkan & jurnal perolehan diposting");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDepreciate = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/silete/api/assets/${id}/depreciate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depreciation_date: today }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyusutkan aset");

      toast("success", "Penyusutan 1 bulan berhasil dibukukan ke jurnal beban & akumulasi");
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDispose = async () => {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      const res = await fetch(`/silete/api/assets/${selectedAsset.id}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposal_date: disposeForm.disposal_date,
          proceeds: Number(disposeForm.proceeds) || 0,
          gain_loss_account_code: "7100",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal melepas aset");

      toast("success", "Aset berhasil dilepas/dihapus buku (Disposed)");
      setDisposeDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const totalCost = assets.reduce((s, a) => s + (Number(a.acquisition_cost) || 0), 0);
  const totalAccDep = assets.reduce((s, a) => s + (Number(a.accumulated_depreciation) || 0), 0);
  const totalBookValue = assets.reduce((s, a) => s + (Number(a.book_value) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Aset Tetap & Penyusutan (Fixed Assets)
            </h1>
            <Badge variant="outline" className="text-xs">Aktiva Tetap</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan aktiva, perhitungan amortisasi/penyusutan garis lurus bulanan, dan pelepasan aset.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={assets.map((a) => ({
              kode_aset: a.asset_code,
              nama_aset: a.name,
              kategori: a.category_name ?? "",
              tgl_perolehan: a.acquisition_date,
              nilai_perolehan: a.acquisition_cost,
              akumulasi_depresiasi: a.accumulated_depreciation,
              nilai_buku: a.book_value,
              status: a.status,
            }))}
            columns={[
              { header: "Kode Aset", key: "kode_aset", align: "left" },
              { header: "Nama Aset", key: "nama_aset", align: "left" },
              { header: "Kategori", key: "kategori", align: "left" },
              { header: "Tgl Perolehan", key: "tgl_perolehan", align: "left" },
              { header: "Nilai Perolehan", key: "nilai_perolehan", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Akumulasi Depresiasi", key: "akumulasi_depresiasi", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Nilai Buku (NBV)", key: "nilai_buku", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="daftar_aset_tetap"
            title="Daftar Aktiva Tetap & Penyusutan"
            subtitle="Pencatatan aktiva & nilai buku — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Aset Baru
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Nilai Perolehan (Cost)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(totalCost)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{assets.length} unit aset terdaftar</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Akumulasi Penyusutan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 font-mono">{formatCurrency(totalAccDep)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total depresiasi terbukukan</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Nilai Buku Bersih (NBV)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{formatCurrency(totalBookValue)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Nilai aset di neraca keuangan</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="w-4 h-4 text-blue-600" />
              Daftar Register Aset Tetap
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {assets.length} Aset
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Metode garis lurus (Straight Line): Beban = (Harga Perolehan - Residu) / Masa Manfaat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : assets.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada aset tetap terdaftar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Aset</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Tgl Perolehan</TableHead>
                    <TableHead className="text-right">Harga Perolehan</TableHead>
                    <TableHead className="text-right">Akum. Susut</TableHead>
                    <TableHead className="text-right">Nilai Buku</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi / Depresiasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => (
                    <TableRow key={a.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {a.asset_code}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {a.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {a.category_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(a.acquisition_date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatCurrency(a.acquisition_cost)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-600">
                        {formatCurrency(a.accumulated_depreciation)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-emerald-600">
                        {formatCurrency(a.book_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        {a.status === "active" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            AKTIF
                          </Badge>
                        ) : a.status === "disposed" ? (
                          <Badge variant="outline" className="text-[10px] text-slate-500 bg-slate-50 border-slate-200">
                            DILEPAS
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            HABIS SUSUT
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {a.status === "active" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleDepreciate(a.id)}
                              disabled={actionLoadingId === a.id}
                              title="Penyusutan 1 Bulan"
                            >
                              <Calculator className="w-3 h-3 mr-1" />
                              Susutkan
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setSelectedAsset(a);
                                setDisposeDialogOpen(true);
                              }}
                              title="Pelepasan / Hapus Buku Aset"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Non-Aktif</span>
                        )}
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
          title="Pendaftaran Aset Tetap Baru"
          description="Pencatatan aset beserta jurnal otomatis perolehan"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode Aset" required error={errors.asset_code}>
              <Input
                placeholder="Mis. AST-202608-001"
                value={form.asset_code}
                onChange={(e) => setForm((p) => ({ ...p, asset_code: e.target.value }))}
              />
            </FormField>
            <FormField label="Kategori Aset" required error={errors.category_id}>
              <Select
                value={form.category_id}
                onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
              >
                <option value="">-- Pilih Kategori --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.useful_life_months} bln)</option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Nama / Deskripsi Aset" required error={errors.name}>
            <Input
              placeholder="Mis. Komputer Server Dell PowerEdge"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tanggal Perolehan">
              <Input
                type="date"
                value={form.acquisition_date}
                onChange={(e) => setForm((p) => ({ ...p, acquisition_date: e.target.value }))}
              />
            </FormField>
            <FormField label="Sumber Dana / Pembayaran">
              <Select
                value={form.payment_account_code}
                onChange={(e) => setForm((p) => ({ ...p, payment_account_code: e.target.value as "1100" | "1110" | "2100" }))}
              >
                <option value="1100">Kas (1100)</option>
                <option value="1110">Bank (1110)</option>
                <option value="2100">Hutang Usaha (2100)</option>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Harga Perolehan (Rp)" required error={errors.acquisition_cost}>
              <Input
                type="number"
                min="1"
                placeholder="0"
                value={form.acquisition_cost}
                onChange={(e) => setForm((p) => ({ ...p, acquisition_cost: e.target.value }))}
              />
            </FormField>
            <FormField label="Nilai Residu (Rp)">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.residual_value}
                onChange={(e) => setForm((p) => ({ ...p, residual_value: e.target.value }))}
              />
            </FormField>
          </div>
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Daftarkan Aset"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dispose Dialog */}
      <Dialog open={disposeDialogOpen} onClose={() => setDisposeDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Pelepasan / Hapus Buku Aset (Disposal)"
          description={`Lepaskan aset ${selectedAsset?.name} (${selectedAsset?.asset_code})`}
          onClose={() => setDisposeDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Nilai Buku Saat Ini (NBV):</span>
              <span className="font-mono font-semibold text-slate-900">{formatCurrency(selectedAsset?.book_value)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Akumulasi Penyusutan:</span>
              <span className="font-mono text-amber-600">{formatCurrency(selectedAsset?.accumulated_depreciation)}</span>
            </div>
          </div>

          <FormField label="Tanggal Pelepasan">
            <Input
              type="date"
              value={disposeForm.disposal_date}
              onChange={(e) => setDisposeForm((p) => ({ ...p, disposal_date: e.target.value }))}
            />
          </FormField>

          <FormField label="Hasil Penjualan / Nilai Pelepasan (Rp)">
            <Input
              type="number"
              min="0"
              placeholder="0 (isi 0 jika rusak / write-off)"
              value={disposeForm.proceeds}
              onChange={(e) => setDisposeForm((p) => ({ ...p, proceeds: e.target.value }))}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDisposeDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button
            size="sm"
            onClick={handleDispose}
            disabled={saving}
            variant="destructive"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Memproses...</> : "Konfirmasi Pelepasan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
