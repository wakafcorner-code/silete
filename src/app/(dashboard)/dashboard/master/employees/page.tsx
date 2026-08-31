import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserCheck, Plus, Building } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listEmployees } from "@/services/employee-service";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await getServerSession();
  const { data: employees } = await listEmployees(session, { limit: 50 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Master Karyawan (Employees)
            </h1>
            <Badge variant="outline" className="text-xs">Master Data</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Daftar staf, penempatan cabang, dan jabatan per perusahaan aktif.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Tambah Karyawan
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-600" />
              Daftar Karyawan Terdaftar
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {employees.length} Karyawan
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Data identitas staf, jabatan, penempatan cabang, dan status kepegawaian.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada data karyawan terdaftar pada perusahaan aktif ini.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIK / Kode</TableHead>
                  <TableHead>Nama Karyawan</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Email / Kontak</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs font-semibold">{e.employee_code}</TableCell>
                    <TableCell className="font-medium text-slate-900">{e.name}</TableCell>
                    <TableCell className="text-xs text-slate-700">{e.position || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {e.branch_name ? (
                        <span className="inline-flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          {e.branch_name}
                        </span>
                      ) : (
                        "Pusat"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {e.email || e.phone || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={e.status === "active" ? "success" : "secondary"}>
                        {e.status === "active" ? "Aktif" : "Non-Aktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
