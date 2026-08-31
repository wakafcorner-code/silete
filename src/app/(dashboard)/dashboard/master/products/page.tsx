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
import { Boxes, Edit2, Loader2, Plus, RefreshCw, Search, Tag, FolderPlus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  unit: string;
  cost_price: string;
  selling_price: string;
  min_stock?: number;
  status: "active" | "inactive";
}

interface Category {
  id: number;
  name: string;
}

const EMPTY_FORM = {
  sku: "",
  name: "",
  description: "",
  category_id: "",
  category_new: "",   // for manual text entry
  use_new_category: false,
  unit: "KG",
  cost_price: "200000",
  selling_price: "230000",
  min_stock: "0",
  status: "active",
};

export default function ProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/silete/api/products?limit=100&search=${encodeURIComponent(search)}`),
        fetch("/silete/api/product-categories?limit=200"),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      if (pData.success) setProducts(pData.data || []);
      if (cData.success) setCategories(cData.data || []);
    } catch {
      toast("error", "Gagal memuat data produk");
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

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description || "",
      category_id: p.category_id?.toString() || "",
      category_new: "",
      use_new_category: false,
      unit: p.unit,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      min_stock: p.min_stock?.toString() || "0",
      status: p.status,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.sku.trim()) errs.sku = "SKU wajib diisi";
    if (!form.name.trim()) errs.name = "Nama produk wajib diisi";
    if (!form.unit.trim()) errs.unit = "Satuan wajib diisi";
    if (isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0) errs.cost_price = "Harga pokok tidak valid";
    if (isNaN(Number(form.selling_price)) || Number(form.selling_price) < 0) errs.selling_price = "Harga jual tidak valid";
    if (form.use_new_category && !form.category_new.trim()) errs.category_new = "Nama kategori baru wajib diisi";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let categoryId: number | null = form.category_id ? Number(form.category_id) : null;

      // If user typed a new category, create it first
      if (form.use_new_category && form.category_new.trim()) {
        const catCode = `CAT-${Date.now().toString().slice(-6)}`;
        const catRes = await fetch("/silete/api/product-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: catCode,
            name: form.category_new.trim(),
            status: "active",
          }),
        });
        const catData = await catRes.json();
        if (!catRes.ok) throw new Error(catData.error || "Gagal membuat kategori baru");
        categoryId = catData.category?.id ?? null;
        // Refresh category list
        fetchData();
      }

      const body = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: categoryId,
        unit: form.unit.trim(),
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        min_stock: Number(form.min_stock) || 0,
        status: form.status,
      };

      const url = editingId ? `/silete/api/products/${editingId}` : "/silete/api/products";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan produk");

      toast("success", editingId ? "Produk berhasil diperbarui" : "Produk berhasil ditambahkan");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleField = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as string]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Produk & Barang</h1>
            <Badge variant="outline" className="text-xs">Master Data</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Katalog barang dagang, bahan baku, dan penetapan harga per perusahaan aktif.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Produk
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Cari produk..."
          className="pl-8 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              Katalog Produk Terdaftar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">{products.length} Item</Badge>
          </div>
          <CardDescription className="text-xs">
            Daftar SKU, kategori, satuan, harga pokok penjualan, dan harga jual standar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada produk dengan kata kunci "${search}"` : "Belum ada produk yang terdaftar."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">HPP</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-semibold">{p.sku}</TableCell>
                      <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {p.category_name ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                            <Tag className="w-3 h-3 text-slate-400" />
                            {p.category_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600 uppercase">{p.unit}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-700">
                        {formatCurrency(p.cost_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                        {formatCurrency(p.selling_price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === "active" ? "success" : "secondary"}>
                          {p.status === "active" ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(p)} title="Edit">
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-lg">
        <DialogHeader
          title={editingId ? "Edit Produk" : "Tambah Produk Baru"}
          description={editingId ? "Perbarui informasi produk" : "Isi detail produk yang akan ditambahkan ke katalog"}
          onClose={() => setDialogOpen(false)}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU" required error={errors.sku}>
              <Input
                placeholder="Mis. PRD-001"
                value={form.sku}
                onChange={(e) => handleField("sku", e.target.value)}
                disabled={!!editingId}
              />
            </FormField>
            <FormField label="Satuan" required error={errors.unit}>
              <Input
                placeholder="pcs, kg, ltr, box..."
                value={form.unit}
                onChange={(e) => handleField("unit", e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Nama Produk" required error={errors.name}>
            <Input
              placeholder="Nama lengkap produk"
              value={form.name}
              onChange={(e) => handleField("name", e.target.value)}
            />
          </FormField>

          {/* Category — choose existing OR type new */}
          <FormField label="Kategori">
            <div className="space-y-2">
              {!form.use_new_category ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={form.category_id}
                    onChange={(e) => handleField("category_id", e.target.value)}
                    className="flex-1"
                  >
                    <option value="">— Tanpa Kategori —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8 text-xs gap-1 border-blue-300 text-blue-600"
                    onClick={() => handleField("use_new_category", true)}
                    title="Buat kategori baru"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Baru
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Ketik nama kategori baru..."
                    value={form.category_new}
                    onChange={(e) => handleField("category_new", e.target.value)}
                    className={`flex-1 ${errors.category_new ? "border-red-400" : ""}`}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-8 text-xs text-slate-500"
                    onClick={() => { handleField("use_new_category", false); handleField("category_new", ""); }}
                  >
                    ← Pilih yang ada
                  </Button>
                </div>
              )}
              {errors.category_new && (
                <p className="text-[11px] text-red-500">{errors.category_new}</p>
              )}
              <p className="text-[11px] text-slate-400">
                {form.use_new_category
                  ? "Kategori baru akan dibuat dan langsung diterapkan ke produk ini."
                  : "Pilih dari daftar atau klik \"Baru\" untuk membuat kategori baru."}
              </p>
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Harga Pokok (HPP)" required error={errors.cost_price}>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.cost_price}
                onChange={(e) => handleField("cost_price", e.target.value)}
              />
            </FormField>
            <FormField label="Harga Jual" required error={errors.selling_price}>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.selling_price}
                onChange={(e) => handleField("selling_price", e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Stok Minimum">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.min_stock}
                onChange={(e) => handleField("min_stock", e.target.value)}
              />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => handleField("status", e.target.value)}>
                <option value="active">Aktif</option>
                <option value="inactive">Non-Aktif</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Deskripsi">
            <Textarea
              placeholder="Deskripsi produk (opsional)"
              value={form.description}
              onChange={(e) => handleField("description", e.target.value)}
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</>
              : editingId ? "Simpan Perubahan" : "Tambah Produk"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
