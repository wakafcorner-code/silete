/**
 * ERP Manajemen — Business Analysis Service (Timah Specific)
 *
 * Provides data for the "Analisa Usaha Pembelian Timah" report.
 */

import { query } from "@/lib/db";
import { UserSessionPayload } from "@/services/session-service";
import { resolveCompanyScope } from "@/services/company-context-service";

export interface AnalysisSectionA {
  hari: string;
  tanggal: string;
  wilayah: string;
  kg: number;
  oc: number;
  point: number;
  harga_beli: number;
  modal: number;
  harga_jual: number;
  total_jual: number;
  laba_kotor: number;
  kadar_akhir: number;
  pajak: number;
}

export interface AnalysisSectionB {
  uraian: string;
  volume: number;
  satuan: string;
  harga_satuan: number;
  jumlah: number;
}

export interface AnalysisReportData {
  companyName: string;
  monthYear: string;
  totalTon: number;
  sectionA: AnalysisSectionA[];
  sectionB: AnalysisSectionB[];
  summary: {
    totalBeli: number;
    totalOperasional: number;
    totalPajak: number;
    totalJual: number;
    labaBersih: number;
  };
}

export async function getTimahAnalysisReport(
  session: UserSessionPayload | null,
  month: number,
  year: number,
  requestedCompanyId?: number | string | null
): Promise<AnalysisReportData> {
  const companyId = await resolveCompanyScope(session, requestedCompanyId);

  // 1. Fetch Company Name
  const comp = await query<{ name: string }[]>("SELECT name FROM companies WHERE id = ?", [companyId]);
  const companyName = comp[0]?.name || "SILETE ERP";

  // 2. Fetch Section A (Procurement Data)
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const dateTo = `${year}-${String(month).padStart(2, '0')}-31`;

  const procRows = await query<any[]>(
    `SELECT
      DAYNAME(po.order_date) as hari,
      po.order_date as tanggal,
      pi.production_region as wilayah,
      pi.quantity as kg,
      pi.oc,
      pi.unit_price as harga_beli,
      pi.target_price as harga_jual
     FROM purchase_items pi
     JOIN purchase_orders po ON pi.purchase_order_id = po.id
     WHERE po.company_id = ?
       AND po.order_date >= ?
       AND po.order_date <= ?
       AND po.status IN ('approved', 'received', 'closed')
     ORDER BY po.order_date ASC`,
    [companyId, dateFrom, dateTo]
  );

  const dayMap: Record<string, string> = {
    'Monday': 'SENIN', 'Tuesday': 'SELASA', 'Wednesday': 'RABU',
    'Thursday': 'KAMIS', 'Friday': 'JUMAT', 'Saturday': 'SABTU', 'Sunday': 'MINGGU'
  };

  const sectionA: AnalysisSectionA[] = procRows.map(r => {
    const kg = Number(r.kg);
    const oc = Number(r.oc || 0);
    const point = (kg * oc) / 100; // Example calculation
    const modal = kg * Number(r.harga_beli);
    const hargaJual = Number(r.harga_jual || 0);
    const totalJual = kg * hargaJual;
    const labaKotor = totalJual - modal;
    const pajak = labaKotor * 0.03; // 3% as per image

    return {
      hari: dayMap[r.hari] || r.hari,
      tanggal: new Date(r.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }).toUpperCase(),
      wilayah: r.wilayah || "-",
      kg,
      oc,
      point,
      harga_beli: Number(r.harga_beli),
      modal,
      harga_jual: hargaJual,
      total_jual: totalJual,
      laba_kotor: labaKotor,
      kadar_akhir: oc,
      pajak
    };
  });

  // 3. Fetch Section B (Expenses)
  const expRows = await query<any[]>(
    `SELECT
      description as uraian,
      1 as volume,
      'PAKET' as satuan,
      amount as harga_satuan,
      amount as jumlah
     FROM expenses
     WHERE company_id = ?
       AND expense_date >= ?
       AND expense_date <= ?
       AND status IN ('approved', 'paid')`,
    [companyId, dateFrom, dateTo]
  );

  const sectionB: AnalysisSectionB[] = expRows.map(r => ({
    uraian: r.uraian,
    volume: Number(r.volume),
    satuan: r.satuan,
    harga_satuan: Number(r.harga_satuan),
    jumlah: Number(r.jumlah)
  }));

  // 4. Summaries
  const totalKg = sectionA.reduce((sum, item) => sum + item.kg, 0);
  const totalBeli = sectionA.reduce((sum, item) => sum + item.modal, 0);
  const totalJual = sectionA.reduce((sum, item) => sum + item.total_jual, 0);
  const totalLabaKotor = totalJual - totalBeli;
  const totalPajak = sectionA.reduce((sum, item) => sum + item.pajak, 0);
  const totalOperasional = sectionB.reduce((sum, item) => sum + item.jumlah, 0);

  const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

  return {
    companyName,
    monthYear: `${monthNames[month - 1]} ${year}`,
    totalTon: totalKg / 1000,
    sectionA,
    sectionB,
    summary: {
      totalBeli,
      totalOperasional,
      totalPajak,
      totalJual,
      labaBersih: totalLabaKotor - totalOperasional - totalPajak
    }
  };
}
