"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: unknown) => formatCurrency(v as number | string | null | undefined);

const COLUMNS = [
  { header: "No. Jurnal", key: "journal_no", align: "left" as const },
  { header: "Tanggal", key: "entry_date", align: "left" as const },
  { header: "Keterangan", key: "description", align: "left" as const },
  { header: "Tipe", key: "journal_type", align: "left" as const },
  { header: "Status", key: "status", align: "center" as const },
  { header: "Total Debit", key: "total_debit", align: "right" as const, format: fmt },
  { header: "Total Credit", key: "total_credit", align: "right" as const, format: fmt },
];

export function JournalsExport({ journals }: { journals: any[] }) {
  const rows: Record<string, unknown>[] = journals.map((j) => ({
    journal_no: j.journal_no ?? j.journal_number ?? "",
    entry_date: j.entry_date ?? j.posted_at ?? "",
    description: j.description ?? "",
    journal_type: j.journal_type ?? j.type ?? "",
    status: j.status ?? "",
    total_debit: j.total_debit ?? 0,
    total_credit: j.total_credit ?? 0,
  }));

  return (
    <ExportButtons
      rows={rows}
      columns={COLUMNS}
      filename="jurnal_umum"
      title="Jurnal Umum (Journal Entries)"
      subtitle="Semua jurnal double-entry — SILETE"
    />
  );
}
