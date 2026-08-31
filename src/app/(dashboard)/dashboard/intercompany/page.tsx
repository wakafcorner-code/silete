import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeftRight, CheckCircle2, ArrowRight } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listIntercompanyTransactions, getIntercompanyReconciliation } from "@/services/intercompany-service";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IntercompanyPage() {
  const session = await getServerSession();
  const { data: transactions, pagination } = await listIntercompanyTransactions(session, { limit: 50 });
  const reconciliation = await getIntercompanyReconciliation(session, 1, 2);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Transaksi Antar Perusahaan (Intercompany)
            </h1>
            <Badge variant="outline" className="text-xs">Multi-Company</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan transaksi bilateral atomik antara Company A dan Company B beserta rekonsiliasi saldo piutang/hutang.
          </p>
        </div>
      </div>

      {/* Reconciliation Card */}
      <Card className={reconciliation.is_reconciled ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/20"}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
              Status Rekonsiliasi Intercompany (PT A ↔ PT B)
            </CardTitle>
            <Badge
              variant={reconciliation.is_reconciled ? "secondary" : "outline"}
              className={`text-xs font-mono ${
                reconciliation.is_reconciled ? "text-emerald-700 bg-emerald-50" : "text-amber-700"
              }`}
            >
              {reconciliation.is_reconciled ? "RECONCILED" : "DIFFERENCE DETECTED"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500">Piutang Intercompany (Company A)</div>
              <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                {formatCurrency(reconciliation.source_receivable_total)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Saldo Buku Besar A</div>
            </div>
            <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500">Hutang Intercompany (Company B)</div>
              <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                {formatCurrency(reconciliation.destination_payable_total)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Saldo Buku Besar B</div>
            </div>
            <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500">Selisih (Difference)</div>
              <div className={`text-xl font-bold font-mono mt-1 ${reconciliation.difference === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {formatCurrency(reconciliation.difference)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {reconciliation.is_reconciled ? "Saldo Sempurna Seimbang" : "Perlu Penyesuaian"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
              Riwayat Transaksi Intercompany
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {pagination.total} Transaksi
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Setiap transaksi secara atomik memposting jurnal pada kedua belah pihak perusahaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada transaksi intercompany tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Transaksi</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Alur Entitas</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id} className="text-xs">
                      <TableCell className="font-mono font-bold text-slate-900">
                        {tx.transaction_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(tx.transaction_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-700">
                            {tx.source_company_name || `Company #${tx.source_company_id}`}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="px-1.5 py-0.5 bg-purple-50 border border-purple-200 rounded text-[10px] text-purple-700">
                            {tx.destination_company_name || `Company #${tx.destination_company_id}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-700 uppercase">
                          {tx.transaction_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 max-w-[200px] truncate">
                        {tx.description || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(Number(tx.amount))}
                      </TableCell>
                      <TableCell className="text-center">
                        {tx.status === "posted" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> POSTED
                          </Badge>
                        ) : tx.status === "settled" ? (
                          <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            SETTLED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-500">
                            {tx.status.toUpperCase()}
                          </Badge>
                        )}
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
  );
}
