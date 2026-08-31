"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { History, Loader2, RefreshCw, Search, ArrowDownLeft, ArrowUpRight, FileText } from "lucide-react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

interface InventoryMovement {
  id: number;
  warehouse_id: number;
  warehouse_name?: string;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  transaction_type: string;
  quantity: string;
  unit_cost: string;
  reference_type?: string | null;
  reference_number?: string | null;
  mitra_name?: string | null;
  transaction_date: string;
}

interface WarehouseItem {
  id: number;
  name: string;
  code: string;
}

export default function MovementsPage() {
  const { toast } = useToast();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: "100",
        ...(search ? { search } : {}),
        ...(warehouseFilter ? { warehouse_id: warehouseFilter } : {}),
        ...(typeFilter ? { transaction_type: typeFilter } : {}),
      });

      const [mRes, wRes] = await Promise.all([
        fetch(`/silete/api/inventory/movements?${queryParams.toString()}`),
        fetch("/silete/api/warehouses"),
      ]);

      const mData = await mRes.json();
      const wData = await wRes.json();

      if (mData.success) setMovements(mData.data || []);
      if (wData.success) setWarehouses(wData.warehouses || wData.data || []);
    } catch {
      toast("error", "Gagal memuat histori mutasi stok");
    } finally {
      setLoading(false);
    }
  }, [search, warehouseFilter, typeFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Histori Mutasi Stok (Inventory Movements)
            </h1>
            <Badge variant="outline" className="text-xs">Audit & Log</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Buku mutasi lengkap yang mencatat setiap penambahan, pengurangan, transfer, dan penyesuaian inventaris.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={movements.map((m) => ({
              tanggal: new Date(m.transaction_date).toLocaleString("id-ID"),
              gudang: m.warehouse_name || "-",
              sku: m.product_sku || "-",
              produk: m.product_name || "-",
              tipe: m.transaction_type.toUpperCase(),
              qty: Number(m.quantity),
              mitra: m.mitra_name || "-",
              referensi: m.reference_number || m.reference_type || "Direct",
            }))}
            columns={[
              { header: "Tanggal", key: "tanggal" },
              { header: "Gudang", key: "gudang" },
              { header: "SKU", key: "sku" },
              { header: "Produk", key: "produk" },
              { header: "Tipe", key: "tipe" },
              { header: "Qty", key: "qty", align: "right" },
              { header: "Mitra/Partner", key: "mitra" },
              { header: "Referensi", key: "referensi" },
            ]}
            filename="mutasi_stok"
            title="Laporan Mutasi Stok"
            subtitle="Histori pergerakan barang masuk dan keluar — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari SKU / nama barang..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
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
        <div className="w-full sm:w-48">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 text-xs"
          >
            <option value="">-- Semua Tipe Mutasi --</option>
            <option value="receipt">RECEIPT (Penerimaan)</option>
            <option value="issue">ISSUE (Pengeluaran)</option>
            <option value="transfer_in">TRANSFER_IN (Masuk)</option>
            <option value="transfer_out">TRANSFER_OUT (Keluar)</option>
            <option value="adjustment">ADJUSTMENT (Koreksi)</option>
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Catatan Log Mutasi Berjalan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {movements.length} Mutasi
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Log mutasi bersifat append-only dan tidak dapat diedit atau dihapus sembarangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada mutasi dengan kata kunci "${search}"` : "Belum ada catatan mutasi inventaris."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Tanggal & Waktu</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-center">Tipe Transaksi</TableHead>
                    <TableHead className="text-right">Kuantitas</TableHead>
                    <TableHead>Mitra / Partner</TableHead>
                    <TableHead>Dokumen Referensi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((row) => {
                    const isIncrease =
                      row.transaction_type.toLowerCase().includes("receipt") ||
                      row.transaction_type.toLowerCase().includes("transfer_in") ||
                      row.transaction_type.toLowerCase().includes("opening") ||
                      row.transaction_type.toLowerCase().includes("adjustment");

                    return (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="text-slate-600 font-mono">
                          {new Date(row.transaction_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          {row.warehouse_name || "-"}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900">{row.product_name || "-"}</p>
                          <p className="text-[10px] font-mono text-slate-500">{row.product_sku}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          {isIncrease ? (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              <ArrowDownLeft className="w-3 h-3 mr-1" /> {row.transaction_type.toUpperCase()}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-red-700 bg-red-50 border-red-200">
                              <ArrowUpRight className="w-3 h-3 mr-1" /> {row.transaction_type.toUpperCase()}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-slate-900">
                          {Number(row.quantity).toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-slate-700">
                          {row.mitra_name || "-"}
                        </TableCell>
                        <TableCell className="text-slate-500 font-mono text-[11px]">
                          {row.reference_number || row.reference_type || "DIRECT"}
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
