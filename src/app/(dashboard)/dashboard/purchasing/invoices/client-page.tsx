"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Plus, RefreshCw, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ExportButtons } from "@/components/ui/export-buttons";
import { PrintInvoiceButton } from "@/components/ui/print-invoice-button";
import { SupplierInvoiceDialog } from "@/components/purchasing/supplier-invoice-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function SupplierInvoicesClient({ initialData }: { initialData: any[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preSelectedGrn, setPreSelectedGrn] = useState<string | null>(null);
  const [preSelectedPo, setPreSelectedPo] = useState<string | null>(null);

  useEffect(() => {
    const grnId = searchParams.get("grnId");
    const poId = searchParams.get("poId");

    if (grnId) {
      setPreSelectedGrn(grnId);
      setDialogOpen(true);
      router.replace("/dashboard/purchasing/invoices", { scroll: false });
    } else if (poId) {
      setPreSelectedPo(poId);
      setDialogOpen(true);
      router.replace("/dashboard/purchasing/invoices", { scroll: false });
    }
  }, [searchParams, router]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/silete/api/purchasing/invoices?limit=50");
      const data = await res.json();
      if (data.success) setInvoices(data.data || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Faktur Pembelian (Supplier Invoice)
            </h1>
            <Badge variant="outline" className="text-xs">Purchasing</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Penagihan faktur dari supplier yang diposting untuk membentuk kewajiban Hutang Usaha (AP).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={invoices.map((invoice) => ({
              nomor_faktur: invoice.invoice_no,
              tanggal: new Date(invoice.invoice_date).toLocaleDateString("id-ID"),
              jatuh_tempo: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("id-ID") : "-",
              supplier: invoice.supplier_name,
              total: formatCurrency(invoice.total_amount),
              status: invoice.status.toUpperCase(),
            }))}
            columns={[
              { header: "Nomor Faktur", key: "nomor_faktur" },
              { header: "Tanggal", key: "tanggal" },
              { header: "Jatuh Tempo", key: "jatuh_tempo" },
              { header: "Supplier", key: "supplier" },
              { header: "Total", key: "total", align: "right" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="faktur_pembelian"
            title="Faktur Pembelian"
            subtitle="Daftar invoice pembelian ke mitra — SILETE"
          />
          <Button variant="outline" size="sm" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Catat Faktur Pembelian
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              Daftar Faktur Tagihan Supplier
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {invoices.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Posting faktur secara otomatis membuat catatan Hutang Usaha (Accounts Payable) aktif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada faktur pembelian untuk perusahaan aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Faktur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Total Tagihan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((row) => {
                    const total = Number(row.total_amount);

                    return (
                      <TableRow key={row.id} className="text-xs transition-colors hover:bg-slate-50 cursor-default">
                        <TableCell className="font-mono font-semibold text-slate-900">
                          {row.invoice_no}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {new Date(row.invoice_date).toLocaleDateString("id-ID", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {row.due_date ? new Date(row.due_date).toLocaleDateString("id-ID", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "-"}
                        </TableCell>
                        <TableCell className="font-medium text-slate-800">
                          {row.supplier_name}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-slate-900">
                          {formatCurrency(total)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.status === "posted" ? (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              POSTED / AP
                            </Badge>
                          ) : row.status === "paid" ? (
                            <Badge variant="secondary" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                              LUNAS
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
                          <PrintInvoiceButton invoice={{
                            ...row,
                            subtotal: row.subtotal || row.total_amount,
                            tax_amount: row.tax_amount || 0
                          }} />
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

      <SupplierInvoiceDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setPreSelectedGrn(null); setPreSelectedPo(null); }}
        onSuccess={refreshData}
        initialGrnId={preSelectedGrn}
        initialPoId={preSelectedPo}
      />
    </div>
  );
}
