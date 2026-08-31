import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListTree } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listAccounts } from "@/services/accounting-service";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getServerSession();
  const accounts = await listAccounts(session);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Bagan Akun (Chart of Accounts)
            </h1>
            <Badge variant="outline" className="text-xs">Master Keuangan</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Struktur klasifikasi akun keuangan berstandar akuntansi untuk pencatatan transaksi perusahaan.
          </p>
        </div>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ListTree className="w-4 h-4 text-emerald-600" />
              Daftar Bagan Akun Perusahaan
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {accounts.length} Akun
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Klasifikasi mencakup Aset, Kewajiban/Hutang, Ekuitas/Modal, Pendapatan, dan Beban Operasional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada bagan akun yang dikonfigurasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Kode Akun</TableHead>
                    <TableHead>Nama Akun</TableHead>
                    <TableHead>Klasifikasi</TableHead>
                    <TableHead className="text-center">Saldo Normal</TableHead>
                    <TableHead className="text-center">Tipe Kontrol</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acct) => (
                    <TableRow key={acct.id} className="text-xs">
                      <TableCell className="font-mono font-bold text-slate-900">
                        {acct.code}
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">
                        {acct.name}
                      </TableCell>
                      <TableCell>
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-700 uppercase">
                          {acct.account_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-[10px] uppercase text-slate-600">
                        {acct.normal_balance}
                      </TableCell>
                      <TableCell className="text-center">
                        {acct.is_control_account ? (
                          <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                            CONTROL
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={acct.status === "active" ? "secondary" : "outline"}
                          className={`text-[10px] ${
                            acct.status === "active"
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                              : "text-slate-500"
                          }`}
                        >
                          {acct.status.toUpperCase()}
                        </Badge>
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
