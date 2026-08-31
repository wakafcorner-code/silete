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
import { FileQuestion, CheckCircle, Send, XCircle, Loader2, Plus, RefreshCw, Search } from "lucide-react";

interface PurchaseRequest {
  id: number;
  request_no: string;
  request_date: string;
  branch_id?: number | null;
  branch_name?: string;
  requested_by_name?: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "converted";
  notes?: string | null;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

export default function PurchaseRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    request_no: `PR-${Date.now().toString().slice(-6)}`,
    request_date: today,
    branch_id: "",
    notes: "",
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

      const [rRes, bRes] = await Promise.all([
        fetch(`/api/purchasing/requests?${queryParams.toString()}`),
        fetch("api/branches"),
      ]);
      const rData = await rRes.json();
      const bData = await bRes.json();

      if (rData.success) setRequests(rData.data || []);
      if (bData.success) setBranches(bData.branches || bData.data || []);
    } catch {
      toast("error", "Gagal memuat data Purchase Request");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      request_no: `PR-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      request_date: today,
      branch_id: "",
      notes: "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.request_no.trim()) errs.request_no = "Nomor PR wajib diisi";
    if (!form.request_date) errs.request_date = "Tanggal wajib diisi";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        request_no: form.request_no.trim(),
        request_date: form.request_date,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        notes: form.notes.trim() || null,
      };

      const res = await fetch("api/purchasing/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat PR");

      toast("success", "Purchase Request berhasil dibuat sebagai DRAFT");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal membuat PR", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: number, action: "submit" | "approve" | "reject") => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/purchasing/requests/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Gagal melakukan aksi ${action}`);

      const actionText = action === "submit" ? "diajukan" : action === "approve" ? "disetujui" : "ditolak";
      toast("success", `Purchase Request berhasil ${actionText}`);
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
              Permintaan Pembelian (Purchase Request)
            </h1>
            <Badge variant="outline" className="text-xs">Purchasing</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pengajuan kebutuhan pengadaan barang dari divisi sebelum diterbitkan menjadi Purchase Order.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Permintaan (PR)
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari nomor PR / keterangan..."
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
            <option value="rejected">Ditolak (Rejected)</option>
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-blue-600" />
              Daftar Dokumen Purchase Request
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {requests.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Alur persetujuan bertingkat: Draft → Diajukan (Submitted) → Disetujui (Approved) / Ditolak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada PR dengan kata kunci "${search}"` : "Belum ada permohonan pembelian."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor PR</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Pemohon</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi / Alur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {row.request_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(row.request_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {row.branch_name || "Pusat"}
                      </TableCell>
                      <TableCell className="text-slate-800 font-medium">
                        {row.requested_by_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-xs truncate">
                        {row.notes || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.status === "approved" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            APPROVED
                          </Badge>
                        ) : row.status === "submitted" ? (
                          <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            SUBMITTED
                          </Badge>
                        ) : row.status === "draft" ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            DRAFT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {row.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {row.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleAction(row.id, "submit")}
                              disabled={actionLoadingId === row.id}
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Ajukan
                            </Button>
                          )}
                          {row.status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleAction(row.id, "approve")}
                                disabled={actionLoadingId === row.id}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                                onClick={() => handleAction(row.id, "reject")}
                                disabled={actionLoadingId === row.id}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Tolak
                              </Button>
                            </>
                          )}
                          {row.status === "approved" && (
                            <span className="text-[11px] text-slate-400 font-medium">Siap dibuat PO</span>
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Buat Permintaan Pembelian (PR)"
          description="Isi informasi dasar permohonan pengadaan barang"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <FormField label="Nomor Dokumen PR" required error={errors.request_no}>
            <Input
              placeholder="Mis. PR-202608-001"
              value={form.request_no}
              onChange={(e) => setForm((p) => ({ ...p, request_no: e.target.value }))}
            />
          </FormField>
          <FormField label="Tanggal Permintaan" required error={errors.request_date}>
            <Input
              type="date"
              value={form.request_date}
              onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))}
            />
          </FormField>
          <FormField label="Cabang / Unit">
            <Select
              value={form.branch_id}
              onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value }))}
            >
              <option value="">-- Kantor Pusat / Default --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Catatan / Justifikasi Kebutuhan">
            <Textarea
              placeholder="Jelaskan tujuan dan urgensi pengadaan barang..."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Buat PR"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
