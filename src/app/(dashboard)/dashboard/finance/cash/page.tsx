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
import { Wallet, Plus, TrendingUp, TrendingDown, Loader2, RefreshCw, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CashAccount {
  id: number;
  code: string;
  name: string;
  currency_code: string;
  current_balance?: number;
}

interface CashTransaction {
  id: number;
  cash_account_id: number;
  account_name?: string;
  transaction_type: "in" | "out" | "transfer";
  amount: string;
  transaction_date: string;
  description?: string | null;
  status: "draft" | "posted" | "cancelled";
}

export default function CashPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Forms
  const [accountForm, setAccountForm] = useState({
    code: `CSH-${Date.now().toString().slice(-4)}`,
    name: "",
    currency_code: "IDR",
    opening_balance: "0",
  });

  const [txForm, setTxForm] = useState({
    cash_account_id: "",
    transaction_type: "in" as "in" | "out",
    amount: "0",
    transaction_date: today,
    description: "",
  });

  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [txErrors, setTxErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, tRes] = await Promise.all([
        fetch("/api/finance/cash-accounts"),
        fetch("/api/finance/cash-transactions?limit=50"),
      ]);

      const aData = await aRes.json();
      const tData = await tRes.json();

      const accList = aData.data || aData.accounts || [];
      const txList = tData.data || tData.transactions || [];

      setAccounts(accList);
      setTransactions(txList);

      if (accList.length > 0) {
        setTxForm((p) => (p.cash_account_id ? p : { ...p, cash_account_id: accList[0].id.toString() }));
      }
    } catch {
      toast("error", "Gagal memuat data kas");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateAccount = async () => {
    const errs: Record<string, string> = {};
    if (!accountForm.code.trim()) errs.code = "Kode akun wajib diisi";
    if (!accountForm.name.trim()) errs.name = "Nama akun kas wajib diisi";
    setAccountErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/finance/cash-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: accountForm.code.trim(),
          name: accountForm.name.trim(),
          currency_code: accountForm.currency_code,
          opening_balance: Number(accountForm.opening_balance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat akun kas");

      toast("success", "Akun kas baru berhasil dibuat");
      setAccountDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordTx = async () => {
    const errs: Record<string, string> = {};
    if (!txForm.cash_account_id) errs.cash_account_id = "Pilih akun kas";
    if (isNaN(Number(txForm.amount)) || Number(txForm.amount) <= 0) errs.amount = "Nominal harus > 0";
    if (!txForm.transaction_date) errs.transaction_date = "Tanggal transaksi wajib diisi";
    setTxErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/finance/cash-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cash_account_id: Number(txForm.cash_account_id),
          transaction_type: txForm.transaction_type,
          amount: Number(txForm.amount),
          transaction_date: txForm.transaction_date,
          description: txForm.description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencatat mutasi kas");

      toast("success", "Mutasi kas berhasil dibukukan");
      setTxDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  const totalIn = transactions
    .filter((t) => t.transaction_type === "in" && t.status === "posted")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions
    .filter((t) => t.transaction_type === "out" && t.status === "posted")
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kas (Cash Management)</h1>
            <Badge variant="outline" className="text-xs">Keuangan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manajemen akun kas dan pencatatan transaksi penerimaan & pengeluaran kas perusahaan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={transactions.map((t) => ({
              tanggal: t.transaction_date,
              akun: t.account_name ?? "",
              tipe: t.transaction_type === "in" ? "Masuk" : t.transaction_type === "out" ? "Keluar" : "Transfer",
              nominal: t.amount,
              keterangan: t.description ?? "",
              status: t.status,
            }))}
            columns={[
              { header: "Tanggal", key: "tanggal", align: "left" },
              { header: "Akun Kas", key: "akun", align: "left" },
              { header: "Tipe", key: "tipe", align: "center" },
              { header: "Nominal", key: "nominal", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Keterangan", key: "keterangan", align: "left" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="mutasi_kas"
            title="Laporan Mutasi Kas (Cash Management)"
            subtitle="Transaksi penerimaan & pengeluaran kas — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccountDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Akun Kas
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setTxDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Catat Transaksi Kas
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Saldo Kas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(totalBalance)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{accounts.length} akun kas terdaftar</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Penerimaan Kas Masuk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{formatCurrency(totalIn)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total kas masuk berstatus posted</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Pengeluaran Kas Keluar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 font-mono">{formatCurrency(totalOut)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total kas keluar operasional</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts & Transactions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Daftar Akun Kas
            </CardTitle>
            <CardDescription className="text-xs">Titik kas kecil dan kas operasional.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada akun kas.</div>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div key={acc.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900 text-xs">{acc.name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{acc.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-xs text-slate-900">{formatCurrency(acc.current_balance)}</p>
                      <Badge variant="outline" className="text-[9px] py-0">{acc.currency_code}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card className="border-slate-200 shadow-xs lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Riwayat Mutasi Transaksi Kas
            </CardTitle>
            <CardDescription className="text-xs">Catatan mutasi penerimaan dan pengeluaran fisik kas.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada mutasi transaksi kas.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Akun Kas</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} className="text-xs">
                        <TableCell className="text-slate-600 font-mono">
                          {new Date(tx.transaction_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{tx.account_name || "-"}</TableCell>
                        <TableCell>
                          {tx.transaction_type === "in" ? (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              <ArrowDownLeft className="w-3 h-3 mr-1" /> MASUK
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-red-700 bg-red-50 border-red-200">
                              <ArrowUpRight className="w-3 h-3 mr-1" /> KELUAR
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate">{tx.description || "-"}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          <span className={tx.transaction_type === "in" ? "text-emerald-600" : "text-red-600"}>
                            {tx.transaction_type === "in" ? "+" : "-"}{formatCurrency(tx.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={tx.status === "posted" ? "secondary" : "outline"} className="text-[10px]">
                            {tx.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Account Dialog */}
      <Dialog open={accountDialogOpen} onClose={() => setAccountDialogOpen(false)} className="max-w-md">
        <DialogHeader title="Tambah Akun Kas Baru" description="Pendaftaran pos kas baru di perusahaan" onClose={() => setAccountDialogOpen(false)} />
        <div className="space-y-4">
          <FormField label="Kode Akun Kas" required error={accountErrors.code}>
            <Input value={accountForm.code} onChange={(e) => setAccountForm((p) => ({ ...p, code: e.target.value }))} />
          </FormField>
          <FormField label="Nama Akun Kas" required error={accountErrors.name}>
            <Input placeholder="Mis. Kas Kecil Operasional" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mata Uang">
              <Select value={accountForm.currency_code} onChange={(e) => setAccountForm((p) => ({ ...p, currency_code: e.target.value }))}>
                <option value="IDR">IDR (Rupiah)</option>
                <option value="USD">USD (Dollar)</option>
              </Select>
            </FormField>
            <FormField label="Saldo Awal (Rp)">
              <Input type="number" min="0" value={accountForm.opening_balance} onChange={(e) => setAccountForm((p) => ({ ...p, opening_balance: e.target.value }))} />
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setAccountDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleCreateAccount} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Tambah Akun"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Record Transaction Dialog */}
      <Dialog open={txDialogOpen} onClose={() => setTxDialogOpen(false)} className="max-w-md">
        <DialogHeader title="Catat Mutasi Transaksi Kas" description="Pencatatan uang masuk atau keluar secara langsung" onClose={() => setTxDialogOpen(false)} />
        <div className="space-y-4">
          <FormField label="Akun Kas" required error={txErrors.cash_account_id}>
            <Select value={txForm.cash_account_id} onChange={(e) => setTxForm((p) => ({ ...p, cash_account_id: e.target.value }))}>
              <option value="">-- Pilih Akun Kas --</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipe Transaksi">
              <Select value={txForm.transaction_type} onChange={(e) => setTxForm((p) => ({ ...p, transaction_type: e.target.value as "in" | "out" }))}>
                <option value="in">Kas Masuk (Penerimaan)</option>
                <option value="out">Kas Keluar (Pengeluaran)</option>
              </Select>
            </FormField>
            <FormField label="Tanggal" required error={txErrors.transaction_date}>
              <Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm((p) => ({ ...p, transaction_date: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Nominal (Rp)" required error={txErrors.amount}>
            <Input type="number" min="1" placeholder="0" value={txForm.amount} onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value }))} />
          </FormField>
          <FormField label="Keterangan Transaksi">
            <Textarea placeholder="Tujuan penerimaan / pengeluaran uang..." value={txForm.description} onChange={(e) => setTxForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setTxDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleRecordTx} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Bukukan Transaksi"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
