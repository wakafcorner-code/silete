import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, Scale, TrendingUp, Sparkles, Building2 } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import {
  getConsolidatedTrialBalance,
  getConsolidatedIncomeStatement,
  getConsolidatedBalanceSheet,
} from "@/services/consolidation-service";
import { formatCurrency } from "@/lib/utils";
import { ConsolidationExport } from "./export";

export const dynamic = "force-dynamic";

export default async function ConsolidationPage() {
  const session = await getServerSession();
  const trialBalance = await getConsolidatedTrialBalance(session);
  const incomeStatement = await getConsolidatedIncomeStatement(session);
  const balanceSheet = await getConsolidatedBalanceSheet(session);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Laporan Keuangan Konsolidasi (Consolidation)
            </h1>
            <Badge variant="outline" className="text-xs">Grup Perusahaan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Penggabungan laporan keuangan Company A & B dengan eliminasi otomatis saldo dan transaksi timbal balik (*Intercompany Eliminations*).
          </p>
        </div>
        <ConsolidationExport rows={trialBalance.rows} />
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Pendapatan Konsolidasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrency(incomeStatement.revenue.consolidated)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Unadjusted: {formatCurrency(incomeStatement.revenue.unadjusted_total)} (Eliminasi: -{formatCurrency(incomeStatement.revenue.eliminated)})
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Laba Bersih Konsolidasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 font-mono">
              {formatCurrency(incomeStatement.net_income.consolidated)}
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">
              Beban Konsolidasi: {formatCurrency(incomeStatement.expense.consolidated)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-purple-600" /> Total Aset Konsolidasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 font-mono">
              {formatCurrency(balanceSheet.total_assets)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Eliminasi Piutang/Hutang IC: {formatCurrency(balanceSheet.assets.eliminated)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Intercompany Eliminations Audit Trail */}
      <Card className="border-amber-200 bg-amber-50/20 shadow-2xs">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-600" />
              Daftar Penyesuaian & Eliminasi Antar Entitas (Intercompany Eliminations)
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono text-amber-800 bg-amber-50">
              {incomeStatement.eliminations.length + balanceSheet.eliminations.length} Penyesuaian
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Menghilangkan efek pendapatan/beban dan piutang/hutang internal agar tidak terjadi pencatatan ganda pada laporan grup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Tipe Eliminasi</TableHead>
                  <TableHead>Akun Tereliminasi</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-right">Eliminasi Debit</TableHead>
                  <TableHead className="text-right">Eliminasi Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...incomeStatement.eliminations, ...balanceSheet.eliminations].map((elim, idx) => (
                  <TableRow key={idx} className="text-xs">
                    <TableCell className="font-mono font-medium text-slate-900">
                      {elim.elimination_type === "receivable_payable" ? "PIUTANG / HUTANG IC" : "PENDAPATAN / BEBAN IC"}
                    </TableCell>
                    <TableCell className="font-mono text-slate-700">
                      {elim.account_code} - {elim.account_name}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {elim.description}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-900 font-semibold">
                      {formatCurrency(elim.eliminated_debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-900 font-semibold">
                      {formatCurrency(elim.eliminated_credit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Consolidated Trial Balance Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Kertas Kerja Neraca Saldo Konsolidasi (Consolidated Working Paper)
            </CardTitle>
            <Badge variant={trialBalance.is_balanced ? "secondary" : "destructive"} className="text-xs font-mono">
              {trialBalance.is_balanced ? "DEBIT = CREDIT" : "UNBALANCED"}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Memperlihatkan saldo berdiri sendiri (*standalone*) tiap entitas, jurnal eliminasi, dan saldo akhir konsolidasi grup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama Akun</TableHead>
                  <TableHead className="text-right">Company A (PT A)</TableHead>
                  <TableHead className="text-right">Company B (PT B)</TableHead>
                  <TableHead className="text-right">Total Gabungan</TableHead>
                  <TableHead className="text-right text-amber-700">Eliminasi Dr</TableHead>
                  <TableHead className="text-right text-amber-700">Eliminasi Cr</TableHead>
                  <TableHead className="text-right font-bold">Konsolidasi Grup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialBalance.rows.map((row) => (
                  <TableRow key={row.account_code} className="text-xs">
                    <TableCell className="font-mono font-bold text-slate-900">
                      {row.account_code}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {row.account_name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {formatCurrency(row.company_balances[1] || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {formatCurrency(row.company_balances[2] || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-500">
                      {formatCurrency(row.unadjusted_total)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-700">
                      {row.elimination_debit > 0 ? formatCurrency(row.elimination_debit) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-700">
                      {row.elimination_credit > 0 ? formatCurrency(row.elimination_credit) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-900">
                      {formatCurrency(row.consolidated_balance)}
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
