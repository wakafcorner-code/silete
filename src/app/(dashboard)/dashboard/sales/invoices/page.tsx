import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCheck, Plus } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listCustomerInvoices } from "@/services/customer-invoice-service";
import { formatCurrency } from "@/lib/utils";
import { ExportButtons } from "@/components/ui/export-buttons";
import { PrintInvoiceButton } from "@/components/ui/print-invoice-button";

export const dynamic = "force-dynamic";

export default async function CustomerInvoicesPage() {
  const session = await getServerSession();
  const { data: invoices } = await listCustomerInvoices(session, { limit: 50 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Faktur Penjualan (Customer Invoice)
            </h1>
            <Badge variant="outline" className="text-xs">Sales & Finance</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Penagihan faktur resmi kepada pelanggan yang diposting untuk membentuk hak Piutang Usaha (AR).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={invoices.map((invoice) => ({
              nomor_faktur: invoice.invoice_no,
              tanggal: invoice.invoice_date,
              jatuh_tempo: invoice.due_date ?? "-",
              pelanggan: invoice.customer_name,
              total: formatCurrency(invoice.total_amount),
              status: invoice.status,
            }))}
            columns={[
              { header: "Nomor Faktur", key: "nomor_faktur" },
              { header: "Tanggal", key: "tanggal" },
              { header: "Jatuh Tempo", key: "jatuh_tempo" },
              { header: "Pelanggan", key: "pelanggan" },
              { header: "Total", key: "total", align: "right" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="faktur_penjualan"
            title="Faktur Penjualan"
            subtitle="Daftar invoice penjualan — SILETE"
          />
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Faktur Penjualan
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-purple-600" />
              Daftar Faktur Penjualan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {invoices.length} Faktur
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Posting faktur penjualan akan otomatis membentuk data Piutang Usaha (Accounts Receivable).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada faktur penjualan untuk perusahaan aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Faktur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-right">Total Tagihan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((row) => {
                    const total = Number(row.total_amount);

                    return (
                      <TableRow key={row.id} className="text-xs">
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
                          {row.customer_name}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-slate-900">
                          {formatCurrency(total)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.status === "posted" ? (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              POSTED / AR
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
    </div>
  );
}
