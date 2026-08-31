import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Boxes,
  Users,
  Wallet,
  Building,
  CreditCard,
  Receipt,
  PiggyBank,
  CheckCircle2,
  TrendingDown,
  Building2,
} from "lucide-react";
import { getServerSession } from "@/services/session-service";
import {
  getExecutiveDashboardSummary,
  getFinancialTrendData,
  getInventoryCompositionData
} from "@/services/report-service";
import { listDocumentationAttachments } from "@/services/attachment-service";
import { formatCurrency, getPublicPath } from "@/lib/utils";
import { Camera, ArrowRight, PlusCircle, FilePlus, UserPlus } from "lucide-react";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession();
  const summary = await getExecutiveDashboardSummary(session);
  const trendData = await getFinancialTrendData(session);
  const inventoryData = await getInventoryCompositionData(session);
  const recentDocs = await listDocumentationAttachments(session);
  const displayDocs = recentDocs.slice(0, 4);

  const stats = [
    {
      title: "Total Pendapatan (Revenue)",
      value: formatCurrency(summary.revenue),
      subtext: "Sumber: GL Pendapatan",
      icon: TrendingUp,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      title: "Total Beban (Expense)",
      value: formatCurrency(summary.expense),
      subtext: "Sumber: GL Beban Operasional",
      icon: TrendingDown,
      color: "text-rose-600 bg-rose-50",
    },
    {
      title: "Laba / (Rugi) Bersih",
      value: formatCurrency(summary.net_profit_loss),
      subtext: summary.net_profit_loss >= 0 ? "Surplus Finansial" : "Defisit Operasional",
      icon: PiggyBank,
      color: summary.net_profit_loss >= 0 ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50",
    },
    {
      title: "Saldo Kas & Bank",
      value: formatCurrency(summary.cash_balance + summary.bank_balance),
      subtext: `Kas: ${formatCurrency(summary.cash_balance)} | Bank: ${formatCurrency(summary.bank_balance)}`,
      icon: Wallet,
      color: "text-blue-600 bg-blue-50",
    },
    {
      title: "Piutang Usaha (AR)",
      value: formatCurrency(summary.ar_outstanding),
      subtext: "Tagihan Berjalan Terbuka",
      icon: Receipt,
      color: "text-amber-600 bg-amber-50",
    },
    {
      title: "Hutang Usaha (AP)",
      value: formatCurrency(summary.ap_outstanding),
      subtext: "Kewajiban Pemasok Terbuka",
      icon: CreditCard,
      color: "text-orange-600 bg-orange-50",
    },
    {
      title: "Valuasi Persediaan (Stock)",
      value: formatCurrency(summary.inventory_valuation),
      subtext: `${summary.total_products} Master Produk Terdaftar`,
      icon: Boxes,
      color: "text-purple-600 bg-purple-50",
    },
    {
      title: "Relasi Bisnis (Mitra)",
      value: `${summary.total_customers + summary.total_suppliers} Mitra`,
      subtext: `${summary.total_customers} Pelanggan / ${summary.total_suppliers} Pemasok`,
      icon: Users,
      color: "text-indigo-600 bg-indigo-50",
    },
  ];

  const quickActions = [
    { title: "Buat Faktur Jual", icon: FilePlus, href: "/dashboard/sales/invoices", color: "bg-blue-600" },
    { title: "Input Pengeluaran", icon: PlusCircle, href: "/dashboard/finance/expenses", color: "bg-rose-600" },
    { title: "Tambah Produk", icon: Boxes, href: "/dashboard/master/products", color: "bg-indigo-600" },
    { title: "Mitra Baru", icon: UserPlus, href: "/dashboard/master/customers", color: "bg-emerald-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Executive Intelligence
            </h1>
            <Badge variant="success" className="text-[10px] py-0 px-2 rounded-full font-bold">
              SILETE ENGINE 1.0
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Sistem terintegrasi untuk posisi keuangan dan manajemen operasional multi-cabang.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200">
            <Building className="w-3.5 h-3.5" />
            <span>Unit: Perusahaan #{summary.company_id}</span>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 border-l-4 border-l-transparent hover:border-l-indigo-600">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-slate-900 font-mono tracking-tight">{stat.value}</div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">
                  {stat.subtext}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action, idx) => (
          <Link
            key={idx}
            href={action.href}
            className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-600 hover:shadow-md transition-all group"
          >
            <div className={`p-2 rounded-lg ${action.color} text-white shadow-sm`}>
              <action.icon className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800">{action.title}</span>
              <span className="text-[10px] text-slate-400 group-hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors">
                Luncurkan <ArrowRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Analytical Content */}
      <DashboardCharts
        trendData={trendData}
        inventoryData={inventoryData}
      />

      {/* Documentation & Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b border-slate-100">
            <div>
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600" />
                Audit Documentation Log
              </CardTitle>
            </div>
            <Link href="/documentation" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider">Arsip Lengkap &rarr;</Link>
          </CardHeader>
          <CardContent className="pt-6">
            {displayDocs.length === 0 ? (
              <div className="py-12 text-center bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-100">
                <p className="text-xs text-slate-400 font-medium italic">Belum ada lampiran audit baru yang diunggah.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {displayDocs.map((doc) => (
                  <div key={doc.id} className="group relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                    <img
                      src={getPublicPath(doc.file_path)}
                      alt={doc.file_name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                      <span className="text-[9px] text-white font-bold uppercase tracking-widest">{doc.category}</span>
                      <span className="text-[8px] text-indigo-200 truncate">{doc.file_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-emerald-600" />
              Laporan Akses Cepat
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              <Link href="/dashboard/accounting/trial-balance" className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">Trial Balance</span>
                  <span className="text-[10px] text-slate-400 font-medium">Posisi neraca saldo akun</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
              </Link>
              <Link href="/dashboard/accounting/journals" className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">General Journal</span>
                  <span className="text-[10px] text-slate-400 font-medium">Buku jurnal transaksi harian</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
              </Link>
              <Link href="/dashboard/ar-ap/receivables" className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">Aging Report</span>
                  <span className="text-[10px] text-slate-400 font-medium">Umur piutang & hutang usaha</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Integrity Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-emerald-900">Double-Entry Balance</span>
              <span className="text-[10px] text-emerald-600 font-medium">Semua jurnal seimbang</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-200 font-bold uppercase">SECURE</Badge>
        </div>

        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-blue-900">Subledger Linked</span>
              <span className="text-[10px] text-blue-600 font-medium">Sinkronisasi AR/AP/Gudang</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white text-blue-700 border-blue-200 font-bold uppercase">SYNCED</Badge>
        </div>

        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-900">Period Lock Control</span>
              <span className="text-[10px] text-indigo-600 font-medium">Periode aktif terkendali</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white text-indigo-700 border-indigo-200 font-bold uppercase">LOCKED</Badge>
        </div>
      </div>
    </div>
  );
}
