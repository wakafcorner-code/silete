import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, ShoppingCart, TrendingUp, CreditCard, Boxes } from "lucide-react";
import { getServerSession } from "@/services/session-service";
import { listPurchaseOrders } from "@/services/purchase-order-service";
import { listDeliveries } from "@/services/delivery-service";
// Note: Other pending types like PR, Expenses, Invoices could be added here

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getServerSession();

  // Fetch pending items across modules
  const [pos] = await Promise.all([
    listPurchaseOrders(session, { status: "submitted", limit: 10 }),
  ]);

  const pendingCount = (pos.data?.length || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pusat Persetujuan (Approval Center)
            </h1>
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
              {pendingCount} Menunggu
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Daftar seluruh dokumen yang memerlukan otorisasi Anda sebelum diproses lebih lanjut.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Purchase Orders */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                Pesanan Beli (PO)
              </CardTitle>
              <Badge variant={pos.data?.length ? "destructive" : "outline"} className="text-[10px]">
                {pos.data?.length || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {pos.data?.length ? (
              <p>Ada {pos.data.length} PO yang menunggu persetujuan harga dan supplier.</p>
            ) : (
              <p>Tidak ada PO yang memerlukan persetujuan saat ini.</p>
            )}
            <a href="/dashboard/purchasing/orders?status=submitted" className="mt-3 block text-blue-600 font-semibold hover:underline">
              Buka Modul PO &rarr;
            </a>
          </CardContent>
        </Card>

        {/* Other modules placeholders */}
        <Card className="opacity-60 bg-slate-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-400">
                <CreditCard className="w-4 h-4" />
                Pengeluaran Biaya
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">0</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-slate-400 italic">
            Fitur persetujuan biaya terpusat segera hadir.
          </CardContent>
        </Card>

        <Card className="opacity-60 bg-slate-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-400">
                <Boxes className="w-4 h-4" />
                Penyesuaian Stok
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">0</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-slate-400 italic">
            Otorisasi koreksi stok gudang segera hadir.
          </CardContent>
        </Card>
      </div>

      <div className="bg-white border rounded-xl p-8 text-center space-y-3 shadow-sm border-dashed">
        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
          <CheckSquare className="w-6 h-6 text-slate-300" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Semua Terkendali</h3>
          <p className="text-xs text-slate-400">Selesaikan persetujuan untuk menjaga integritas data dan rantai pasokan.</p>
        </div>
      </div>
    </div>
  );
}
