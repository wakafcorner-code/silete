"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StockBalance {
  id: number;
  warehouse_id: number;
  warehouse_name?: string;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  product_unit?: string;
  quantity: string;
  average_cost: string;
  total_received?: string | number;
  minimum_stock?: number;
}

interface WarehouseItem {
  id: number;
  name: string;
  code: string;
}

export default function StockBalancesPage() {
  const { toast } = useToast();
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: "100",
        ...(search ? { search } : {}),
        ...(warehouseFilter ? { warehouse_id: warehouseFilter } : {}),
      });

      const [sRes, wRes] = await Promise.all([
        fetch(`/silete/api/inventory/stock-balances?${queryParams.toString()}`),
        fetch("/silete/api/warehouses"),
      ]);

      const sData = await sRes.json();
      const wData = await wRes.json();

      if (sData.success) setBalances(sData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
    } catch {
      toast("error", "Gagal memuat data saldo stok");
    } finally {
      setLoading(false);
    }
  }, [search, warehouseFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalQuantity = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  const totalValuation = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0) * (Number(b.average_cost) || 0), 0);
  const lowStockCount = balances.filter((b) => Number(b.quantity) <= 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Stok & Saldo Fisik Gudang
            </h1>
            <Badge variant="outline" className="text-xs">Inventori</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring posisi kuantitas stok per gudang dan valuasi harga pokok rata-rata (Average Cost).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Kuantitas Fisik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {totalQuantity.toLocaleString("id-ID")} Unit
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{balances.length} varian SKU terdaftar</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Nilai Valuasi Persediaan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 font-mono">
              {formatCurrency(totalValuation)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Valuasi buku kas persediaan (1300)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Stok Rendah / Habis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${lowStockCount > 0 ? "text-red-600" : "text-slate-700"}`}>
              {lowStockCount} Item
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Memerlukan pengadaan ulang (PR)</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari SKU / nama produk..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="h-8 text-xs"
          >
            <option value="">-- Semua Gudang --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              Posisi Saldo Stok Gudang
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {balances.length} Baris
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Data saldo terupdate secara atomik dari mutasi penerimaan, pengeluaran, transfer, dan penyesuaian.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : balances.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada saldo produk dengan kata kunci "${search}"` : "Belum ada saldo stok fisik tercatat."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Gudang</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead className="text-right">Total Dibeli</TableHead>
                    <TableHead className="text-right">Sisa Stok</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">HPP Rata-rata</TableHead>
                    <TableHead className="text-right">Total Nilai</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((row) => {
                    const qty = Number(row.quantity);
                    const bought = Number(row.total_received || 0);
                    const avgCost = Number(row.average_cost);
                    const totalVal = qty * avgCost;
                    const isLow = qty <= 0;

                    return (
                      <TableRow key={row.id} className="text-xs transition-colors hover:bg-slate-50 cursor-default group">
                        <TableCell className="font-medium text-slate-900">
                          {row.warehouse_name}
                        </TableCell>
                        <TableCell className="font-mono text-slate-600">
                          {row.product_sku}
                        </TableCell>
                        <TableCell className="text-slate-800 font-bold">
                          {row.product_name}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-slate-500">
                          {bought.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-indigo-600">
                          {qty.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-slate-500 uppercase text-[10px] font-bold">
                          {row.product_unit || "PCS"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">
                          {formatCurrency(avgCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600 bg-emerald-50/30 group-hover:bg-emerald-50 transition-colors">
                          {formatCurrency(totalVal)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isLow ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Habis
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200 gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Tersedia
                            </Badge>
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
    </div>
  );
}
