import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, UserCheck, Calendar, Activity } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listAuditLogs } from "@/services/audit-service";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const session = await getServerSession();
  const auditLogs = await listAuditLogs(session, { page: 1, limit: 30 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pusat Audit Trail & Keamanan
            </h1>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
              Immutable Records
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Log aktivitas sensitif (*CREATE, UPDATE, APPROVE, POST, CANCEL, REVERSE*) dengan jejak user, timestamp, dan nilai sebelum/sesudah.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Total Catatan Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {auditLogs.pagination.total}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Catatan historis seluruh mutasi sistem
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Kontrol Otorisasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 font-mono">
              RBAC Active
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">
              Super Admin, Owner, Auditor
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-normal flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-600" /> Status Integritas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 font-mono">
              SECURE
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Anti-Tampering & Read-Only
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            Jejak Riwayat Audit Terakhir
          </CardTitle>
          <CardDescription className="text-xs">
            Daftar kronologis mutasi sensitif yang tercatat secara otomatis oleh sistem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Waktu</TableHead>
                  <TableHead>Pengguna</TableHead>
                  <TableHead>Aksi (Action)</TableHead>
                  <TableHead>Modul / Entitas</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Detail Perubahan (New Values)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.data.map((log) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {log.user_name || log.username || `User #${log.user_id}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-slate-700">
                      {log.table_name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-slate-500">
                      {log.record_id ? `#${log.record_id}` : "-"}
                    </TableCell>
                    <TableCell className="max-w-md truncate font-mono text-[11px] text-slate-600">
                      {log.new_values || log.old_values || "-"}
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
