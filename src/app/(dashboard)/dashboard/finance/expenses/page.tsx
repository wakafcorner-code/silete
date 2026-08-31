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
import { Receipt, CheckCircle, Send, XCircle, CreditCard, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Expense {
  id: number;
  expense_no: string;
  expense_date: string;
  category_name?: string;
  branch_name?: string;
  description: string;
  amount: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "paid" | "cancelled";
  paid_at?: string | null;
}

interface ExpenseCategory {
  id: number;
  name: string;
  code: string;
}

interface Branch {
  id: number;
  name: string;
}

interface CashAccount {
  id: number;
  name: string;
  code: string;
}

interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    expense_no: `EXP-${Date.now().toString().slice(-6)}`,
    expense_date: today,
    category_id: "",
    branch_id: "",
    description: "",
    amount: "0",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [payForm, setPayForm] = useState({
    payment_method: "cash" as "cash" | "bank",
    account_id: "",
    payment_date: today,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: "100",
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });

      const [eRes, cRes, bRes, cashRes, bankRes] = await Promise.all([
        fetch(`/api/expenses?${queryParams.toString()}`),
        fetch("/api/expenses/categories"),
        fetch("/api/branches"),
        fetch("/api/finance/cash-accounts"),
        fetch("/api/finance/bank-accounts"),
      ]);

      const eData = await eRes.json();
      const cData = await cRes.json();
      const bData = await bRes.json();
      const cashData = await cashRes.json();
      const bankData = await bankRes.json();

      if (eData.success) setExpenses(eData.data || []);
      if (cData.success) setCategories(cData.categories || cData.data || []);
      if (bData.success) setBranches(bData.branches || bData.data || []);
      if (cashData.success) setCashAccounts(cashData.accounts || cashData.data || []);
      if (bankData.success) setBankAccounts(bankData.accounts || bankData.data || []);
    } catch {
      toast("error", "Gagal memuat data pengeluaran");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      expense_no: `EXP-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      expense_date: today,
      category_id: categories[0]?.id.toString() || "",
      branch_id: "",
      description: "",
      amount: "0",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const openPayDialog = (exp: Expense) => {
    setSelectedExpense(exp);
    setPayForm({
      payment_method: "cash",
      account_id: cashAccounts[0]?.id.toString() || "",
      payment_date: today,
    });
    setPayDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.expense_no.trim()) errs.expense_no = "Nomor biaya wajib diisi";
    if (!form.expense_date) errs.expense_date = "Tanggal wajib diisi";
    if (!form.category_id) errs.category_id = "Kategori wajib dipilih";
    if (!form.description.trim()) errs.description = "Keterangan wajib diisi";
    if (isNaN(Number(form.amount)) || Number(form.amount) <= 0) errs.amount = "Nominal harus > 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        expense_no: form.expense_no.trim(),
        expense_date: form.expense_date,
        category_id: Number(form.category_id),
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        description: form.description.trim(),
        amount: Number(form.amount),
      };

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat pengeluaran");

      if (evidenceFile && data.data?.id) {
        const evidence = new FormData();
        evidence.append("file", evidenceFile);
        evidence.append("reference_type", "expense");
        evidence.append("reference_id", String(data.data.id));
        const uploadRes = await fetch("/api/attachments", { method: "POST", body: evidence });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "Gagal mengunggah bukti transaksi");
      }

      toast("success", "Pengeluaran berhasil diajukan");
      setDialogOpen(false);
      setEvidenceFile(null);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: number, action: "submit" | "approve" | "reject") => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/expenses/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Gagal melakukan aksi ${action}`);

      const actionText = action === "submit" ? "diajukan" : action === "approve" ? "disetujui" : "ditolak";
      toast("success", `Pengeluaran berhasil ${actionText}`);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePay = async () => {
    if (!selectedExpense || !payForm.account_id) {
      toast("warning", "Pilih akun kas/bank pembayaran");
      return;
    }
    setSaving(true);
    try {
      const body = {
        payment_method: payForm.payment_method,
        account_id: Number(payForm.account_id),
        payment_date: payForm.payment_date,
      };

      const res = await fetch(`/api/expenses/${selectedExpense.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memproses pembayaran");

      toast("success", "Biaya berhasil dibayar & jurnal kas tercatat");
      setPayDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const pendingApproval = expenses.filter((e) => e.status === "submitted").length;
  const totalPaid = expenses
    .filter((e) => e.status === "paid")
    .reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pengeluaran / Biaya Operasional (Expenses)
            </h1>
            <Badge variant="outline" className="text-xs">Keuangan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pengajuan, persetujuan bertingkat, dan pencatatan pembayaran kas/bank secara otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={expenses.map((e) => ({
              no_pengeluaran: e.expense_no,
              tanggal: e.expense_date,
              kategori: e.category_name ?? "",
              cabang: e.branch_name ?? "",
              keterangan: e.description,
              nominal: e.amount,
              status: e.status,
              tanggal_bayar: e.paid_at ?? "-",
            }))}
            columns={[
              { header: "No. Pengeluaran", key: "no_pengeluaran", align: "left" },
              { header: "Tanggal", key: "tanggal", align: "left" },
              { header: "Kategori", key: "kategori", align: "left" },
              { header: "Cabang", key: "cabang", align: "left" },
              { header: "Keterangan", key: "keterangan", align: "left" },
              { header: "Nominal", key: "nominal", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Status", key: "status", align: "center" },
              { header: "Tanggal Bayar", key: "tanggal_bayar", align: "left" },
            ]}
            filename="daftar_pengeluaran_biaya"
            title="Laporan Biaya & Pengeluaran Operasional"
            subtitle="Daftar pengajuan & realisasi biaya — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Ajukan Biaya Baru
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Menunggu Persetujuan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingApproval}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Pengajuan perlu ditinjau</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Biaya Terbayar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{formatCurrency(totalPaid)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Sudah dijurnal ke Buku Besar</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Dokumen Biaya</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{expenses.length}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Semua status perushaan aktif</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari nomor biaya / keterangan..."
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
            <option value="paid">Dibayar (Paid)</option>
            <option value="rejected">Ditolak (Rejected)</option>
          </Select>
        </div>
        <Input type="date" aria-label="Tanggal mulai" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-full text-xs sm:w-40" />
        <Input type="date" aria-label="Tanggal akhir" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-full text-xs sm:w-40" />
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              Daftar Dokumen Biaya
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {expenses.length} Pengajuan
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Alur: Draft → Diajukan → Disetujui → Bayar (Otomatis potong Kas/Bank & Posting Jurnal).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada data dengan kata kunci "${search}"` : "Belum ada pengeluaran dicatat."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Biaya</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Aksi / Alur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {exp.expense_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(exp.expense_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">
                        {exp.category_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600 max-w-xs truncate">
                        {exp.description}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(exp.amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {exp.status === "paid" ? (
                          <Badge variant="secondary" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            DIBAYAR
                          </Badge>
                        ) : exp.status === "approved" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            DISETUJUI
                          </Badge>
                        ) : exp.status === "submitted" ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            DIAJUKAN
                          </Badge>
                        ) : exp.status === "draft" ? (
                          <Badge variant="outline" className="text-[10px] text-slate-600 bg-slate-50 border-slate-200">
                            DRAFT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {exp.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {exp.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleAction(exp.id, "submit")}
                              disabled={actionLoadingId === exp.id}
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Ajukan
                            </Button>
                          )}
                          {exp.status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleAction(exp.id, "approve")}
                                disabled={actionLoadingId === exp.id}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] border-red-200 text-red-700 hover:bg-red-50"
                                onClick={() => handleAction(exp.id, "reject")}
                                disabled={actionLoadingId === exp.id}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Tolak
                              </Button>
                            </>
                          )}
                          {exp.status === "approved" && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openPayDialog(exp)}
                            >
                              <CreditCard className="w-3 h-3 mr-1" />
                              Bayar Sekarang
                            </Button>
                          )}
                          {exp.status === "paid" && (
                            <span className="text-[11px] text-emerald-600 font-medium">Selesai Dibayar</span>
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
          title="Pengajuan Biaya Baru"
          description="Isi detail pos biaya operasional yang diajukan"
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor Dokumen" required error={errors.expense_no}>
              <Input
                placeholder="Mis. EXP-202608-001"
                value={form.expense_no}
                onChange={(e) => setForm((p) => ({ ...p, expense_no: e.target.value }))}
              />
            </FormField>
            <FormField label="Tanggal" required error={errors.expense_date}>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Kategori Biaya" required error={errors.category_id}>
            <Select
              value={form.category_id}
              onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
            >
              <option value="">-- Pilih Kategori --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Cabang / Unit">
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

          <FormField label="Nominal Biaya (Rp)" required error={errors.amount}>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </FormField>

          <FormField label="Keterangan Pengeluaran" required error={errors.description}>
            <Textarea
              placeholder="Jelaskan kebutuhan pengeluaran..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
            />
          </FormField>

          <FormField label="Bukti Transaksi (opsional)">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <p className="mt-1 text-[10px] text-slate-500">JPG, PNG, WEBP, atau PDF. Maksimal 25MB.</p>
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Ajukan Biaya"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Eksekusi Pembayaran Biaya"
          description={`Bayar ${selectedExpense?.expense_no} sebesar ${formatCurrency(selectedExpense?.amount)}`}
          onClose={() => setPayDialogOpen(false)}
        />
        <div className="space-y-4">
          <FormField label="Metode Pembayaran">
            <Select
              value={payForm.payment_method}
              onChange={(e) => {
                const method = e.target.value as "cash" | "bank";
                setPayForm((p) => ({
                  ...p,
                  payment_method: method,
                  account_id: method === "cash" ? (cashAccounts[0]?.id.toString() || "") : (bankAccounts[0]?.id.toString() || ""),
                }));
              }}
            >
              <option value="cash">Kas Fisik (Cash Account)</option>
              <option value="bank">Transfer Bank (Bank Account)</option>
            </Select>
          </FormField>

          <FormField label="Rekening / Akun Sumber">
            <Select
              value={payForm.account_id}
              onChange={(e) => setPayForm((p) => ({ ...p, account_id: e.target.value }))}
            >
              {payForm.payment_method === "cash" ? (
                cashAccounts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))
              ) : (
                bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number}</option>
                ))
              )}
            </Select>
          </FormField>

          <FormField label="Tanggal Pembayaran">
            <Input
              type="date"
              value={payForm.payment_date}
              onChange={(e) => setPayForm((p) => ({ ...p, payment_date: e.target.value }))}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPayDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button
            size="sm"
            onClick={handlePay}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Memproses...</> : "Konfirmasi Pembayaran"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
