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
import { ExportButtons } from "@/components/ui/export-buttons";
import { ArrowDownLeft, CheckCircle, Plus, Trash2, Loader2, RefreshCw, Search, Eye, FileIcon, ImageIcon, FileText } from "lucide-react";
import { formatCurrency, getPublicPath } from "@/lib/utils";
import Link from "next/link";

interface GoodsReceipt {
  id: number;
  receipt_no: string;
  receipt_date: string;
  warehouse_id: number;
  warehouse_name?: string;
  purchase_order_id?: number | null;
  po_no?: string;
  supplier_name?: string;
  status: "draft" | "posted" | "cancelled";
  notes?: string | null;
  total_items?: string | number;
  attachment_count?: number;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface PurchaseOrder {
  id: number;
  po_no: string;
  supplier_name?: string;
  status: string;
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

export default function PurchasingReceiptsPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<{receipt: GoodsReceipt, items: any[], attachments: any[]} | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    receipt_no: "",
    receipt_date: today,
    warehouse_id: "",
    supplier_id: "",
    purchase_order_id: "",
    notes: "",
    items: [
      { product_id: "", quantity: "1", unit_cost: "0" },
    ] as ItemRow[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, wRes, sRes, poRes, pRes] = await Promise.all([
        fetch("/api/inventory/receiving?limit=100"),
        fetch("/api/warehouses"),
        fetch("/api/suppliers?limit=100"),
        fetch("/api/purchasing/orders?limit=100"),
        fetch("/api/products?limit=100"),
      ]);

      const rData = await rRes.json();
      const wData = await wRes.json();
      const sData = await sRes.json();
      const poData = await poRes.json();
      const pData = await pRes.json();

      if (rData.success) setReceipts(rData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
      if (sData.success) setSuppliers(sData.data || []);
      if (poData.success) setPurchaseOrders(poData.data || []);
      if (pData.success) setProducts(pData.data || []);
    } catch {
      toast("error", "Gagal memuat data penerimaan barang pembelian");
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
      supplier_id: "",
      purchase_order_id: "",
      notes: "",
      items: [{ product_id: products[0]?.id.toString() || "", quantity: "1", unit_cost: products[0]?.cost_price || "0" }],
    });
    setErrors({});
    setDialogOpen(true);
  };

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: products[0]?.id.toString() || "", quantity: "1", unit_cost: products[0]?.cost_price || "0" }],
    }));
  };

  const removeItemRow = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const updateItemRow = (idx: number, field: keyof ItemRow, val: string) => {
    setForm((prev) => {
      const copy = [...prev.items];
      copy[idx] = { ...copy[idx], [field]: val };
      if (field === "product_id") {
        const p = products.find((x) => x.id.toString() === val);
        if (p) copy[idx].unit_cost = p.cost_price;
      }
      return { ...prev, items: copy };
    });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.receipt_no.trim()) errs.receipt_no = "Nomor penerimaan (GRN) wajib diisi";
    if (!form.warehouse_id) errs.warehouse_id = "Pilih gudang tujuan";
    if (form.items.length === 0) errs.items = "Minimal 1 barang harus dimasukkan";
    for (let i = 0; i < form.items.length; i++) {
      const itm = form.items[i];
      if (!itm.product_id) errs[`item_${i}`] = `Pilih produk pada baris #${i + 1}`;
      if (Number(itm.quantity) <= 0) errs[`item_${i}`] = `Kuantitas baris #${i + 1} harus > 0`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        receipt_no: form.receipt_no.trim(),
        receipt_date: form.receipt_date,
        warehouse_id: Number(form.warehouse_id),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        purchase_order_id: form.purchase_order_id ? Number(form.purchase_order_id) : null,
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

      toast("success", "Penerimaan barang (GRN) berhasil dibuat");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : undefined);
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

  const handleViewDetail = async (id: number) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    try {
      const [res, attRes] = await Promise.all([
        fetch(`/api/inventory/receiving/${id}`),
        fetch(`/api/attachments?reference_type=goods_receipt&reference_id=${id}`)
      ]);
      const data = await res.json();
      const attData = await attRes.json();
      if (data.success) {
        setSelectedReceipt({
          receipt: data.receipt,
          items: data.items || [],
          attachments: attData.success ? attData.data : []
        });
      }
    } catch (err) {
      toast("error", "Gagal memuat detail");
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredReceipts = receipts.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.receipt_no.toLowerCase().includes(q) ||
      (r.warehouse_name && r.warehouse_name.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Penerimaan Barang Pembelian (Goods Receipt)
            </h1>
            <Badge variant="outline" className="text-xs">Pembelian & Gudang</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan penerimaan fisik barang dagang dari Pesanan Beli (PO) atau pemasok langsung ke gudang tujuan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={filteredReceipts.map((r) => ({
              no_grn: r.receipt_no,
              tanggal: r.receipt_date,
              gudang: r.warehouse_name ?? "-",
              no_po: r.po_no ?? "-",
              status: r.status,
              catatan: r.notes ?? "-",
            }))}
            columns={[
              { header: "No. GRN", key: "no_grn", align: "left" },
              { header: "Tanggal", key: "tanggal", align: "left" },
              { header: "Gudang Tujuan", key: "gudang", align: "left" },
              { header: "Referensi PO", key: "no_po", align: "left" },
              { header: "Status", key: "status", align: "center" },
              { header: "Catatan", key: "catatan", align: "left" },
            ]}
            filename="penerimaan_barang_pembelian"
            title="Daftar Penerimaan Barang (Goods Receipt)"
            subtitle="Penerimaan barang dari pesanan pembelian — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Terima Barang Baru
          </Button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Cari nomor GRN, gudang..."
          className="pl-8 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              Daftar Bukti Penerimaan Barang (GRN)
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {filteredReceipts.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Memuat dokumen tanda terima barang, status posting ke kartu stok fisik, dan tautan ke Pesanan Beli (PO).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada data dengan kata kunci "${search}"` : "Belum ada dokumen penerimaan barang."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor GRN</TableHead>
                    <TableHead>Tanggal Terima</TableHead>
                    <TableHead>Gudang Tujuan</TableHead>
                    <TableHead>Pesanan Beli (PO)</TableHead>
                    <TableHead className="text-right">Total Qty</TableHead>
                    <TableHead className="text-center">Dokumen</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        {r.receipt_no}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(r.receipt_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-800">
                        {r.warehouse_name || `Gudang #${r.warehouse_id}`}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">
                        {r.po_no ? r.po_no : "Tanpa PO (Langsung)"}
                        {r.supplier_name && <p className="text-[10px] text-slate-400">{r.supplier_name}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-indigo-600">
                        {Number(r.total_items || 0).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.attachment_count ? (
                          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">
                            {r.attachment_count} File
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-slate-300">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[150px] truncate">
                        {r.notes || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.status === "posted" ? "success" : r.status === "cancelled" ? "destructive" : "secondary"}>
                          {r.status === "posted" ? "Posted (Masuk Stok)" : r.status === "draft" ? "Draft" : "Dibatalkan"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                            onClick={() => handleViewDetail(r.id)}
                            title="Lihat Detail & Item"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {r.status === "draft" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1 px-2"
                              onClick={() => handlePost(r.id)}
                              disabled={actionLoadingId === r.id}
                            >
                              {actionLoadingId === r.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              Posting
                            </Button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase px-2">Final</span>
                              <Link href={`/dashboard/purchasing/invoices?grnId=${r.id}`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] border-blue-200 text-blue-700 hover:bg-blue-50 gap-1 font-bold px-2"
                                >
                                  <FileText className="w-3 h-3" />
                                  Tagih
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader
          title="Terima Barang Pembelian (GRN)"
          description="Catat penerimaan fisik barang ke dalam gudang dan mutasi stok secara otomatis."
          onClose={() => setDialogOpen(false)}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor Dokumen (GRN)" required error={errors.receipt_no}>
              <Input
                placeholder="GRN-2026..."
                value={form.receipt_no}
                onChange={(e) => setForm({ ...form, receipt_no: e.target.value })}
              />
            </FormField>
            <FormField label="Tanggal Penerimaan" required>
              <Input
                type="date"
                value={form.receipt_date}
                onChange={(e) => setForm({ ...form, receipt_date: e.target.value })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Gudang Tujuan" required error={errors.warehouse_id}>
              <Select
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              >
                <option value="">Pilih Gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Pemasok / Supplier">
              <Select
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">-- Pilih Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <FormField label="Tautan Pesanan Beli (PO Opsional)">
              <Select
                value={form.purchase_order_id}
                onChange={(e) => setForm({ ...form, purchase_order_id: e.target.value })}
              >
                <option value="">— Penerimaan Langsung (Tanpa PO) —</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_no} {po.supplier_name ? `(${po.supplier_name})` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* Line Items */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">Daftar Barang Diterima</label>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Tambah Baris
              </Button>
            </div>

            {errors.items && <p className="text-[11px] text-red-500">{errors.items}</p>}

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="flex-1">
                    <Select
                      value={item.product_id}
                      onChange={(e) => updateItemRow(idx, "product_id", e.target.value)}
                    >
                      <option value="">Pilih Produk...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItemRow(idx, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min="0"
                      placeholder="HPP"
                      value={item.unit_cost}
                      onChange={(e) => updateItemRow(idx, "unit_cost", e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-slate-400 hover:text-rose-600"
                    onClick={() => removeItemRow(idx)}
                    disabled={form.items.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <FormField label="Catatan Penerimaan">
            <Textarea
              placeholder="Catatan kondisi barang atau nomor surat jalan supplier..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Simpan Dokumen GRN"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} className="max-w-3xl">
        <DialogHeader
          title={`Detail Penerimaan Barang — ${selectedReceipt?.receipt.receipt_no || "..."}`}
          description="Rincian item barang yang diterima dan dokumentasi terlampir."
          onClose={() => setDetailOpen(false)}
        />

        {loadingDetail ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
        ) : selectedReceipt ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Tanggal Terima</p>
                <p className="text-sm font-semibold text-slate-900">{new Date(selectedReceipt.receipt.receipt_date).toLocaleDateString("id-ID", { dateStyle: 'long' })}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Gudang Tujuan</p>
                <p className="text-sm font-semibold text-slate-900">{selectedReceipt.receipt.warehouse_name}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Referensi PO</p>
                <p className="text-sm font-semibold text-slate-900">{selectedReceipt.receipt.po_no || "-"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Status</p>
                <Badge variant={selectedReceipt.receipt.status === "posted" ? "success" : "secondary"}>{selectedReceipt.receipt.status.toUpperCase()}</Badge>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Daftar Barang</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="h-8">Barang</TableHead>
                      <TableHead className="h-8 text-right">Kuantitas</TableHead>
                      <TableHead className="h-8 text-right">Harga Satuan</TableHead>
                      <TableHead className="h-8 text-right">Total Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReceipt.items.map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-2">
                          <p className="font-bold text-slate-900">{it.product_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{it.product_sku}</p>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono font-bold text-indigo-600">{Number(it.quantity).toLocaleString("id-ID")} {it.product_unit}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{formatCurrency(it.unit_cost)}</TableCell>
                        <TableCell className="py-2 text-right font-mono font-bold">{formatCurrency(Number(it.quantity) * Number(it.unit_cost))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Dokumentasi & Lampiran</h4>
              {selectedReceipt.attachments.length === 0 ? (
                <div className="p-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <p className="text-xs text-slate-400 italic">Belum ada foto atau dokumen diunggah untuk GRN ini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedReceipt.attachments.map((att) => {
                    const isImage = att.mime_type?.startsWith("image/");
                    return (
                      <a
                        key={att.id}
                        href={att.file_path}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 transition-all shadow-sm"
                      >
                        {isImage ? (
                          <img src={getPublicPath(att.file_path)} alt={att.file_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                            <FileIcon className="w-6 h-6 text-slate-400 mb-1" />
                            <span className="text-[8px] font-bold text-slate-500 truncate w-full px-1">{att.file_name}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-indigo-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[9px] text-white font-bold uppercase tracking-widest">Buka File</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedReceipt.receipt.notes && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-[10px] text-amber-700 uppercase font-black mb-1">Catatan Internal</p>
                <p className="text-xs text-slate-700 leading-relaxed">{selectedReceipt.receipt.notes}</p>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>Tutup</Button>
          {selectedReceipt?.receipt.status === 'posted' && (
            <Button size="sm" className="bg-indigo-600">Export PDF Dokumen</Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}
