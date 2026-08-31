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
import { ArrowLeftRight, Plus, Loader2, RefreshCw } from "lucide-react";

interface TransferItem {
  id: number;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  warehouse_id: number;
  warehouse_name?: string;
  transaction_type: "TRANSFER_OUT" | "TRANSFER_IN";
  quantity: string;
  reference_type?: string;
  notes?: string | null;
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
}

export default function TransfersPage() {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    source_warehouse_id: "",
    destination_warehouse_id: "",
    product_id: "",
    quantity: "1",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, wRes, pRes] = await Promise.all([
        fetch("/api/inventory/transfers?limit=50"),
        fetch("/api/warehouses"),
        fetch("/api/products?limit=100"),
      ]);

      const tData = await tRes.json();
      const wData = await wRes.json();
      const pData = await pRes.json();

      if (tData.success) setTransfers(tData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
      if (pData.success) setProducts(pData.data || []);
    } catch {
      toast("error", "Gagal memuat data transfer gudang");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      source_warehouse_id: warehouses[0]?.id.toString() || "",
      destination_warehouse_id: warehouses[1]?.id.toString() || "",
      product_id: products[0]?.id.toString() || "",
      quantity: "1",
      notes: "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.source_warehouse_id) errs.source_warehouse_id = "Gudang asal wajib dipilih";
    if (!form.destination_warehouse_id) errs.destination_warehouse_id = "Gudang tujuan wajib dipilih";
    if (form.source_warehouse_id === form.destination_warehouse_id) {
      errs.destination_warehouse_id = "Gudang asal dan tujuan tidak boleh sama";
    }
    if (!form.product_id) errs.product_id = "Produk wajib dipilih";
    if (isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = "Qty harus > 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        source_warehouse_id: Number(form.source_warehouse_id),
        destination_warehouse_id: Number(form.destination_warehouse_id),
        product_id: Number(form.product_id),
        quantity: Number(form.quantity),
        notes: form.notes.trim() || null,
      };

      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal melakukan transfer stok");

      toast("success", "Transfer antar gudang berhasil dieksekusi secara atomik");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal transfer", err instanceof Error ? err.message : undefined);
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
              Transfer Stok Antar Gudang
            </h1>
            <Badge variant="outline" className="text-xs">Inventori</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pemindahan stok barang fisik antar lokasi gudang dalam satu perusahaan secara atomik.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Transfer Stok Baru
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-purple-600" />
              Riwayat Mutasi Transfer Stok
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {transfers.length} Transaksi
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Setiap transfer langsung mendebit gudang tujuan dan mengkredit gudang asal secara bersamaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada riwayat transfer antar gudang.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Waktu</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Lokasi Gudang</TableHead>
                    <TableHead className="text-center">Arah Mutasi</TableHead>
                    <TableHead className="text-right">Kuantitas</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((tx) => (
                    <TableRow key={tx.id} className="text-xs">
                      <TableCell className="text-slate-600 font-mono">
                        {new Date(tx.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{tx.product_name || "-"}</p>
                        <p className="text-[10px] font-mono text-slate-500">{tx.product_sku}</p>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {tx.warehouse_name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {tx.transaction_type === "TRANSFER_IN" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            TRANSFER IN (MASUK)
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            TRANSFER OUT (KELUAR)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {tx.quantity}
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-xs truncate">
                        {tx.notes || "-"}
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
          title="Transfer Stok Antar Gudang"
          description="Pindahkan saldo fisik stok dari satu gudang ke gudang lainnya"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <FormField label="Gudang Asal (Pengirim)" required error={errors.source_warehouse_id}>
            <Select
              value={form.source_warehouse_id}
              onChange={(e) => setForm((p) => ({ ...p, source_warehouse_id: e.target.value }))}
            >
              <option value="">-- Pilih Gudang Asal --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Gudang Tujuan (Penerima)" required error={errors.destination_warehouse_id}>
            <Select
              value={form.destination_warehouse_id}
              onChange={(e) => setForm((p) => ({ ...p, destination_warehouse_id: e.target.value }))}
            >
              <option value="">-- Pilih Gudang Tujuan --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FormField label="Produk / Barang" required error={errors.product_id}>
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
            </div>
            <FormField label="Jumlah Qty" required error={errors.quantity}>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Catatan / Nomor Referensi Transfer">
            <Textarea
              placeholder="Instruksi pengiriman internal atau alasan mutasi..."
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Memproses...</> : "Eksekusi Transfer"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
