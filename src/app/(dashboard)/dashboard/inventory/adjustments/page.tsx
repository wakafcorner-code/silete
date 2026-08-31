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
import { SlidersHorizontal, CheckCircle, Plus, Loader2, RefreshCw, ArrowUpRight, ArrowDownLeft, FileText } from "lucide-react";
import { ExportButtons } from "@/components/ui/export-buttons";

interface StockAdjustment {
  id: number;
  warehouse_id: number;
  warehouse_name?: string;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  quantity_delta: string;
  reason: string;
  adjustment_date: string;
  status: "draft" | "posted" | "cancelled";
  created_at: string;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  unit: string;
}

export default function StockAdjustmentsPage() {
  const { toast } = useToast();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    warehouse_id: "",
    product_id: "",
    adjustment_type: "surplus" as "surplus" | "loss",
    quantity: "1",
    reason: "",
    adjustment_date: today,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, wRes, pRes] = await Promise.all([
        fetch("api/inventory/adjustments?limit=100"),
        fetch("api/warehouses"),
        fetch("api/products?limit=100"),
      ]);

      const aData = await aRes.json();
      const wData = await wRes.json();
      const pData = await pRes.json();

      if (aData.success) setAdjustments(aData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
      if (pData.success) setProducts(pData.data || []);
    } catch {
      toast("error", "Gagal memuat data penyesuaian stok");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      warehouse_id: warehouses[0]?.id.toString() || "",
      product_id: products[0]?.id.toString() || "",
      adjustment_type: "surplus",
      quantity: "1",
      reason: "",
      adjustment_date: today,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.warehouse_id) errs.warehouse_id = "Gudang wajib dipilih";
    if (!form.product_id) errs.product_id = "Produk wajib dipilih";
    if (isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = "Qty harus > 0";
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      errs.reason = "Alasan penyesuaian wajib diisi minimal 5 karakter";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const delta = form.adjustment_type === "surplus" ? Number(form.quantity) : -Number(form.quantity);
      const body = {
        warehouse_id: Number(form.warehouse_id),
        product_id: Number(form.product_id),
        quantity_delta: delta,
        reason: form.reason.trim(),
        adjustment_date: form.adjustment_date,
      };

      const res = await fetch("api/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat penyesuaian stok");

      toast("success", "Penyesuaian stok berhasil dibuat sebagai DRAFT");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/inventory/adjustments/${id}/post`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memposting penyesuaian stok");

      toast("success", "Penyesuaian stok berhasil dibukukan & fisik stok diperbarui");
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
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
              Penyesuaian Stok (Stock Adjustment)
            </h1>
            <Badge variant="outline" className="text-xs">Inventori</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Koreksi stok fisik gudang akibat selisih opname (kelebihan / kerusakan / kehilangan barang).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={adjustments.map((a) => ({
              tanggal: new Date(a.adjustment_date).toLocaleDateString("id-ID"),
              gudang: a.warehouse_name || "-",
              sku: a.product_sku || "-",
              produk: a.product_name || "-",
              delta: a.quantity_delta,
              alasan: a.reason,
              status: a.status.toUpperCase(),
            }))}
            columns={[
              { header: "Tanggal", key: "tanggal" },
              { header: "Gudang", key: "gudang" },
              { header: "SKU", key: "sku" },
              { header: "Produk", key: "produk" },
              { header: "Delta Qty", key: "delta", align: "right" },
              { header: "Alasan", key: "alasan" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="penyesuaian_stok"
            title="Laporan Penyesuaian Stok"
            subtitle="Daftar koreksi dan selisih stok fisik — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Penyesuaian Stok
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-purple-600" />
              Daftar Penyesuaian Stok
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {adjustments.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Posting mutasi akan secara otomatis memperbarui kartu stok fisik gudang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada riwayat penyesuaian stok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-center">Tipe / Delta</TableHead>
                    <TableHead>Alasan / Keterangan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((adj) => {
                    const deltaNum = Number(adj.quantity_delta);
                    const isPositive = deltaNum > 0;
                    return (
                      <TableRow key={adj.id} className="text-xs">
                        <TableCell className="text-slate-600 font-mono">
                          {new Date(adj.adjustment_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{adj.warehouse_name || "-"}</TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900">{adj.product_name || "-"}</p>
                          <p className="text-[10px] font-mono text-slate-500">{adj.product_sku}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          {isPositive ? (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              <ArrowDownLeft className="w-3 h-3 mr-1" /> +{deltaNum}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-red-700 bg-red-50 border-red-200">
                              <ArrowUpRight className="w-3 h-3 mr-1" /> {deltaNum}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate">{adj.reason}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={adj.status === "posted" ? "secondary" : "outline"} className="text-[10px]">
                            {adj.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {adj.status === "draft" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => handlePost(adj.id)}
                              disabled={actionLoadingId === adj.id}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Posting Fisik
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Selesai Diposting</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Koreksi / Penyesuaian Stok Fisik"
          description="Pencatatan selisih stok fisik terhadap pembukuan sistem"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <FormField label="Lokasi Gudang" required error={errors.warehouse_id}>
            <Select
              value={form.warehouse_id}
              onChange={(e) => setForm((p) => ({ ...p, warehouse_id: e.target.value }))}
            >
              <option value="">-- Pilih Gudang --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Barang / Produk" required error={errors.product_id}>
            <Select
              value={form.product_id}
              onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))}
            >
              <option value="">-- Pilih Produk --</option>
              {products.map((pr) => (
                <option key={pr.id} value={pr.id}>{pr.name} ({pr.sku})</option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Jenis Koreksi">
              <Select
                value={form.adjustment_type}
                onChange={(e) => setForm((p) => ({ ...p, adjustment_type: e.target.value as "surplus" | "loss" }))}
              >
                <option value="surplus">+ Tambah (Kelebihan Fisik)</option>
                <option value="loss">- Kurang (Rusak / Hilang)</option>
              </Select>
            </FormField>
            <FormField label="Jumlah Kuantitas" required error={errors.quantity}>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Tanggal Penyesuaian">
            <Input
              type="date"
              value={form.adjustment_date}
              onChange={(e) => setForm((p) => ({ ...p, adjustment_date: e.target.value }))}
            />
          </FormField>

          <FormField label="Alasan / Justifikasi Koreksi (Min. 5 karakter)" required error={errors.reason}>
            <Textarea
              placeholder="Jelaskan penyebab selisih fisik (mis. hasil stok opname bulanan)..."
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Buat Penyesuaian"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
