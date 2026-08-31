import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { getGeneralLedgerReport } from "@/services/accounting-service";
import { formatCurrency } from "@/lib/utils";
import { GeneralLedgerExport } from "./export";

export const dynamic = "force-dynamic";

export default async function GeneralLedgerPage() {
  const session = await getServerSession();
  const entries = await getGeneralLedgerReport(session);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Buku Besar (General Ledger)
            </h1>
            <Badge variant="outline" className="text-xs">Accounting Engine</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rincian mutasi debit dan credit seluruh akun secara kronologis yang dihasilkan dari posting jurnal.
          </p>
        </div>
        <GeneralLedgerExport entries={entries} />
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Catatan Mutasi Buku Besar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {entries.length} Mutasi
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Setiap mutasi terhubung secara langsung dengan nomor jurnal dan kode akun terkait.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada mutasi buku besar tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Tanggal Posting</TableHead>
                    <TableHead>Nomor Jurnal</TableHead>
                    <TableHead>Akun</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="text-xs">
                      <TableCell className="text-slate-600">
                        {new Date(entry.posting_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {entry.journal_no}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-semibold text-slate-900 mr-1.5">
                          {entry.account_code}
                        </span>
                        <span className="text-slate-700">{entry.account_name}</span>
                      </TableCell>
                      <TableCell className="text-slate-600 max-w-[200px] truncate">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-800">
                        {Number(entry.debit) > 0 ? formatCurrency(Number(entry.debit)) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-800">
                        {Number(entry.credit) > 0 ? formatCurrency(Number(entry.credit)) : "-"}
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
