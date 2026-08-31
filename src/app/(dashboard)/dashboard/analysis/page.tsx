import React from "react";
import { getServerSession } from "@/services/session-service";
import { getTimahAnalysisReport } from "@/services/analysis-service";
import { formatCurrency } from "@/lib/utils";
import { Printer, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function BusinessAnalysisReportPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const params = await searchParams;
  const session = await getServerSession();
  const now = new Date();
  const month = Number(params.month || now.getMonth() + 1);
  const year = Number(params.year || now.getFullYear());

  const data = await getTimahAnalysisReport(session, month, year);

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto bg-white p-10 border shadow-sm print:p-0 print:border-0 print:shadow-none min-h-[1200px]">
      {/* Header */}
      <div className="text-center space-y-1 mb-8">
        <h1 className="text-lg font-black uppercase underline decoration-2 underline-offset-4">Analisa Usaha Pembelian Timah</h1>
        <p className="text-base font-bold uppercase">{data.companyName}</p>
        <p className="text-sm font-bold">BULAN : {data.monthYear}</p>
        <p className="text-sm font-bold">TOTAL : {data.totalTon.toFixed(2)} TON</p>
      </div>

      <div className="flex justify-end gap-2 mb-4 print:hidden">
        <Button variant="outline" size="sm" className="h-8 gap-2 border-emerald-300 text-emerald-700">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export Excel
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-2 border-blue-300 text-blue-700" onClick={() => {}}>
          <Printer className="w-3.5 h-3.5" />
          Cetak Laporan
        </Button>
      </div>

      {/* Section A */}
      <div className="space-y-0.5">
        <div className="bg-[#b7e1cd] border border-black px-2 py-1 inline-block">
          <h2 className="text-[11px] font-black text-slate-800">A. PRODUKSI DAN PENERIMAAN</h2>
        </div>
        <table className="w-full border-collapse border border-black text-[10px]">
          <thead>
            <tr className="bg-slate-50 font-bold uppercase">
              <th className="border border-black p-1 w-[8%]">Hari</th>
              <th className="border border-black p-1 w-[10%]">TGL</th>
              <th className="border border-black p-1 w-[12%]">Wilayah Produksi</th>
              <th className="border border-black p-1 w-[8%] text-right">KG</th>
              <th className="border border-black p-1 w-[6%] text-center">OC</th>
              <th className="border border-black p-1 w-[8%] text-right">Point</th>
              <th className="border border-black p-1 w-[8%] text-right">Harga</th>
              <th className="border border-black p-1 w-[10%] text-right">Modal</th>
              <th className="border border-black p-1 w-[8%] text-right">Harga Jual</th>
              <th className="border border-black p-1 w-[10%] text-right">Total</th>
              <th className="border border-black p-1 w-[10%] text-right">Laba Kotor</th>
              <th className="border border-black p-1 w-[6%] text-center">Kadar Akhir</th>
              <th className="border border-black p-1 w-[10%] text-right">Pajak (3%)</th>
            </tr>
          </thead>
          <tbody>
            {data.sectionA.map((row, idx) => (
              <tr key={idx}>
                <td className="border border-black p-1 text-center">{row.hari}</td>
                <td className="border border-black p-1 text-center">{row.tanggal}</td>
                <td className="border border-black p-1 uppercase">{row.wilayah}</td>
                <td className="border border-black p-1 text-right font-medium">{row.kg.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-center">{row.oc.toFixed(2)}</td>
                <td className="border border-black p-1 text-right">{row.point.toLocaleString('id-ID', { minimumFractionDigits: 3 })}</td>
                <td className="border border-black p-1 text-right">{row.harga_beli.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-right">{row.modal.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-right">{row.harga_jual.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-right">{row.total_jual.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-right">{row.laba_kotor.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-center">{row.kadar_akhir.toFixed(2)}</td>
                <td className="border border-black p-1 text-right"></td>
              </tr>
            ))}
            {/* Total Row A */}
            <tr className="bg-slate-50 font-black">
              <td colSpan={3} className="border border-black p-1 text-center">TOTAL</td>
              <td className="border border-black p-1 text-right">{(data.totalTon * 1000).toLocaleString('id-ID')}</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 text-right">{data.sectionA.reduce((s,i) => s + i.point, 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 text-right">{data.summary.totalBeli.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 text-right">{data.summary.totalJual.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1 text-right bg-red-100">{ (data.summary.totalJual - data.summary.totalBeli).toLocaleString('id-ID') }</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 text-right bg-amber-100">{data.summary.totalPajak.toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section B */}
      <div className="space-y-0.5 mt-10 w-[60%]">
        <div className="bg-[#c9daf8] border border-black px-2 py-1 inline-block">
          <h2 className="text-[11px] font-black text-slate-800">B. TENAGA KERJA DAN OPERASIONAL</h2>
        </div>
        <table className="w-full border-collapse border border-black text-[10px]">
          <thead>
            <tr className="bg-slate-50 font-bold uppercase">
              <th className="border border-black p-1 w-10">NO</th>
              <th className="border border-black p-1 text-left">URAIAN</th>
              <th className="border border-black p-1 w-20 text-center">VOLUME</th>
              <th className="border border-black p-1 w-20 text-left">SATUAN</th>
              <th className="border border-black p-1 w-32 text-right">HARGA SATUAN</th>
              <th className="border border-black p-1 w-32 text-right">JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            {data.sectionB.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-black p-4 text-center text-slate-400 italic font-medium">Belum ada data biaya operasional yang diposting bulan ini.</td>
              </tr>
            ) : data.sectionB.map((row, idx) => (
              <tr key={idx}>
                <td className="border border-black p-1 text-center">{idx + 1}</td>
                <td className="border border-black p-1 uppercase">{row.uraian}</td>
                <td className="border border-black p-1 text-center">{row.volume}</td>
                <td className="border border-black p-1 uppercase">{row.satuan}</td>
                <td className="border border-black p-1 text-right">{row.harga_satuan.toLocaleString('id-ID')}</td>
                <td className="border border-black p-1 text-right font-medium">{row.jumlah.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {/* Total Row B */}
            <tr className="bg-[#b6d7a8] font-black">
              <td colSpan={5} className="border border-black p-1 text-left uppercase">TOTAL</td>
              <td className="border border-black p-1 text-right">{data.summary.totalOperasional.toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section C */}
      <div className="space-y-0.5 mt-10 w-[50%]">
        <div className="bg-[#b7e1cd] border border-black px-2 py-1 inline-block">
          <h2 className="text-[11px] font-black text-slate-800">C. PENERIMAAN BERSIH</h2>
        </div>
        <table className="w-full border-collapse border border-black text-[10px]">
          <thead>
            <tr className="bg-slate-50 font-bold uppercase text-center">
              <th className="border border-black p-1 w-10" rowSpan={2}>NO</th>
              <th className="border border-black p-1" rowSpan={2}>URAIAN</th>
              <th className="border border-black p-1" colSpan={2}>JUMLAH</th>
              <th className="border border-black p-1" rowSpan={2}>SALDO</th>
            </tr>
            <tr className="bg-slate-50 font-bold uppercase text-center">
              <th className="border border-black p-1 w-32">DEBIT</th>
              <th className="border border-black p-1 w-32">KREDIT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black p-1 text-center">1</td>
              <td className="border border-black p-1 font-bold">PEMBELIAN TIMAH</td>
              <td className="border border-black p-1 text-right font-medium">{data.summary.totalBeli.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1 bg-slate-50"></td>
              <td className="border border-black p-1 text-right font-medium">{data.summary.totalBeli.toLocaleString('id-ID')}</td>
            </tr>
            <tr>
              <td className="border border-black p-1 text-center">2</td>
              <td className="border border-black p-1 font-bold leading-tight">BIAYA OP DAN TENAGA KERJA</td>
              <td className="border border-black p-1 text-right font-medium">{data.summary.totalOperasional.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1 bg-slate-50"></td>
              <td className="border border-black p-1 text-right font-medium">{(data.summary.totalBeli + data.summary.totalOperasional).toLocaleString('id-ID')}</td>
            </tr>
            <tr>
              <td className="border border-black p-1 text-center">3</td>
              <td className="border border-black p-1 font-bold">PAJAK</td>
              <td className="border border-black p-1 text-right font-medium">{data.summary.totalPajak.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1 bg-slate-50"></td>
              <td className="border border-black p-1 text-right font-medium">{(data.summary.totalBeli + data.summary.totalOperasional + data.summary.totalPajak).toLocaleString('id-ID')}</td>
            </tr>
            <tr>
              <td className="border border-black p-1 text-center">4</td>
              <td className="border border-black p-1 font-bold">PENJUALAN TIMAH</td>
              <td className="border border-black p-1 bg-slate-50"></td>
              <td className="border border-black p-1 text-right font-medium">{data.summary.totalJual.toLocaleString('id-ID')}</td>
              <td className="border border-black p-1"></td>
            </tr>
            <tr className="bg-[#93c47d] font-black">
              <td colSpan={2} className="border border-black p-1 text-left uppercase">LABA BERSIH</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 text-right underline decoration-double underline-offset-2">{data.summary.labaBersih.toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Floating Watermark for UI */}
      <div className="text-[60px] font-black text-slate-100 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 pointer-events-none select-none opacity-20 print:hidden">
        SILETE ERP ANALYSIS
      </div>
    </div>
  );
}
