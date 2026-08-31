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
import { CreditCard, Plus, Loader2, RefreshCw, Search, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Payment {
  id: number;
  payment_no: string;
  payment_type: "customer_receipt" | "supplier_payment" | "other_receipt" | "other_payment";
  payment_date: string;
  amount: string;
  cash_account_id?: number | null;
  bank_account_id?: number | null;
  status: "draft" | "posted" | "cancelled";
  reference?: string | null;
  notes?: string | null;
}

interface CashAccount {
  id: number;
  name: string;
  code: string;
}

interface BankAccount {
  id: number;
  bank_name: string;
  account_number?: string | null;
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    payment_no: "",
    payment_type: "customer_receipt" as Payment["payment_type"],
    payment_date: today,
    amount: "0",
    account_type: "cash" as "cash" | "bank",
    account_id: "",
    reference: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, bRes] = await Promise.all([
        fetch("api/payments?limit=100"),
        fetch("api/finance/cash-accounts"),
        fetch("api/finance/bank-accounts"),
      ]);

      const pData = await pRes.json();
      const cData = await cRes.json();
      const bData = await bRes.json();

      if (pData.success) setPayments(pData.data || pData.payments || []);
      if (cData.success) setCashAccounts(cData.data || cData.accounts || []);
      if (bData.success) setBankAccounts(bData.data || bData.accounts || []);
    } catch {
      toast("error", "Gagal memuat data pembayaran & alokasi");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setForm({
      payment_no: `PAY-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
      payment_type: "customer_receipt",
      payment_date: today,
      amount: "0",
      account_type: "cash",
      account_id: cashAccounts[0]?.id.toString() || "",
      reference: "",
      notes: "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.payment_no.trim()) errs.payment_no = "Nomor pembayaran wajib diisi";
    if (isNaN(Number(form.amount)) || Number(form.amount) <= 0) errs.amount = "Nominal harus > 0";
    if (!form.account_id) errs.account_id = "Pilih rekening kas/bank";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        payment_no: form.payment_no.trim(),
        payment_type: form.payment_type,
        payment_date: form.payment_date,
        amount: Number(form.amount),
        cash_account_id: form.account_type === "cash" ? Number(form.account_id) : null,
        bank_account_id: form.account_type === "bank" ? Number(form.account_id) : null,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = await fetch("api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencatat pembayaran");

      toast("success", "Pembayaran berhasil dicatat & masuk antrian alokasi");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast("error", "Gagal menyimpan", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.payment_no.toLowerCase().includes(q) ||
      (p.reference && p.reference.toLowerCase().includes(q)) ||
      (p.notes && p.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pembayaran & Alokasi (AR / AP Payments)
            </h1>
            <Badge variant="outline" className="text-xs">Keuangan & Kas</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan penerimaan pembayaran piutang pelanggan dan pelunasan hutang pemasok serta alokasi saldo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={filteredPayments.map((p) => ({
              no_pembayaran: p.payment_no,
              tanggal: p.payment_date,
              tipe: p.payment_type.replace("_", " "),
              nominal: p.amount,
              status: p.status,
              referensi: p.reference ?? "-",
              catatan: p.notes ?? "-",
            }))}
            columns={[
              { header: "No. Pembayaran", key: "no_pembayaran", align: "left" },
              { header: "Tanggal", key: "tanggal", align: "left" },
              { header: "Tipe Pembayaran", key: "tipe", align: "left" },
              { header: "Nominal", key: "nominal", align: "right", format: (v) => formatCurrency(v as string) },
              { header: "Status", key: "status", align: "center" },
              { header: "Referensi", key: "referensi", align: "left" },
              { header: "Catatan", key: "catatan", align: "left" },
            ]}
            filename="daftar_pembayaran_alokasi"
            title="Daftar Pembayaran & Alokasi AR/AP"
            subtitle="Pencatatan mutasi kas/bank untuk pelunasan tagihan — SILETE"
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Catat Pembayaran Baru
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Cari nomor pembayaran, referensi..."
          className="pl-8 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              Riwayat Pembayaran & Pelunasan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {filteredPayments.length} Pembayaran
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Daftar transaksi kas/bank yang telah dibukukan untuk pelunasan piutang maupun hutang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              {search ? `Tidak ada data dengan kata kunci "${search}"` : "Belum ada transaksi pembayaran tercatat."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Pembayaran</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        {p.payment_no}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(p.payment_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          {p.payment_type.includes("receipt") ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {p.payment_type === "customer_receipt"
                            ? "Terima Piutang (AR)"
                            : p.payment_type === "supplier_payment"
                            ? "Bayar Hutang (AP)"
                            : p.payment_type.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">
                        {p.reference || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === "posted" ? "success" : p.status === "cancelled" ? "destructive" : "secondary"}>
                          {p.status === "posted" ? "Posted" : p.status === "draft" ? "Draft" : "Dibatalkan"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                        {p.notes || "-"}
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-lg">
        <DialogHeader
          title="Catat Pembayaran Baru"
          description="Pencatatan pembayaran kas/bank untuk pelunasan tagihan piutang atau hutang."
          onClose={() => setDialogOpen(false)}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nomor Pembayaran" required error={errors.payment_no}>
              <Input
                placeholder="PAY-2026..."
                value={form.payment_no}
                onChange={(e) => setForm({ ...form, payment_no: e.target.value })}
              />
            </FormField>
            <FormField label="Tanggal Transaksi" required>
              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Tipe Pembayaran" required>
            <Select
              value={form.payment_type}
              onChange={(e) => setForm({ ...form, payment_type: e.target.value as Payment["payment_type"] })}
            >
              <option value="customer_receipt">Penerimaan Pembayaran Pelanggan (Customer Receipt - AR)</option>
              <option value="supplier_payment">Pembayaran Hutang Pemasok (Supplier Payment - AP)</option>
              <option value="other_receipt">Penerimaan Kas/Bank Lainnya (Other Receipt)</option>
              <option value="other_payment">Pengeluaran Kas/Bank Lainnya (Other Payment)</option>
            </Select>
          </FormField>

          <FormField label="Nominal Pembayaran (Rp)" required error={errors.amount}>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Metode Pembayaran">
              <Select
                value={form.account_type}
                onChange={(e) => {
                  const type = e.target.value as "cash" | "bank";
                  setForm({
                    ...form,
                    account_type: type,
                    account_id: type === "cash" ? cashAccounts[0]?.id.toString() || "" : bankAccounts[0]?.id.toString() || "",
                  });
                }}
              >
                <option value="cash">Kas Fisik</option>
                <option value="bank">Rekening Bank</option>
              </Select>
            </FormField>
            <FormField label="Rekening Akun" required error={errors.account_id}>
              <Select
                value={form.account_id}
                onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              >
                <option value="">Pilih Akun...</option>
                {form.account_type === "cash"
                  ? cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))
                  : bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} {b.account_number ? `(${b.account_number})` : ""}
                      </option>
                    ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Nomor Referensi / Bukti Transfer">
            <Input
              placeholder="Mis. TRF-BCA-981248"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </FormField>

          <FormField label="Catatan / Keterangan">
            <Textarea
              placeholder="Keterangan alokasi atau pelunasan tagihan..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan...</> : "Simpan Pembayaran"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
