"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: unknown) => formatCurrency(v as number | string | null | undefined);

const COLUMNS = [
  { header: "No. Faktur Pemasok", key: "invoice_no", align: "left" as const },
  { header: "Pemasok", key: "supplier_name", align: "left" as const },
  { header: "Tanggal Tagihan", key: "invoice_date", align: "left" as const },
  { header: "Jatuh Tempo", key: "due_date", align: "left" as const },
  { header: "Total Hutang", key: "amount", align: "right" as const, format: fmt },
  { header: "Sisa Hutang", key: "balance", align: "right" as const, format: fmt },
  { header: "Status", key: "status", align: "center" as const },
];

export function PayablesExport({ payables }: { payables: any[] }) {
  const rows: Record<string, unknown>[] = payables.map((p) => ({
    invoice_no: p.invoice_number ?? p.invoice_no ?? "",
    supplier_name: p.supplier_name ?? "",
    invoice_date: p.invoice_date ?? "",
    due_date: p.due_date ?? "",
    amount: p.total_amount ?? p.amount ?? 0,
    balance: p.remaining_balance ?? p.balance ?? 0,
    status: p.status ?? "",
  }));

  return (
    <ExportButtons
      rows={rows}
      columns={COLUMNS}
      filename="hutang_usaha_ap"
      title="Laporan Hutang Usaha (Accounts Payable)"
      subtitle="Daftar kewajiban hutang berjalan kepada pemasok — SILETE"
    />
  );
}
