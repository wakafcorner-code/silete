import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { getTrialBalanceReport } from "@/services/accounting-service";
import { formatCurrency } from "@/lib/utils";
import { TrialBalanceExport } from "./export";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage() {
  const session = await getServerSession();
  const report = await getTrialBalanceReport(session);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Neraca Saldo (Trial Balance)
            </h1>
            <Badge variant="outline" className="text-xs">Laporan Keuangan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rekapitulasi saldo akhir seluruh akun Chart of Accounts per tanggal {report.as_of_date}.
          </p>
        </div>
        <TrialBalanceExport
          rows={report.rows}
          asOfDate={report.as_of_date}
          totalDebit={report.total_debit}
          totalCredit={report.total_credit}
        />
      </div>


      {/* Balance Verification Card */}
      <Card className={report.is_balanced ? "border-emerald-200 bg-emerald-50/20" : "border-rose-200 bg-rose-50/20"}>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {report.is_balanced ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {report.is_balanced
                  ? "TRIAL BALANCE SEIMBANG (CORE INVARIANT DIPENUHI)"
                  : "PERINGATAN: TRIAL BALANCE TIDAK SEIMBANG"}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Total Debit: <span className="font-mono font-semibold text-slate-800">{formatCurrency(report.total_debit)}</span> | Total Credit: <span className="font-mono font-semibold text-slate-800">{formatCurrency(report.total_credit)}</span>
              </div>
            </div>
          </div>
          <Badge
            variant={report.is_balanced ? "secondary" : "destructive"}
            className="text-xs font-mono py-1 px-3"
          >
            {report.is_balanced ? "DEBIT = CREDIT" : "UNBALANCED"}
          </Badge>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Daftar Akun & Mutasi Saldo
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {report.rows.length} Akun
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Menampilkan pergerakan debit, credit, serta saldo akhir sesuai saldo normal masing-masing akun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Kode Akun</TableHead>
                  <TableHead>Nama Akun</TableHead>
                  <TableHead>Tipe Akun</TableHead>
                  <TableHead className="text-center">Saldo Normal</TableHead>
                  <TableHead className="text-right">Mutasi Debit</TableHead>
                  <TableHead className="text-right">Mutasi Credit</TableHead>
                  <TableHead className="text-right">Saldo Akhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.account_id} className="text-xs">
                    <TableCell className="font-mono font-semibold text-slate-900">
                      {row.account_code}
                    </TableCell>
                    <TableCell className="text-slate-800 font-medium">
                      {row.account_name}
                    </TableCell>
                    <TableCell>
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-700 uppercase">
                        {row.account_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-[10px] uppercase text-slate-500">
                      {row.normal_balance}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {formatCurrency(row.debit_total)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {formatCurrency(row.credit_total)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(row.ending_balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
