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
import { ShoppingCart, CheckCircle, Plus, Trash2, Loader2, RefreshCw, Search, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ExportButtons } from "@/components/ui/export-buttons";
import { PrintInvoiceButton } from "@/components/ui/print-invoice-button";
import Link from "next/link";

interface PurchaseOrder {
  id: number;
  po_no: string;
  order_date: string;
  expected_date?: string | null;
  supplier_id: number;
  supplier_name?: string;
  branch_name?: string;
  status: "draft" | "submitted" | "approved" | "partial" | "received" | "closed" | "cancelled";
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
}

interface Supplier {
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
  cost_price: string;
}

interface ItemRow {
  product_id: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [loadingPr, setLoadingPr] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    po_no: `PO-${Date.now().toString().slice(-6)}`,
    order_date: today,
    expected_date: "",
    supplier_id: "",
    purchase_request_id: "",
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

      const [oRes, sRes, bRes, pRes, prRes] = await Promise.all([
        fetch(`/silete/api/purchasing/orders?${queryParams.toString()}`),
        fetch("/silete/api/suppliers?limit=100"),
        fetch("/silete/api/branches"),
        fetch("/silete/api/products?limit=100"),
        fetch("/silete/api/purchasing/requests?status=approved&limit=50"),
      ]);

      const oData = await oRes.json();
      const sData = await sRes.json();
      const bData = await bRes.json();
      const pData = await pRes.json();
      const prData = await prRes.json();

      if (oData.success) setOrders(oData.data || []);
      if (sData.success) setSuppliers(sData.data || []);
      if (bData.success) setBranches(bData.branches || bData.data || []);
      if (pData.success) setProducts(pData.data || []);
      if (prData.success) setPurchaseRequests(prData.data || []);
    } catch {
      toast("error", "Gagal memuat data Purchase Order");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      po_no: `PO-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      order_date: today,
      expected_date: "",
      supplier_id: suppliers[0]?.id.toString() || "",
      purchase_request_id: "",
      branch_id: "",
      notes: "",
      items: [{ product_id: products[0]?.id.toString() || "", quantity: "1", unit_price: products[0]?.cost_price || "0", tax_rate: "11" }],
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleAddItem = () => {
    setForm((p) => ({
      ...p,
      items: [...p.items, { product_id: products[0]?.id.toString() || "", quantity: "1", unit_price: products[0]?.cost_price || "0", tax_rate: "11" }],
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
          newItems[index].unit_price = prod.cost_price;
        }
      }
      return { ...p, items: newItems };
    });
  };

  const handlePullPR = async () => {
    if (!form.purchase_request_id) return;
    setLoadingPr(true);
    try {
      const res = await fetch(`/silete/api/purchasing/requests/${form.purchase_request_id}`);
      const data = await res.json();
      if (data.success && data.data) {
        const pr = data.data;
        const prItems = pr.items || [];
        setForm((prev) => ({
          ...prev,
          branch_id: String(pr.branch_id || ""),
          notes: `Ditarik dari PR #${pr.request_no}. ${pr.notes || ""}`,
          items: prItems.map((it: any) => ({
            product_id: String(it.product_id),
            quantity: String(it.quantity),
            unit_price: String(it.cost_price || 0),
            tax_rate: "11",
          })),
        }));
        toast("success", `Data ditarik dari PR #${pr.request_no}`);
      }
    } catch (err) {
      toast("error", "Gagal menarik data PR");
    } finally {
      setLoadingPr(false);
    }
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
    if (!form.po_no.trim()) errs.po_no = "Nomor PO wajib diisi";
    if (!form.order_date) errs.order_date = "Tanggal PO wajib diisi";
    if (!form.supplier_id) errs.supplier_id = "Supplier wajib dipilih";
    if (form.items.length === 0) errs.items = "Minimal harus ada 1 item barang";

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
        po_no: form.po_no.trim(),
        order_date: form.order_date,
        expected_date: form.expected_date || null,
        supplier_id: Number(form.supplier_id),
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        notes: form.notes.trim() || null,
        items: form.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate) || 0,
        })),
      };

      const res = await fetch("/silete/api/purchasing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat Purchase Order");

      toast("success", "Purchase Order berhasil diterbitkan");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal membuat PO", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/silete/api/purchasing/orders/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyetujui Purchase Order");

      toast("success", "Purchase Order berhasil disetujui (APPROVED)");
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
              Pesanan Pembelian (Purchase Order)
            </h1>
            <Badge variant="outline" className="text-xs">Purchasing</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Penerbitan pesanan resmi kepada supplier dengan perhitungan nilai subtotal, PPN, dan total otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={orders.map((po) => ({
              nomor_po: po.po_no,
              tanggal: new Date(po.order_date).toLocaleDateString("id-ID"),
              supplier: po.supplier_name || "-",
              cabang: po.branch_name || "Pusat",
              subtotal: formatCurrency(po.subtotal),
              total: formatCurrency(po.total_amount),
              status: po.status.toUpperCase(),
            }))}
            columns={[
              { header: "Nomor PO", key: "nomor_po" },
              { header: "Tanggal", key: "tanggal" },
              { header: "Supplier", key: "supplier" },
              { header: "Cabang", key: "cabang" },
              { header: "Subtotal", key: "subtotal", align: "right" },
              { header: "Total Nilai", key: "total", align: "right" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="pesanan_pembelian"
            title="Purchase Orders"
            subtitle="Daftar pesanan pembelian ke mitra supplier — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Purchase Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari nomor PO / supplier..."
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
            <option value="submitted">Diajukan (Submitted)</option>
            <option value="approved">Disetujui (Approved)</option>
            <option value="received">Diterima (Received)</option>
            <option value="closed">Selesai (Closed)</option>
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              Daftar Dokumen Purchase Order
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {orders.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            PO yang telah disetujui dapat diproses untuk penerimaan fisik gudang (Goods Receipt).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada PO dengan kata kunci "${search}"` : "Belum ada pesanan pembelian."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor PO</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pemasok</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Total Nilai</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((po) => (
                    <TableRow key={po.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {po.po_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(po.order_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {po.supplier_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {po.branch_name || "Pusat"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">
                        {formatCurrency(po.subtotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(po.total_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {po.status === "approved" || po.status === "received" || po.status === "closed" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            {po.status.toUpperCase()}
                          </Badge>
                        ) : po.status === "submitted" ? (
                          <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            SUBMITTED
                          </Badge>
                        ) : po.status === "draft" ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            DRAFT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {po.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <PrintInvoiceButton invoice={{
                            ...po,
                            invoice_no: po.po_no,
                            invoice_date: po.order_date,
                            items: [] // PO items not fetched in list, but we can print basic info
                          }} />
                          {po.status === "approved" || po.status === "received" || po.status === "closed" ? (
                            <Link href={`/dashboard/purchasing/invoices?poId=${po.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] border-blue-200 text-blue-700 hover:bg-blue-50 gap-1 font-bold px-2"
                              >
                                <FileText className="w-3 h-3" />
                                Tagih
                              </Button>
                            </Link>
                          ) : po.status === "draft" || po.status === "submitted" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => handleApprove(po.id)}
                              disabled={actionLoadingId === po.id}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Setujui
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-bold uppercase px-2">Final</span>
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
          title="Penerbitan Purchase Order (PO)"
          description="Isi rincian pesanan barang kepada vendor supplier"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor PO" required error={errors.po_no}>
              <Input
                placeholder="Mis. PO-202608-001"
                value={form.po_no}
                onChange={(e) => setForm((p) => ({ ...p, po_no: e.target.value }))}
              />
            </FormField>
            <FormField label="Tarik dari Permintaan (PR)">
              <div className="flex gap-2">
                <Select
                  value={form.purchase_request_id}
                  onChange={(e) => setForm({ ...form, purchase_request_id: e.target.value })}
                  className="flex-1"
                >
                  <option value="">— Buat Manual (Tanpa PR) —</option>
                  {purchaseRequests.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.request_no} ({pr.requested_by_name})
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePullPR}
                  disabled={!form.purchase_request_id || loadingPr}
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 shrink-0 h-9 px-3"
                  title="Tarik item dari PR"
                >
                  {loadingPr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span className="ml-1.5 text-[10px]">Tarik PR</span>
                </Button>
              </div>
            </FormField>
          </div>

          <FormField label="Pemasok / Supplier" required error={errors.supplier_id}>
            <Select
              value={form.supplier_id}
              onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value }))}
            >
              <option value="">-- Pilih Supplier --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Tanggal Pesanan" required error={errors.order_date}>
              <Input
                type="date"
                value={form.order_date}
                onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))}
              />
            </FormField>
            <FormField label="Target Kedatangan">
              <Input
                type="date"
                value={form.expected_date}
                onChange={(e) => setForm((p) => ({ ...p, expected_date: e.target.value }))}
              />
            </FormField>
            <FormField label="Cabang Penerima">
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
              <label className="text-xs font-semibold text-slate-800">Daftar Barang Dipesan</label>
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
                    <th className="py-2 px-2 text-right w-28">Harga (Rp)</th>
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
              placeholder="Instruksi pengiriman atau syarat pembelian..."
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Terbitkan PO"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
