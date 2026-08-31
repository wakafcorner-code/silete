"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogFooter, FormField } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, Trash2, Search, FileDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface GRNItem {
  id: number;
  receipt_no: string;
  receipt_date: string;
  supplier_name?: string;
  supplier_id?: number;
  total_items?: number;
}

interface POItem {
  id: number;
  po_no: string;
  order_date: string;
  supplier_name?: string;
  supplier_id?: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  cost_price: string;
}

interface ItemRow {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_amount: string;
}

export function SupplierInvoiceDialog({
  open,
  onClose,
  onSuccess,
  initialGrnId = null,
  initialPoId = null
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialGrnId?: string | null;
  initialPoId?: string | null;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadingGrn, setLoadingGrn] = useState(false);
  const [loadingPo, setLoadingPo] = useState(false);
  const [grns, setGrns] = useState<GRNItem[]>([]);
  const [pos, setPos] = useState<POItem[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [form, setForm] = useState({
    invoice_no: `INV-SUP-${Date.now().toString().slice(-6)}`,
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    supplier_id: "",
    purchase_order_id: "",
    notes: "",
    items: [{ product_id: "", description: "", quantity: "1", unit_price: "0", tax_amount: "0" }] as ItemRow[],
  });

  const [selectedGrnId, setSelectedGrnId] = useState("");
  const [selectedPoId, setSelectedPoId] = useState("");

  useEffect(() => {
    if (open) {
      fetchGrns();
      fetchPos();
      fetchSuppliers();
      fetchProducts();

      if (initialGrnId) {
        setSelectedGrnId(initialGrnId);
        setTimeout(() => {
          pullSpecificGrn(initialGrnId);
        }, 300);
      } else if (initialPoId) {
        setSelectedPoId(initialPoId);
        setTimeout(() => {
          pullSpecificPo(initialPoId);
        }, 300);
      }
    }
  }, [open, initialGrnId, initialPoId]);

  const pullSpecificPo = async (id: string) => {
    setLoadingPo(true);
    try {
      const res = await fetch(`/api/purchasing/orders/${id}`);
      const data = await res.json();
      if (data.success && data.order) {
        const po = data.order;
        const poItems = po.items || [];
        setForm({
          ...form,
          supplier_id: String(po.supplier_id || ""),
          purchase_order_id: String(po.id),
          notes: `Ditarik dari PO #${po.po_no}. ${po.notes || ""}`,
          items: poItems.map((it: any) => ({
            product_id: String(it.product_id),
            description: `${it.product_name} (${it.product_sku})`,
            quantity: String(it.quantity),
            unit_price: String(it.unit_price),
            tax_amount: String(it.tax_amount || 0),
          })),
        });
        toast("success", `Data ditarik otomatis dari ${po.po_no}`);
      }
    } catch (err) {
      toast("error", "Gagal menarik data PO");
    } finally {
      setLoadingPo(false);
    }
  };

  const pullSpecificGrn = async (id: string) => {
    setLoadingGrn(true);
    try {
      const res = await fetch(`/api/inventory/receiving/${id}`);
      const data = await res.json();
      if (data.success && data.receipt) {
        const grn = data.receipt;
        const grnItems = data.items || [];
        setForm({
          ...form,
          supplier_id: String(grn.supplier_id || ""),
          purchase_order_id: String(grn.purchase_order_id || ""),
          notes: `Ditarik dari GRN #${grn.receipt_no}. ${grn.notes || ""}`,
          items: grnItems.map((it: any) => ({
            product_id: String(it.product_id),
            description: `${it.product_name} (${it.product_sku})`,
            quantity: String(it.quantity),
            unit_price: String(it.unit_cost),
            tax_amount: "0",
          })),
        });
        toast("success", `Data ditarik otomatis dari ${grn.receipt_no}`);
      }
    } catch (err) {
      toast("error", "Gagal menarik data GRN");
    } finally {
      setLoadingGrn(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers?limit=100");
      const data = await res.json();
      if (data.success) setSuppliers(data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGrns = async () => {
    setLoadingGrn(true);
    try {
      const res = await fetch("/api/inventory/receiving?status=posted&limit=50");
      const data = await res.json();
      if (data.success) setGrns(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGrn(false);
    }
  };

  const fetchPos = async () => {
    setLoadingPo(true);
    try {
      const res = await fetch("/api/purchasing/orders?status=approved&limit=50");
      const data = await res.json();
      if (data.success) setPos(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPo(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products?limit=100");
      const data = await res.json();
      if (data.success) setProducts(data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePullGrn = async () => {
    if (!selectedGrnId) return;
    setLoadingGrn(true);
    try {
      const res = await fetch(`/api/inventory/receiving/${selectedGrnId}`);
      const data = await res.json();
      if (data.success && data.receipt) {
        const grn = data.receipt;
        const grnItems = data.items || [];

        // Auto-fill form
        setForm({
          ...form,
          supplier_id: String(grn.supplier_id || ""),
          purchase_order_id: String(grn.purchase_order_id || ""),
          notes: `Ditarik dari GRN #${grn.receipt_no}. ${grn.notes || ""}`,
          items: grnItems.map((it: any) => ({
            product_id: String(it.product_id),
            description: `${it.product_name} (${it.product_sku})`,
            quantity: String(it.quantity),
            unit_price: String(it.unit_cost),
            tax_amount: "0",
          })),
        });
        toast("success", `Data ditarik dari ${grn.receipt_no}`);
      }
    } catch (err) {
      toast("error", "Gagal menarik data GRN");
    } finally {
      setLoadingGrn(false);
    }
  };

  const handlePullPo = async () => {
    if (!selectedPoId) return;
    setLoadingPo(true);
    try {
      const res = await fetch(`/api/purchasing/orders/${selectedPoId}`);
      const data = await res.json();
      if (data.success && data.order) {
        const po = data.order;
        const poItems = po.items || [];

        setForm({
          ...form,
          supplier_id: String(po.supplier_id || ""),
          purchase_order_id: String(po.id),
          notes: `Ditarik dari PO #${po.po_no}. ${po.notes || ""}`,
          items: poItems.map((it: any) => ({
            product_id: String(it.product_id),
            description: `${it.product_name} (${it.product_sku})`,
            quantity: String(it.quantity),
            unit_price: String(it.unit_price),
            tax_amount: String(it.tax_amount || 0),
          })),
        });
        toast("success", `Data ditarik dari ${po.po_no}`);
      }
    } catch (err) {
      toast("error", "Gagal menarik data PO");
    } finally {
      setLoadingPo(false);
    }
  };

  const handleSave = async () => {
    if (!form.invoice_no) return toast("error", "Nomor faktur wajib diisi");
    setSaving(true);
    try {
      const res = await fetch("/api/purchasing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          supplier_id: Number(form.supplier_id) || 1, // Fallback for demo
          items: form.items.map(it => ({
            ...it,
            product_id: Number(it.product_id),
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
            tax_amount: Number(it.tax_amount),
          }))
        }),
      });
      if (res.ok) {
        toast("success", "Faktur Pembelian berhasil dicatat");
        onSuccess();
        onClose();
      } else {
        const d = await res.json();
        throw new Error(d.error || "Gagal simpan");
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const subtotal = form.items.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.unit_price)), 0);
  const totalTax = form.items.reduce((acc, curr) => acc + Number(curr.tax_amount), 0);

  return (
    <Dialog open={open} onClose={onClose} className="max-w-4xl">
      <DialogHeader
        title="Catat Faktur Pembelian (Supplier Invoice)"
        description="Gunakan fitur 'Tarik dari Penerimaan' untuk mengisi data otomatis."
        onClose={onClose}
      />

      <div className="space-y-4">
        {/* Quick Pull Tool */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
            <label className="text-[10px] font-bold text-indigo-600 uppercase block">Tarik dari Penerimaan (GRN)</label>
            <div className="flex gap-2">
              <Select
                value={selectedGrnId}
                onChange={(e) => { setSelectedGrnId(e.target.value); setSelectedPoId(""); }}
                className="bg-white border-indigo-200 text-xs h-8"
              >
                <option value="">-- Pilih Nomor GRN --</option>
                {grns.map(g => (
                  <option key={g.id} value={g.id}>{g.receipt_no} ({g.supplier_name || "Direct"})</option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePullGrn}
                disabled={!selectedGrnId || loadingGrn}
                className="border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50 shrink-0 h-8"
              >
                {loadingGrn ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
            <label className="text-[10px] font-bold text-blue-600 uppercase block">Tarik dari Pesanan (PO)</label>
            <div className="flex gap-2">
              <Select
                value={selectedPoId}
                onChange={(e) => { setSelectedPoId(e.target.value); setSelectedGrnId(""); }}
                className="bg-white border-blue-200 text-xs h-8"
              >
                <option value="">-- Pilih Nomor PO --</option>
                {pos.map(p => (
                  <option key={p.id} value={p.id}>{p.po_no} ({p.supplier_name})</option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePullPo}
                disabled={!selectedPoId || loadingPo}
                className="border-blue-300 text-blue-700 bg-white hover:bg-blue-50 shrink-0 h-8"
              >
                {loadingPo ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <FormField label="Pemasok / Supplier" required>
              <Select
                value={form.supplier_id}
                onChange={e => setForm({...form, supplier_id: e.target.value})}
              >
                <option value="">-- Pilih Pemasok --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Nomor Faktur Pemasok" required>
            <Input value={form.invoice_no} onChange={e => setForm({...form, invoice_no: e.target.value})} />
          </FormField>
          <FormField label="Tanggal Faktur" required>
            <Input type="date" value={form.invoice_date} onChange={e => setForm({...form, invoice_date: e.target.value})} />
          </FormField>
        </div>

        {/* Items Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-2 text-left">Deskripsi / Produk</th>
                <th className="p-2 text-right w-20">Qty</th>
                <th className="p-2 text-right w-32">Harga Satuan</th>
                <th className="p-2 text-right w-32">Subtotal</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="p-2">
                    <Input
                      placeholder="Nama barang / jasa..."
                      value={it.description}
                      onChange={e => {
                        const items = [...form.items];
                        items[idx].description = e.target.value;
                        setForm({...form, items});
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={e => {
                        const items = [...form.items];
                        items[idx].quantity = e.target.value;
                        setForm({...form, items});
                      }}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={it.unit_price}
                      onChange={e => {
                        const items = [...form.items];
                        items[idx].unit_price = e.target.value;
                        setForm({...form, items});
                      }}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-mono font-bold">
                    {formatCurrency(Number(it.quantity) * Number(it.unit_price))}
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-rose-500"
                      onClick={() => setForm({...form, items: form.items.filter((_, i) => i !== idx)})}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-10 p-3 bg-slate-50 rounded-lg border">
          <div className="text-right space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Subtotal</p>
            <p className="text-sm font-bold text-slate-900">{formatCurrency(subtotal)}</p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Total Tagihan</p>
            <p className="text-lg font-black text-indigo-600">{formatCurrency(subtotal + totalTax)}</p>
          </div>
        </div>

        <FormField label="Catatan Internal">
          <Textarea
            placeholder="Tambahkan instruksi pembayaran atau catatan audit..."
            value={form.notes}
            onChange={e => setForm({...form, notes: e.target.value})}
            rows={2}
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Batal</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
          Posting Faktur & Hutang
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
