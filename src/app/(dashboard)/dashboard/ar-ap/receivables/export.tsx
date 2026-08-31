"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: unknown) => formatCurrency(v as number | string | null | undefined);

const COLUMNS = [
  { header: "No. Invoice", key: "invoice_no", align: "left" as const },
  { header: "Pelanggan", key: "customer_name", align: "left" as const },
  { header: "Tanggal Tagihan", key: "invoice_date", align: "left" as const },
  { header: "Jatuh Tempo", key: "due_date", align: "left" as const },
  { header: "Total Tagihan", key: "amount", align: "right" as const, format: fmt },
  { header: "Sisa Piutang", key: "balance", align: "right" as const, format: fmt },
  { header: "Status", key: "status", align: "center" as const },
];

export function ReceivablesExport({ receivables }: { receivables: any[] }) {
  const rows: Record<string, unknown>[] = receivables.map((r) => ({
    invoice_no: r.invoice_number ?? r.invoice_no ?? "",
    customer_name: r.customer_name ?? "",
    invoice_date: r.invoice_date ?? "",
    due_date: r.due_date ?? "",
    amount: r.total_amount ?? r.amount ?? 0,
    balance: r.remaining_balance ?? r.balance ?? 0,
    status: r.status ?? "",
  }));

  return (
    <ExportButtons
      rows={rows}
      columns={COLUMNS}
      filename="piutang_usaha_ar"
      title="Laporan Piutang Usaha (Accounts Receivable)"
      subtitle="Daftar tagihan berjalan kepada pelanggan — SILETE"
    />
  );
}
