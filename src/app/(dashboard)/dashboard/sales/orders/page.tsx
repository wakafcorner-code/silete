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
import { TrendingUp, CheckCircle, Plus, Trash2, Loader2, RefreshCw, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SalesOrder {
  id: number;
  order_no: string;
  order_date: string;
  customer_id: number;
  customer_name?: string;
  branch_name?: string;
  status: "draft" | "confirmed" | "partial" | "delivered" | "invoiced" | "closed" | "cancelled";
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
}

interface Customer {
  id: number;
  name: string;
  code: string;
}

interface Branch {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  selling_price: string;
}

interface ItemRow {
  product_id: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

export default function SalesOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    order_no: `SO-${Date.now().toString().slice(-6)}`,
    order_date: today,
    customer_id: "",
    branch_id: "",
    notes: "",
    items: [
      { product_id: "", quantity: "1", unit_price: "0", tax_rate: "11" },
    ] as ItemRow[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: "100",
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      });

      const [oRes, cRes, bRes, pRes] = await Promise.all([
        fetch(`/api/sales/orders?${queryParams.toString()}`),
        fetch("api/customers?limit=100"),
        fetch("api/branches"),
        fetch("api/products?limit=100"),
      ]);

      const oData = await oRes.json();
      const cData = await cRes.json();
      const bData = await bRes.json();
      const pData = await pRes.json();

      if (oData.success) setOrders(oData.data || []);
      if (cData.success) setCustomers(cData.data || []);
      if (bData.success) setBranches(bData.branches || bData.data || []);
      if (pData.success) setProducts(pData.data || []);
    } catch {
      toast("error", "Gagal memuat data Sales Order");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      order_no: `SO-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      order_date: today,
      customer_id: customers[0]?.id.toString() || "",
      branch_id: "",
      notes: "",
      items: [{ product_id: products[0]?.id.toString() || "", quantity: "1", unit_price: products[0]?.selling_price || "0", tax_rate: "11" }],
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleAddItem = () => {
    setForm((p) => ({
      ...p,
      items: [...p.items, { product_id: products[0]?.id.toString() || "", quantity: "1", unit_price: products[0]?.selling_price || "0", tax_rate: "11" }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (form.items.length <= 1) {
      toast("warning", "Minimal harus ada 1 item pesanan");
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
          newItems[index].unit_price = prod.selling_price;
        }
      }
      return { ...p, items: newItems };
    });
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let tax = 0;
    for (const item of form.items) {
      const q = Number(item.quantity) || 0;
      const p = Number(item.unit_price) || 0;
      const t = Number(item.tax_rate) || 0;
      const lineSubtotal = q * p;
      const lineTax = (lineSubtotal * t) / 100;
      subtotal += lineSubtotal;
      tax += lineTax;
    }
    return { subtotal, tax, total: subtotal + tax };
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.order_no.trim()) errs.order_no = "Nomor SO wajib diisi";
    if (!form.order_date) errs.order_date = "Tanggal SO wajib diisi";
    if (!form.customer_id) errs.customer_id = "Pelanggan wajib dipilih";
    if (form.items.length === 0) errs.items = "Minimal harus ada 1 item pesanan";

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
        order_no: form.order_no.trim(),
        order_date: form.order_date,
        customer_id: Number(form.customer_id),
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        notes: form.notes.trim() || null,
        items: form.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate) || 0,
        })),
      };

      const res = await fetch("api/sales/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat Sales Order");

      toast("success", "Sales Order berhasil diterbitkan");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal membuat SO", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/sales/orders/${id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengonfirmasi Sales Order");

      toast("success", "Sales Order berhasil dikonfirmasi (CONFIRMED)");
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setActionLoadingId(null);
    }
  };

  const { subtotal, tax, total } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Penjualan (Sales Order)
            </h1>
            <Badge variant="outline" className="text-xs">Sales</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan pesanan dari pelanggan dengan kalkulasi nilai penjualan, PPN, dan penerbitan pengiriman.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Sales Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari nomor SO / pelanggan..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 text-xs"
          >
            <option value="all">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Dikonfirmasi (Confirmed)</option>
            <option value="delivered">Terkirim (Delivered)</option>
            <option value="invoiced">Ditagih (Invoiced)</option>
            <option value="closed">Selesai (Closed)</option>
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Daftar Dokumen Sales Order
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {orders.length} Pesanan
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Status: Draft → Confirmed (Dikonfirmasi) → Delivered (Terkirim) → Invoiced (Ditagih).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada SO dengan kata kunci "${search}"` : "Belum ada pesanan penjualan."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor SO</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Total Nilai</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((so) => (
                    <TableRow key={so.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {so.order_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(so.order_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {so.customer_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {so.branch_name || "Pusat"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {formatCurrency(so.subtotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(so.total_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {so.status === "confirmed" || so.status === "delivered" || so.status === "invoiced" || so.status === "closed" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            {so.status.toUpperCase()}
                          </Badge>
                        ) : so.status === "draft" ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            DRAFT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {so.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {so.status === "draft" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleConfirm(so.id)}
                            disabled={actionLoadingId === so.id}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Konfirmasi
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Telah Dikonfirmasi</span>
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader
          title="Penerbitan Sales Order (SO)"
          description="Isi pesanan penjualan barang dari pelanggan"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor SO" required error={errors.order_no}>
              <Input
                placeholder="Mis. SO-202608-001"
                value={form.order_no}
                onChange={(e) => setForm((p) => ({ ...p, order_no: e.target.value }))}
              />
            </FormField>
            <FormField label="Pelanggan / Customer" required error={errors.customer_id}>
              <Select
                value={form.customer_id}
                onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
              >
                <option value="">-- Pilih Pelanggan --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tanggal Pesanan" required error={errors.order_date}>
              <Input
                type="date"
                value={form.order_date}
                onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))}
              />
            </FormField>
            <FormField label="Cabang Penjualan">
              <Select
                value={form.branch_id}
                onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value }))}
              >
                <option value="">-- Kantor Pusat --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">Daftar Barang Penjualan</label>
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
                    <th className="py-2 px-2 text-right w-20">Qty</th>
                    <th className="py-2 px-2 text-right w-28">Harga Jual (Rp)</th>
                    <th className="py-2 px-2 text-right w-20">PPN (%)</th>
                    <th className="py-2 px-2 text-right w-28">Subtotal</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.items.map((item, idx) => {
                    const lineSub = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                    return (
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
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(idx, "unit_price", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.tax_rate}
                            onChange={(e) => handleItemChange(idx, "tax_rate", e.target.value)}
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="p-1.5 text-right font-mono font-medium">
                          {formatCurrency(lineSub)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Calculations Summary */}
            <div className="bg-slate-50 p-3 rounded-lg flex justify-end">
              <div className="w-64 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>PPN / Pajak:</span>
                  <span className="font-mono">{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                  <span>Total Tagihan:</span>
                  <span className="font-mono text-blue-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>

          <FormField label="Catatan Tambahan">
            <Textarea
              placeholder="Instruksi pengiriman pelanggan..."
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Terbitkan SO"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
