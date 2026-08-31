import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, AlertCircle, Clock } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listPayables, getAPAgingReport } from "@/services/payment-service";
import { formatCurrency } from "@/lib/utils";
import { PayablesExport } from "./export";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const session = await getServerSession();
  const { data: payables } = await listPayables(session, { limit: 50 });
  const aging = await getAPAgingReport(session);

  const totalOutstanding = aging.total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Hutang Usaha (Accounts Payable)
            </h1>
            <Badge variant="outline" className="text-xs">Keuangan & AP</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Buku besar kewajiban hutang kepada pemasok beserta jadwal jatuh tempo, aging analysis, dan sisa saldo kewajiban.
          </p>
        </div>
        <PayablesExport payables={payables} />
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
        <Card className="border-rose-200 bg-rose-50/30">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-rose-700 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Total Hutang
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-base font-bold text-rose-900 font-mono">{formatCurrency(totalOutstanding)}</div>
            <p className="text-[10px] text-rose-600 font-medium">Outstanding</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-600" />
              Daftar Tagihan Hutang Berjalan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {payables.length} Tagihan
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Alokasi pembayaran hutang tidak boleh melebihi sisa saldo terutang (Outstanding Balance).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payables.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada catatan hutang usaha untuk perusahaan aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Supplier</TableHead>
                    <TableHead>Nomor Faktur</TableHead>
                    <TableHead>Tanggal Faktur</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead className="text-right">Nominal Tagihan</TableHead>
                    <TableHead className="text-right">Sudah Dibayar</TableHead>
                    <TableHead className="text-right">Sisa Hutang</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables.map((row) => {
                    const orig = Number(row.original_amount);
                    const paid = Number(row.paid_amount);
                    const bal = Number(row.balance_amount);

                    return (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="font-medium text-slate-900">
                          <div>{row.supplier_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{row.supplier_code}</div>
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
                        <TableCell className="text-right font-mono font-semibold text-rose-600">
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
