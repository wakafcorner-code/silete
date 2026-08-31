import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, Scale, CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listJournalEntries } from "@/services/accounting-service";
import { formatCurrency } from "@/lib/utils";
import { JournalsExport } from "./export";

export const dynamic = "force-dynamic";

export default async function JournalEntriesPage() {
  const session = await getServerSession();
  const { data: journals, pagination } = await listJournalEntries(session, { limit: 50 });

  const totalDebit = journals.reduce((s, j) => s + Number(j.total_debit || 0), 0);
  const totalCredit = journals.reduce((s, j) => s + Number(j.total_credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Jurnal Umum (Journal Entries)
            </h1>
            <Badge variant="outline" className="text-xs">Accounting Engine</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Buku catatan transaksi keuangan berpasangan (Double-Entry). Semua jurnal posted bersifat immutable.
          </p>
        </div>
        <JournalsExport journals={journals} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">Total Debit Terposting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(totalDebit)}</div>
            <p className="text-[10px] text-slate-400 mt-1">SUM(Debit) Jurnal Aktif</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal">Total Credit Terposting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">{formatCurrency(totalCredit)}</div>
            <p className="text-[10px] text-slate-400 mt-1">SUM(Credit) Jurnal Aktif</p>
          </CardContent>
        </Card>
        <Card className={isBalanced ? "border-emerald-200 bg-emerald-50/20" : "border-rose-200 bg-rose-50/20"}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" /> Status Keseimbangan (Invariant)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-base font-bold flex items-center gap-1.5 ${isBalanced ? "text-emerald-700" : "text-rose-700"}`}>
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-5 h-5" /> SEIMBANG (DEBIT = CREDIT)
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" /> TIDAK SEIMBANG
                </>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Total {pagination.total} dokumen jurnal</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Daftar Entri Jurnal Keuangan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {journals.length} Jurnal
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Jurnal berstatus POSTED terkunci dan hanya dapat dikoreksi melalui mekanisme Reversal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {journals.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada entri jurnal dalam periode aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Jurnal</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Sumber Dokumen</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Total Debit</TableHead>
                    <TableHead className="text-right">Total Credit</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journals.map((j) => (
                    <TableRow key={j.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {j.journal_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(j.journal_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        {j.source_type ? (
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-700">
                            {j.source_type} #{j.source_id}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">MANUAL</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 max-w-[200px] truncate">
                        {j.description || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-900 font-semibold">
                        {formatCurrency(Number(j.total_debit || 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-900 font-semibold">
                        {formatCurrency(Number(j.total_credit || 0))}
                      </TableCell>
                      <TableCell className="text-center">
                        {j.status === "posted" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            POSTED
                          </Badge>
                        ) : j.status === "reversed" ? (
                          <Badge variant="outline" className="text-[10px] text-purple-700 bg-purple-50 border-purple-200 gap-1">
                            <RotateCcw className="w-3 h-3" /> REVERSED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-600">
                            DRAFT
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
