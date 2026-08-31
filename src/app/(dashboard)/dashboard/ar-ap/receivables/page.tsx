import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, AlertCircle, Clock } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listReceivables, getARAgingReport } from "@/services/payment-service";
import { formatCurrency } from "@/lib/utils";
import { ReceivablesExport } from "./export";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const session = await getServerSession();
  const { data: receivables } = await listReceivables(session, { limit: 50 });
  const aging = await getARAgingReport(session);

  const totalOutstanding = aging.total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Piutang Usaha (Accounts Receivable)
            </h1>
            <Badge variant="outline" className="text-xs">Keuangan & AR</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Buku besar tagihan kepada pelanggan beserta jadwal jatuh tempo, aging analysis, dan sisa saldo piutang.
          </p>
        </div>
        <ReceivablesExport receivables={receivables} />
      </div>

      {/* Aging Analysis Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-slate-200">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">Belum Jatuh Tempo</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-emerald-600 font-mono">{formatCurrency(aging.not_due)}</div>
            <p className="text-[10px] text-slate-400">Current</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">1 - 30 Hari</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-amber-600 font-mono">{formatCurrency(aging.days_1_30)}</div>
            <p className="text-[10px] text-slate-400">Aging</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">31 - 60 Hari</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-orange-600 font-mono">{formatCurrency(aging.days_31_60)}</div>
            <p className="text-[10px] text-slate-400">Aging</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">61 - 90 Hari</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-rose-600 font-mono">{formatCurrency(aging.days_61_90)}</div>
            <p className="text-[10px] text-slate-400">Aging</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">&gt; 90 Hari</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-red-700 font-mono">{formatCurrency(aging.over_90)}</div>
            <p className="text-[10px] text-slate-400">Critical</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-blue-700 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Total Piutang
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-blue-900 font-mono">{formatCurrency(totalOutstanding)}</div>
            <p className="text-[10px] text-blue-600 font-medium">Outstanding</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              Daftar Tagihan Piutang Berjalan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {receivables.length} Tagihan
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Alokasi pembayaran dari pelanggan akan memotong saldo terutang secara otomatis tanpa boleh menghasilkan saldo negatif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada catatan piutang usaha untuk perusahaan aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Nomor Faktur</TableHead>
                    <TableHead>Tanggal Faktur</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead className="text-right">Nominal Tagihan</TableHead>
                    <TableHead className="text-right">Sudah Diterima</TableHead>
                    <TableHead className="text-right">Sisa Piutang</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.map((row) => {
                    const orig = Number(row.original_amount);
                    const paid = Number(row.paid_amount);
                    const bal = Number(row.balance_amount);

                    return (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="font-medium text-slate-900">
                          <div>{row.customer_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{row.customer_code}</div>
                        </TableCell>
                        <TableCell className="font-mono text-slate-700">
                          {row.invoice_no || "-"}
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
                        <TableCell className="text-right font-mono text-slate-700">
                          {formatCurrency(orig)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {formatCurrency(paid)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-blue-600">
                          {formatCurrency(bal)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.status === "open" ? (
                            <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200 gap-1">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              BELUM BAYAR
                            </Badge>
                          ) : row.status === "partial" ? (
                            <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                              SEBAGIAN
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                              LUNAS
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
