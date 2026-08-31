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
import { Building2, Plus, TrendingUp, TrendingDown, Loader2, RefreshCw, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BankAccount {
  id: number;
  code: string;
  bank_name: string;
  account_number?: string | null;
  account_name?: string | null;
  currency_code: string;
  current_balance?: number;
}

interface BankTransaction {
  id: number;
  bank_account_id: number;
  bank_name?: string;
  transaction_type: "in" | "out" | "transfer";
  amount: string;
  transaction_date: string;
  description?: string | null;
  status: "draft" | "posted" | "cancelled";
}

export default function BankPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Forms
  const [accountForm, setAccountForm] = useState({
    code: `BNK-${Date.now().toString().slice(-4)}`,
    bank_name: "BCA",
    account_number: "",
    account_name: "",
    currency_code: "IDR",
    opening_balance: "0",
  });

  const [txForm, setTxForm] = useState({
    bank_account_id: "",
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
        fetch("/api/finance/bank-accounts"),
        fetch("/api/finance/bank-transactions?limit=50"),
      ]);

      const aData = await aRes.json();
      const tData = await tRes.json();

      const accList = aData.data || aData.accounts || [];
      const txList = tData.data || tData.transactions || [];

      setAccounts(accList);
      setTransactions(txList);

      if (accList.length > 0) {
        setTxForm((p) => (p.bank_account_id ? p : { ...p, bank_account_id: accList[0].id.toString() }));
      }
    } catch {
      toast("error", "Gagal memuat data rekening bank");
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
    if (!accountForm.bank_name.trim()) errs.bank_name = "Nama bank wajib diisi";
    if (!accountForm.account_number.trim()) errs.account_number = "Nomor rekening wajib diisi";
    setAccountErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/finance/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: accountForm.code.trim(),
          bank_name: accountForm.bank_name.trim(),
          account_number: accountForm.account_number.trim(),
          account_name: accountForm.account_name.trim() || null,
          currency_code: accountForm.currency_code,
          opening_balance: Number(accountForm.opening_balance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat rekening bank");

      toast("success", "Rekening bank baru berhasil didaftarkan");
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
    if (!txForm.bank_account_id) errs.bank_account_id = "Pilih rekening bank";
    if (isNaN(Number(txForm.amount)) || Number(txForm.amount) <= 0) errs.amount = "Nominal harus > 0";
    if (!txForm.transaction_date) errs.transaction_date = "Tanggal transaksi wajib diisi";
    setTxErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/finance/bank-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: Number(txForm.bank_account_id),
          transaction_type: txForm.transaction_type,
          amount: Number(txForm.amount),
          transaction_date: txForm.transaction_date,
          description: txForm.description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencatat mutasi bank");

      toast("success", "Mutasi bank berhasil dibukukan");
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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rekening Bank (Bank Management)</h1>
            <Badge variant="outline" className="text-xs">Keuangan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manajemen rekening giro/tabungan dan pencatatan mutasi kredit/debit bank perusahaan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={transactions.map((t) => ({
              tanggal: t.transaction_date,
              bank: t.bank_name ?? "",
              tipe: t.transaction_type === "in" ? "Masuk" : t.transaction_type === "out" ? "Keluar" : "Transfer",
              nominal: t.amount,
              keterangan: t.description ?? "",
              status: t.status,
            }))}
            columns={[
              { header: "Tanggal", key: "tanggal", align: "left" },
              { header: "Nama Bank", key: "bank", align: "left" },
              { header: "Tipe", key: "tipe", align: "center" },
              { header: "Nominal", key: "nominal", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Keterangan", key: "keterangan", align: "left" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="mutasi_bank"
            title="Laporan Mutasi Rekening Bank"
            subtitle="Transaksi penerimaan & pengeluaran bank — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccountDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Rekening Bank
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setTxDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Catat Mutasi Bank
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Total Saldo Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(totalBalance)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{accounts.length} rekening bank aktif</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Penerimaan / Kredit Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{formatCurrency(totalIn)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total mutasi dana masuk</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Pengeluaran / Debit Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 font-mono">{formatCurrency(totalOut)}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total transfer keluar</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts & Transactions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              Daftar Rekening Bank
            </CardTitle>
            <CardDescription className="text-xs">Rekening resmi terhubung dengan pembukuan.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada rekening bank terdaftar.</div>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div key={acc.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 text-xs">{acc.bank_name}</p>
                      <p className="text-[11px] font-mono text-slate-600">{acc.account_number || "-"}</p>
                      <p className="text-[10px] text-slate-400">{acc.account_name || acc.code}</p>
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
              Riwayat Mutasi Transaksi Bank
            </CardTitle>
            <CardDescription className="text-xs">Catatan mutasi rekening koran dan transfer.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada mutasi transaksi bank.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Bank</TableHead>
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
                        <TableCell className="font-medium text-slate-900">{tx.bank_name || "-"}</TableCell>
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
        <DialogHeader title="Tambah Rekening Bank Baru" description="Pendaftaran rekening bank resmi perusahaan" onClose={() => setAccountDialogOpen(false)} />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kode Akun" required error={accountErrors.code}>
              <Input value={accountForm.code} onChange={(e) => setAccountForm((p) => ({ ...p, code: e.target.value }))} />
            </FormField>
            <FormField label="Nama Bank" required error={accountErrors.bank_name}>
              <Input placeholder="BCA, Mandiri, BNI..." value={accountForm.bank_name} onChange={(e) => setAccountForm((p) => ({ ...p, bank_name: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Nomor Rekening" required error={accountErrors.account_number}>
            <Input placeholder="Mis. 8820-123456" value={accountForm.account_number} onChange={(e) => setAccountForm((p) => ({ ...p, account_number: e.target.value }))} />
          </FormField>
          <FormField label="Nama Pemilik Rekening / Atas Nama">
            <Input placeholder="PT Contoh Manajemen" value={accountForm.account_name} onChange={(e) => setAccountForm((p) => ({ ...p, account_name: e.target.value }))} />
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
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Tambah Rekening"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Record Transaction Dialog */}
      <Dialog open={txDialogOpen} onClose={() => setTxDialogOpen(false)} className="max-w-md">
        <DialogHeader title="Catat Mutasi Rekening Bank" description="Pencatatan transfer dana masuk atau keluar rekening" onClose={() => setTxDialogOpen(false)} />
        <div className="space-y-4">
          <FormField label="Rekening Bank" required error={txErrors.bank_account_id}>
            <Select value={txForm.bank_account_id} onChange={(e) => setTxForm((p) => ({ ...p, bank_account_id: e.target.value }))}>
              <option value="">-- Pilih Rekening Bank --</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.bank_name} - {a.account_number || a.code}</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipe Mutasi">
              <Select value={txForm.transaction_type} onChange={(e) => setTxForm((p) => ({ ...p, transaction_type: e.target.value as "in" | "out" }))}>
                <option value="in">Kredit / Dana Masuk</option>
                <option value="out">Debit / Transfer Keluar</option>
              </Select>
            </FormField>
            <FormField label="Tanggal" required error={txErrors.transaction_date}>
              <Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm((p) => ({ ...p, transaction_date: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Nominal (Rp)" required error={txErrors.amount}>
            <Input type="number" min="1" placeholder="0" value={txForm.amount} onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value }))} />
          </FormField>
          <FormField label="Keterangan Mutasi">
            <Textarea placeholder="Nomor referensi bukti transfer / keterangan..." value={txForm.description} onChange={(e) => setTxForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setTxDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleRecordTx} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Bukukan Mutasi"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
