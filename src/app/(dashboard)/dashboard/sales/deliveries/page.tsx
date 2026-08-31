import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Plus } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listDeliveries } from "@/services/delivery-service";
import { ExportButtons } from "@/components/ui/export-buttons";
import { PrintInvoiceButton } from "@/components/ui/print-invoice-button";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const session = await getServerSession();
  const { data: deliveries } = await listDeliveries(session, { limit: 50 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pengiriman Barang / Surat Jalan (Delivery Order)
            </h1>
            <Badge variant="outline" className="text-xs">Logistik & Sales</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan pengeluaran fisik barang dari gudang kepada pelanggan yang mengurangi saldo stok inventaris.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButtons
            rows={deliveries.map((d) => ({
              nomor_sj: d.delivery_no,
              tanggal: new Date(d.delivery_date).toLocaleDateString("id-ID"),
              gudang: d.warehouse_name || "-",
              nomor_so: d.order_no || "-",
              pelanggan: d.customer_name || "-",
              status: d.status.toUpperCase(),
            }))}
            columns={[
              { header: "Nomor SJ", key: "nomor_sj" },
              { header: "Tanggal", key: "tanggal" },
              { header: "Gudang Asal", key: "gudang" },
              { header: "Nomor SO", key: "nomor_so" },
              { header: "Pelanggan", key: "pelanggan" },
              { header: "Status", key: "status", align: "center" },
            ]}
            filename="surat_jalan_pengiriman"
            title="Daftar Surat Jalan (Delivery Order)"
            subtitle="Daftar pengiriman barang ke pelanggan — SILETE"
          />
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buat Surat Jalan
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              Daftar Surat Jalan Pengiriman
            </CardTitle>
            <Badge variant="secondary" className="text-xs font-mono">
              {deliveries.length} Dokumen
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Posting surat jalan akan memotong kuantitas stok gudang secara otomatis dan atomik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Belum ada dokumen pengiriman untuk perusahaan aktif ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Nomor Surat Jalan</TableHead>
                    <TableHead>Tanggal Kirim</TableHead>
                    <TableHead>Gudang Asal</TableHead>
                    <TableHead>Nomor SO</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {row.delivery_no}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(row.delivery_date).toLocaleDateString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">
                        {row.warehouse_name}
                      </TableCell>
                      <TableCell className="font-mono text-slate-600">
                        {row.order_no || "-"}
                      </TableCell>
                      <TableCell className="text-slate-800">
                        {row.customer_name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.status === "posted" ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                            POSTED / TERKIRIM
                          </Badge>
                        ) : row.status === "draft" ? (
                          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                            DRAFT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            CANCELLED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <PrintInvoiceButton invoice={{
                          ...row,
                          invoice_no: row.delivery_no,
                          invoice_date: row.delivery_date,
                          total_amount: 0,
                          items: []
                        }} />
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
