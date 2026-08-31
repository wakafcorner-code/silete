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
import { ArrowDownLeft, CheckCircle, Plus, Trash2, Loader2, RefreshCw } from "lucide-react";

interface GoodsReceipt {
  id: number;
  receipt_no: string;
  receipt_date: string;
  warehouse_id: number;
  warehouse_name?: string;
  purchase_order_id?: number | null;
  status: "draft" | "posted" | "cancelled";
  notes?: string | null;
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
  cost_price: string;
}

interface ItemRow {
  product_id: string;
  quantity: string;
  unit_cost: string;
}

export default function GoodsReceiptsPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    receipt_no: `GRN-${Date.now().toString().slice(-6)}`,
    receipt_date: today,
    warehouse_id: "",
    notes: "",
    items: [
      { product_id: "", quantity: "1", unit_cost: "0" },
    ] as ItemRow[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, wRes, pRes] = await Promise.all([
        fetch("/api/inventory/receiving?limit=100"),
        fetch("/api/warehouses"),
        fetch("/api/products?limit=100"),
      ]);

      const rData = await rRes.json();
      const wData = await wRes.json();
      const pData = await pRes.json();

      if (rData.success) setReceipts(rData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
      if (pData.success) setProducts(pData.data || []);
    } catch {
      toast("error", "Gagal memuat data penerimaan barang");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      receipt_no: `GRN-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      receipt_date: today,
      warehouse_id: warehouses[0]?.id.toString() || "",
      notes: "",
      items: [{ product_id: products[0]?.id.toString() || "", quantity: "1", unit_cost: products[0]?.cost_price || "0" }],
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleAddItem = () => {
    setForm((p) => ({
      ...p,
      items: [...p.items, { product_id: products[0]?.id.toString() || "", quantity: "1", unit_cost: products[0]?.cost_price || "0" }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (form.items.length <= 1) {
      toast("warning", "Minimal harus ada 1 item barang");
      return;
    }
    setForm((p) => ({
      ...p,
      items: p.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index: number, field: keyof ItemRow, value: string) => {
    setForm((p) => {
      const newItems = [...p.items];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === "product_id") {
        const prod = products.find((pr) => pr.id === Number(value));
        if (prod) {
          newItems[index].unit_cost = prod.cost_price;
        }
      }
      return { ...p, items: newItems };
    });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.receipt_no.trim()) errs.receipt_no = "Nomor GRN wajib diisi";
    if (!form.receipt_date) errs.receipt_date = "Tanggal wajib diisi";
    if (!form.warehouse_id) errs.warehouse_id = "Gudang penerima wajib dipilih";
    if (form.items.length === 0) errs.items = "Minimal harus ada 1 item";

    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (!it.product_id) errs[`item_${i}`] = "Produk wajib dipilih";
      if (Number(it.quantity) <= 0) errs[`qty_${i}`] = "Qty harus > 0";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        receipt_no: form.receipt_no.trim(),
        receipt_date: form.receipt_date,
        warehouse_id: Number(form.warehouse_id),
        notes: form.notes.trim() || null,
        items: form.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost) || 0,
        })),
      };

      const res = await fetch("/api/inventory/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat penerimaan barang");

      toast("success", "Penerimaan barang berhasil dibuat sebagai DRAFT");
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
      const res = await fetch(`/api/inventory/receiving/${id}/post`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memposting penerimaan barang");

      toast("success", "Penerimaan barang berhasil diposting & stok gudang bertambah");
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
              Penerimaan Barang (Goods Receipt / GRN)
            </h1>
            <Badge variant="outline" className="text-xs">Inventori</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan masuknya barang fisik ke gudang dengan alur draft → posting mutasi stok.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Penerimaan (GRN)
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              Daftar Dokumen Penerimaan Barang
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {receipts.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Penerimaan barang yang diposting akan menambah saldo fisik gudang secara otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada dokumen penerimaan barang.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor GRN</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Gudang Masuk</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((gr) => (
                    <TableRow key={gr.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {gr.receipt_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(gr.receipt_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {gr.warehouse_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-xs truncate">
                        {gr.notes || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={gr.status === "posted" ? "secondary" : "outline"}
                          className={`text-[10px] ${gr.status === "posted" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : ""}`}
                        >
                          {gr.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {gr.status === "draft" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handlePost(gr.id)}
                            disabled={actionLoadingId === gr.id}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Posting Fisik
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Telah Masuk Stok</span>
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-xl">
        <DialogHeader
          title="Penerimaan Barang Fisik (Goods Receipt)"
          description="Pencatatan barang masuk dari vendor pemasok ke gudang"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor GRN" required error={errors.receipt_no}>
              <Input
                placeholder="Mis. GRN-202608-001"
                value={form.receipt_no}
                onChange={(e) => setForm((p) => ({ ...p, receipt_no: e.target.value }))}
              />
            </FormField>
            <FormField label="Gudang Penerima" required error={errors.warehouse_id}>
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
          </div>

          <FormField label="Tanggal Penerimaan" required error={errors.receipt_date}>
            <Input
              type="date"
              value={form.receipt_date}
              onChange={(e) => setForm((p) => ({ ...p, receipt_date: e.target.value }))}
            />
          </FormField>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">Daftar Barang Masuk</label>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddItem}>
                <Plus className="w-3 h-3 mr-1" />
                Tambah Baris
              </Button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-2 text-left">Produk</th>
                    <th className="py-2 px-2 text-right w-24">Jumlah Qty</th>
                    <th className="py-2 px-2 text-right w-32">Harga Pokok (Rp)</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-1.5">
                        <Select
                          value={item.product_id}
                          onChange={(e) => handleItemChange(idx, "product_id", e.target.value)}
                          className="h-8 text-xs"
                        >
                          <option value="">-- Pilih Barang --</option>
                          {products.map((pr) => (
                            <option key={pr.id} value={pr.id}>{pr.name} ({pr.sku})</option>
                          ))}
                        </Select>
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                          className="h-8 text-xs text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          value={item.unit_cost}
                          onChange={(e) => handleItemChange(idx, "unit_cost", e.target.value)}
                          className="h-8 text-xs text-right"
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <FormField label="Catatan Penerimaan">
            <Textarea
              placeholder="No. Surat Jalan Vendor / Keterangan Kondisi Barang..."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Buat Dokumen GRN"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
